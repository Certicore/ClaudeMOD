/**
 * The plans the band draws: one per name, each a count of steps done over a
 * total, kept as plain JSON so `$.store` holds them as they are.
 */
export type Plan = {
  /** The store's name for the plan: `idOf(name)`. */
  id: string
  /** The row's label, as the model reported it. */
  name: string
  /** Steps completed so far; never more than `total`. */
  step: number
  /** Steps in all; at least 1. */
  total: number
  /** What the current step is, when the model said; null when it did not. */
  note: string | null
  /** When the plan was first reported, milliseconds since the epoch. */
  createdAt: number
  /** When the plan was last reported. */
  updatedAt: number
  /**
   * A message the person sent while Claude was busy, waiting its turn: a row
   * of its own until Claude takes it up (a report with `queued`) or the turn
   * ends; `owner` is the session it was sent in, which clears it.
   */
  waiting?: { owner: string }
}

/** What one `report_progress` call asks, once its input is read. */
export type Report = {
  name: string
  step?: number
  total?: number
  note?: string
  isDone: boolean
  isRemoved: boolean
  /** The plan takes up the oldest message waiting its turn: that row turns into it. */
  isQueued: boolean
}

/** Why a `report_progress` input was refused. */
export type ReportError = {
  error: string
}

/**
 * Every plan is stored under its own key, `plan:<folder>:<id>`: the store is
 * shared by every session on the machine, so the folder keeps one project's
 * plans out of another's band, and the id keeps two plans apart. A key of
 * the first release, `plan:<id>`, belongs to no folder (a legacy key).
 */
export const STORE_PREFIX = 'plan:'

const NAME_MAX = 80
const NOTE_MAX = 120
const ID_MAX = 48

/**
 * The store's name for a plan: the name without its accents, lowercased,
 * runs of anything but a letter or digit folded to one dash, at most ID_MAX
 * characters.
 */
export function idOf(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, ID_MAX)
    .replace(/-+$/g, '')

  return slug === '' ? 'plan' : slug
}

/** The store key of plan `id` in `folder` (a `folderKeyOf`). */
export function keyOf(folder: string, id: string): string {
  return `${STORE_PREFIX}${folder}:${id}`
}

/** The key a plan had before plans were kept per folder. */
export function legacyKeyOf(id: string): string {
  return STORE_PREFIX + id
}

/** What a store key holds: one folder's plan, a legacy plan of no folder, or something else. */
export function parseKey(key: string): { folder: string; id: string } | { legacy: string } | null {
  if (!key.startsWith(STORE_PREFIX)) {
    return null
  }

  const rest = key.slice(STORE_PREFIX.length)
  const colon = rest.lastIndexOf(':')

  return colon === -1 ? { legacy: rest } : { folder: rest.slice(0, colon), id: rest.slice(colon + 1) }
}

/**
 * A folder's name in the store: its last segment as a slug (readable when
 * one looks at the file) and a hash of the whole path (two `app` folders
 * stay apart), as `claudemod-3f9a1c2e`.
 */
export function folderKeyOf(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, '')
  const base = trimmed.split(/[\\/]/).pop() ?? ''
  let h = 0x811c9dc5

  for (const char of trimmed) {
    h = Math.imul(h ^ (char.codePointAt(0) ?? 0), 0x01000193)
  }

  const slug = idOf(base).slice(0, 24)

  return `${slug}-${(h >>> 0).toString(16).padStart(8, '0')}`
}

/** True when `value` read back from the store is a plan as `Plan` spells it. */
export function isPlan(value: unknown): value is Plan {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const plan = value as Record<string, unknown>

  return (
    typeof plan.id === 'string' &&
    typeof plan.name === 'string' &&
    isCount(plan.step) &&
    isCount(plan.total) &&
    plan.total >= 1 &&
    (plan.note === null || typeof plan.note === 'string') &&
    typeof plan.createdAt === 'number' &&
    typeof plan.updatedAt === 'number' &&
    (plan.waiting === undefined || (typeof plan.waiting === 'object' && plan.waiting !== null && typeof (plan.waiting as { owner?: unknown }).owner === 'string'))
  )
}

/** True for a message waiting its turn rather than a plan. */
export function isWaiting(plan: Pick<Plan, 'waiting'>): boolean {
  return plan.waiting !== undefined
}

/** How long a waiting row outlives a session that never cleared it (a crash): then it is dropped on load. */
export const WAITING_STALE_MS = 6 * 3_600_000

const EXCERPT_MAX = 56

