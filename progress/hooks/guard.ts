import type { Quota } from './usage'

/**
 * The limits the person set, per window: pause the work once that window
 * has this many percent left or fewer. A window with no entry has no limit.
 */
export type Limits = Partial<Record<string, number>>

/** The windows a limit can be set on. */
export const LIMIT_KINDS = ['five_hour', 'seven_day'] as const

/** The picker's range and step, in percent left, and where it starts when the window has no limit yet. */
export const LIMIT_MIN = 5
export const LIMIT_MAX = 90
export const LIMIT_STEP = 5
export const LIMIT_START = 25

/** A picker value moved by `delta` steps, kept in range and on the grid. */
export function nudgedLimit(value: number, delta: number): number {
  const stepped = Math.round(value / LIMIT_STEP) * LIMIT_STEP + delta * LIMIT_STEP

  return Math.max(LIMIT_MIN, Math.min(LIMIT_MAX, stepped))
}

/**
 * The work stopped at a limit: which window, at what level, and where the
 * pause stands: `alert` waits for the person's choice, `waiting` waits for
 * the window to reset after a save.
 */
export type Pause = {
  kind: string
  label: string
  /** The limit that was reached, in percent left. */
  limit: number
  /** What was left of the window when the pause began. */
  remaining: number
  /** When the window resets, milliseconds since the epoch, when the engine said. */
  resetsAt?: number
  /** When the pause began. */
  since: number
  /** Whether a turn was running and got stopped, so resuming has work to pick up. */
  hasInterrupted: boolean
  phase: 'alert' | 'waiting'
}

/** What a folder keeps of the guard between sessions: the pause, and the windows resumed past their limit. */
export type GuardState = {
  pause: Pause | null
  /** Per window, the reset time of the window the person chose to go on in. */
  acknowledged: Record<string, number>
}

/** A limit as the person typed it: `20`, `20%`, ` 7 % ` → a whole percent from 1 to 99; anything else null. */
export function parseLimit(text: string): number | null {
  const match = /^\s*(\d{1,2}(?:[.,]\d+)?)\s*%?\s*$/.exec(text)

  if (match === null) {
    return null
  }

  const value = Math.round(Number((match[1] ?? '').replace(',', '.')))

  return value >= 1 && value <= 99 ? value : null
}

/** The limits read back from the store: only the two windows, only whole percents from 1 to 99. */
export function limitsOf(value: unknown): Limits {
  const limits: Limits = {}

  if (typeof value !== 'object' || value === null) {
    return limits
  }

  for (const kind of LIMIT_KINDS) {
    const limit = (value as Record<string, unknown>)[kind]

    if (typeof limit === 'number' && Number.isInteger(limit) && limit >= 1 && limit <= 99) {
      limits[kind] = limit
    }
  }

  return limits
}

/** The guard state read back from the store; a missing or damaged one is no pause and nothing acknowledged. */
export function guardStateOf(value: unknown): GuardState {
  const state: GuardState = { pause: null, acknowledged: {} }

  if (typeof value !== 'object' || value === null) {
    return state
  }

  const record = value as Record<string, unknown>
  const pause = record.pause as Record<string, unknown> | null | undefined

  if (
    pause !== null &&
    typeof pause === 'object' &&
    typeof pause.kind === 'string' &&
    typeof pause.label === 'string' &&
    typeof pause.limit === 'number' &&
    typeof pause.remaining === 'number' &&
    typeof pause.since === 'number' &&
    (pause.phase === 'alert' || pause.phase === 'waiting')
  ) {
    state.pause = {
      kind: pause.kind,
      label: pause.label,
      limit: pause.limit,
      remaining: pause.remaining,
      since: pause.since,
      hasInterrupted: pause.hasInterrupted === true,
      phase: pause.phase,
      ...(typeof pause.resetsAt === 'number' ? { resetsAt: pause.resetsAt } : {}),
    }
  }

  if (typeof record.acknowledged === 'object' && record.acknowledged !== null) {
    for (const [kind, at] of Object.entries(record.acknowledged as Record<string, unknown>)) {
      if (typeof at === 'number') {
        state.acknowledged[kind] = at
      }
    }
  }

  return state
}

/**
 * The first window at or past its limit that the person has not chosen to
 * go on in: a window resumed past its limit stays quiet until it resets
 * (its reset time changes), then its limit holds again.
 */
export function breachOf(quotas: readonly Quota[], limits: Limits, acknowledged: Record<string, number>): (Quota & { limit: number }) | null {
  for (const quota of quotas) {
    const limit = limits[quota.kind]

    if (limit === undefined || quota.remaining > limit) {
      continue
    }

    if (acknowledged[quota.kind] === (quota.resetsAt ?? 0)) {
      continue
    }

    return { ...quota, limit }
  }

  return null
}

/** The note the model reads when a tool call meets the pause. */
export function denialOf(pause: Pause): string {
  return (
    `Paused by the progress band: the ${pause.label} usage limit the user set (pause at ${pause.limit}% left) ` +
    'was reached. Stop here and do not retry; the user will resume the work.'
  )
}

/** What the model is asked when the person saves and waits: a checkpoint, no tools. */
export const CHECKPOINT_PROMPT =
  'The usage limit the user set was reached, so the work is paused until the window resets. ' +
  'Do not call any tools. In three short lines, write down where the work stands and the very next step, ' +
  'so it can resume cleanly after the reset.'

/** What the model is asked when the person resumes a turn the pause stopped. */
export const RESUME_PROMPT = 'The user resumed the work after the usage-limit pause. Continue exactly where you stopped.'

/** What the model is asked when the window has reset after a save. */
export const RESET_PROMPT = 'The usage window has reset. Resume the work from the checkpoint you wrote, starting with the next step.'