/** A waiting row's name: the message's first line, its spaces folded, cut at EXCERPT_MAX with an ellipsis. */
export function excerptOf(text: string): string {
  const line = text.split('\n').map(each => each.trim()).find(each => each !== '') ?? ''
  const folded = [...line.replace(/\s+/g, ' ')]

  return folded.length > EXCERPT_MAX ? `${folded.slice(0, EXCERPT_MAX - 1).join('').trimEnd()}…` : folded.join('')
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

/** The plan's completion, 0 to 100, rounded. */
export function percentOf(plan: Pick<Plan, 'step' | 'total'>): number {
  if (plan.total <= 0) {
    return 0
  }

  if (plan.step >= plan.total) {
    return 100
  }

  return Math.max(0, Math.min(99, Math.round((plan.step / plan.total) * 100)))
}

export function isDone(plan: Pick<Plan, 'step' | 'total'>): boolean {
  return plan.step >= plan.total
}

/**
 * Reads a `report_progress` call's arguments: the name is required and
 * bounded, `step` and `total` are integers when given, `done` and `remove`
 * are booleans when given.
 */
export function reportOf(input: Record<string, unknown>): Report | ReportError {
  const rawName = input.plan

  if (typeof rawName !== 'string' || rawName.trim() === '') {
    return { error: '"plan" is required: the plan\'s name, a non-empty string' }
  }

  const name = rawName.trim().replace(/\s+/g, ' ').slice(0, NAME_MAX)
  const report: Report = {
    name,
    isDone: input.done === true,
    isRemoved: input.remove === true,
    isQueued: input.queued === true,
  }

  if (input.step !== undefined) {
    if (!isCount(input.step)) {
      return { error: '"step" must be an integer of 0 or more' }
    }

    report.step = input.step
  }

  if (input.total !== undefined) {
    if (!isCount(input.total) || input.total < 1) {
      return { error: '"total" must be an integer of 1 or more' }
    }

    report.total = input.total
  }

  if (input.note !== undefined && input.note !== null) {
    if (typeof input.note !== 'string') {
      return { error: '"note" must be a string' }
    }

    const note = input.note.trim().replace(/\s+/g, ' ').slice(0, NOTE_MAX)

    if (note !== '') {
      report.note = note
    }
  }

  if (input.done !== undefined && typeof input.done !== 'boolean') {
    return { error: '"done" must be true or false' }
  }

  if (input.remove !== undefined && typeof input.remove !== 'boolean') {
    return { error: '"remove" must be true or false' }
  }

  if (input.queued !== undefined && typeof input.queued !== 'boolean') {
    return { error: '"queued" must be true or false' }
  }

  return report
}

/**
 * The plan after a report: a new one needs `total`; an existing one keeps
 * what the report leaves out; `done` sets the step to the total; a step over
 * the total is clamped; a note of `""` clears the one kept.
 */
export function applied(
  previous: Plan | undefined,
  report: Report,
  now: number,
): Plan | ReportError {
  const total = report.total ?? previous?.total

  if (total === undefined) {
    return {
      error: `"total" is required the first time a plan is reported ("${report.name}" is new)`,
    }
  }

  const reportedStep = report.step ?? previous?.step ?? 0
  const step = report.isDone ? total : Math.min(reportedStep, total)
  const note = report.isDone ? null : (report.note ?? previous?.note ?? null)

  return {
    id: previous?.id ?? idOf(report.name),
    name: report.name,
    step,
    total,
    note,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
  }
}

/** The plans in the order they were first reported. */
export function sortedPlans(plans: Iterable<Plan>): Plan[] {
  return [...plans].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
}

/** One line for a plan: `name: 3/5 (60%)`, `done` when finished, the note after; `name: waiting` for a waiting message. */
export function summaryOf(plan: Plan): string {
  if (isWaiting(plan)) {
    return `${plan.name}: waiting`
  }

  const state = isDone(plan) ? 'done' : `${percentOf(plan)}%`
  const note = plan.note === null ? '' : ` — ${plan.note}`

  return `${plan.name}: ${plan.step}/${plan.total} (${state})${note}`
}

/** How many characters of the note the bar's chip shows. */
export const CHIP_LABEL_MAX = 18

/**
 * What the chip riding the bar's head says: the current stage (the note,
 * cut to CHIP_LABEL_MAX) and the step under way, `Done` once finished.
 * At 2 of 5 done the step under way is the 3rd, so the chip reads `3/5`.
 */
export function chipOf(plan: Pick<Plan, 'step' | 'total' | 'note'>): { label: string; count: string } {
  if (isDone(plan)) {
    return { label: 'Done', count: `${plan.total}/${plan.total}` }
  }

  const note = plan.note ?? 'Step'
  const label = [...note].length > CHIP_LABEL_MAX ? `${[...note].slice(0, CHIP_LABEL_MAX - 1).join('').trimEnd()}…` : note

  return { label, count: `${Math.min(plan.step + 1, plan.total)}/${plan.total}` }
}
