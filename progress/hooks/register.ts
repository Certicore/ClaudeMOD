import type {
  EngineInterface,
  Frozen,
  On,
  PluginOptions,
  PromptComposeSection,
  RenderElement,
  RenderInput,
  Timer,
} from 'claude-code'

import {
  breachOf,
  CHECKPOINT_PROMPT,
  LIMIT_START,
  nudgedLimit,
  denialOf,
  guardStateOf,
  limitsOf,
  RESET_PROMPT,
  RESUME_PROMPT,
  type Limits,
  type Pause,
} from './guard'
import type { FrameContext, PlanFrame } from './meter'
import { quotasOf, type Quota } from './usage'
import { flashProgress, FILL_MS, FRAME_MS, isFilling, shownShare, type Fill } from './motion'
import {
  applied,
  idOf,
  isDone,
  isPlan,
  folderKeyOf,
  keyOf,
  legacyKeyOf,
  parseKey,
  reportOf,
  sortedPlans,
  summaryOf,
  type Plan,
} from './plans'
import {
  alertWaveWidthOf,
  desktopBandView,
  glyphsCellsOf,
  GLYPHS_KEY,
  metersCellsOf,
  METERS_KEY,
  plainBandView,
  terminalBandView,
  terminalLayoutOf,
  type BandModel,
  type Move,
  type TerminalLayout,
} from './views/band'
import { DISSOLVE_MS } from './views/svg-bar'
import { ALERT_WAVE_KEY, alertWaveCellsOf, type GuardView } from './views/guard'

/** The tool's short name; the model calls it as `mcp__progress__report_progress`. */
const TOOL_NAME = 'report_progress'
/** The slash command, `/progress`. */
const COMMAND_NAME = 'progress'
/** The plugin's own clips, under `fx/`. */
const STEP_SOUND = 'fx/step-done.wav'
const PLAN_SOUND = 'fx/plan-done.wav'
const ALERT_SOUND = 'fx/alert.wav'
const REMOVE_SOUND = 'fx/dissolve.wav'
/** The store key of the limits: one set for the account, as the windows are. */
const LIMITS_KEY = 'limits'
/** How long after a window's reset the work picks up, so the new window is in place. */
const RESET_GRACE_MS = 20_000
/** The loop stops when no blit has landed for this long (the band is collapsed or gone). */
const STALE_MS = 3000

const TOOL_DESCRIPTION =
  'Report your progress on a multi-step plan. The user sees one row per plan ' +
  'above their prompt: the name, a progress bar of animated pixels and a chip ' +
  'riding its head that names the current stage and the step under way ' +
  '("Tests 3/5"), the percentage and a ✕ to dismiss it. Call it when you start ' +
  'a plan of two or more steps (step 0 with total), again after each step you ' +
  'complete (step n), and once more with done: true when the whole plan is ' +
  'finished. Reuse the exact same plan name to update a row, and give each call ' +
  'a note naming the stage you are entering in one to three words. Set remove: ' +
  'true to drop a row. A chime plays when a step completes.'

const INPUT_SCHEMA = {
  type: 'object',
  properties: {
    plan: {
      type: 'string',
      description:
        "The plan's name, the row's label (e.g. \"Migrate auth to OAuth\"). " +
        'Reuse the exact same name to update that plan.',
    },
    step: {
      type: 'integer',
      minimum: 0,
      description: 'How many steps are completed so far.',
    },
    total: {
      type: 'integer',
      minimum: 1,
      description: 'How many steps the plan has in all. Required the first time a plan is reported.',
    },
    note: {
      type: 'string',
      description:
        'The stage you are entering, one to three words (e.g. "Tests", "Deploy"); shown on the chip at the head of the bar.',
    },
    done: {
      type: 'boolean',
      description: 'true once the whole plan is finished (sets step to total).',
    },
    remove: {
      type: 'boolean',
      description: "true to remove the plan's row.",
    },
  },
  required: ['plan'],
  additionalProperties: false,
}

/** The system-prompt section asking the model to report, sent while the tool is offered. */
const PROMPT_SECTION: PromptComposeSection = {
  id: 'progress:report',
  text:
    '# Progress band\n' +
    'The user watches a progress bar above their prompt for every plan you report ' +
    'with the mcp__progress__report_progress tool. Whenever you work through a ' +
    'plan of two or more steps, call it once when you start (step 0, total), ' +
    'again after each step you complete, and with done: true at the end, each ' +
    'time with a note naming the next stage in one to three words. Keep the ' +
    'calls short and do not narrate them.',
  scope: 'session',
}

/** Where the terminal band was last drawn, so the frame loop can repaint its Rasters. */
type Mounted = {
  requestId: string
  layout: TerminalLayout
  /** The plans' ids in the order the Rasters' rows draw them. */
  ids: readonly string[]
  /** The alert wave's width, while the alert is drawn. */
  alertCells: number | null
}

/** The plans the band draws, by id; loaded from `$.store` at the start and before each turn. */
let plans = new Map<string, Plan>()
/**
 * Whether this instance of the module has read the store yet: a hot reload
 * can hand it a tool call or a drawing before its `session.start` has run.
 */
let hasLoaded = false
/** The project folder the band shows the plans of, as the store names it; null until first read. */
let folder: string | null = null
/**
 * Unfinished plans of the first release, which belonged to no folder: kept
 * out of every band, and adopted by the first folder that reports one again.
 */
let legacy = new Map<string, Plan>()
/** Each plan's fill on its way to a new share. */
const fills = new Map<string, Fill>()
/** When each plan that just finished starts its flash. */
const flashes = new Map<string, number>()
/** When each plan whose ✕ was pressed began to come apart. */
const removing = new Map<string, number>()
/** The `sound` option: chimes play while true. */
let isSoundOn = true
/** The `usage` option: the 5-hour and 7-day windows show under the plans while true. */
let isUsageOn = true
/** The 5-hour and 7-day windows as the engine last measured them; empty off a subscription. */
let quotas: Quota[] = []
/** Whether this instance of the module has asked the engine for the windows yet. */
let hasUsage = false
/** The minute tick: re-reads the folder's plans other sessions report, and keeps the windows' countdowns current. */
let minuteTick: Timer | null = null
/** How often the band re-reads the store for what other sessions of the folder reported. */
const REFRESH_MS = 60_000
/** Whether a model turn runs: the active plan spins and shimmers meanwhile. */
let isWorking = false
/** The running main-loop turn, as `turn.start` named it: what a pause stops. */
let runningTurn: string | null = null
/** The limits the person set, per window, in percent left. */
let limits: Limits = {}
/** Whether this folder's plans are folded into one line, and when that last changed (its animation plays a moment). */
let isFolded = false
let foldedAt = Number.NEGATIVE_INFINITY
/** How long a fold or an unfold animates; a redraw after it draws the band at rest. */
const FOLD_MS = 1600
/** The window whose limit picker is open, in the quota row's place, and when it opened (its dial opens out). */
let editing: string | null = null
let editedAt = Number.NEGATIVE_INFINITY
/** The window whose limit ✓ last validated, and when: the quota row comes back with it lit. */
let confirmed: { kind: string; at: number } | null = null
/** How long the picker's opening and the quota row's return animate. */
const OPEN_MS = 1200
const RETURN_MS = 1300
/** The limit the picker shows, the one its knob last slid from, and when. */
let draft: number | null = null
let draftFrom: number | null = null
let draftMovedAt = 0
/** The surfaces whose dial drag region has said it runs; elsewhere the dial takes clicks instead. */
const dragReady = new Set<string>()
/** How long a nudge's slide plays: a redraw after it draws the knob at rest. */
const NUDGE_MS = 450
/** The pause at a limit, while one holds the work. */
let pause: Pause | null = null
/** Per window, the reset time of the window the person chose to go on in past its limit. */
let acknowledged: Record<string, number> = {}
/** The wake-up that resumes the work once a saved pause's window resets. */
let resumeTimer: Timer | null = null
let mounted: Mounted | null = null
let loop: Timer | null = null
/** The cells last blitted per Raster key, so an unchanged frame sends nothing. */
const blitted = new Map<string, string>()
let lastLandedAt = 0

/**
 * Registers the progress band: the `report_progress` tool and `/progress` at
 * the session's start, the tool's hook that updates a plan, animates it and
 * plays a chime, the band's drawing, the command, the store's re-read before
 * each turn, the tool kept out of ToolSearch, and the prompt section that
 * asks the model to report.
 *
 * @param on the engine's registrar
 * @param options the plugin's options; `sound` (default true) plays the chimes
 */
export function register(on: On, options: PluginOptions): void {
  isSoundOn = options.sound !== false
  isUsageOn = options.usage !== false

  on('session.start', async ($, e, next) => {
    await $.tool.register({
      name: TOOL_NAME,
      description: TOOL_DESCRIPTION,
      inputSchema: INPUT_SCHEMA,
    })
    await loadPlans($)
    await loadGuard($)
    await refreshUsage($)
    startMinuteTick($)
    await armResume($)

    try {
      await $.command.register({
        name: COMMAND_NAME,
        description: 'List the plans in the progress band; clear drops them all, remove <plan> one',
        argumentHint: '[clear | remove <plan>]',
        immediate: true,
      })
    } catch {
      // Another plugin's /progress stands; the band and the tool work without it.
    }

    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    isWorking = true
    runningTurn = e.turnId
    // Another session may have reported since: its plans share the store.
    await loadPlans($)
    $.ui.invalidate('ui.render')

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      isWorking = false
      runningTurn = null
      $.ui.invalidate('ui.render')
    }

    return next(e)
  })

  on('session.measure', ($, e, next) => {
    // The windows' figures, pushed after each turn and whenever one moves a point.
    if (e.changed.includes('rateLimits')) {
      quotas = quotasOf(e.rateLimits)
      hasUsage = true
      $.ui.invalidate('ui.render')
      void checkLimits($)
    }

    return next(e)
  })

  // The pause holds every tool but this plugin's own, outermost of its hooks.
  on('tool.call', ($, e, next) => {
    if (pause !== null && e.tool !== `mcp__progress__${TOOL_NAME}`) {
      return { deny: denialOf(pause) }
    }

    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    // The person writing to Claude during a pause is the person going on.
    if (pause !== null && e.origin.kind === 'composer') {
      await resumeWork($, false)
      $.ui.toast('Usage-limit pause lifted')
    }

    return next(e)
  })

  // The limit dial's drag region posts the limit under the pointer.
  on('ui.message', { module: /dial-drag/ }, ($, e) => {
    const data = e.data as { limit?: unknown; isFinal?: unknown; isReady?: unknown } | null

    if (data?.isReady === true) {
      if (!dragReady.has(e.surface)) {
        dragReady.add(e.surface)
        $.ui.invalidate('ui.render')
      }

      return {}
    }

    const limit = typeof data?.limit === 'number' && Number.isFinite(data.limit) ? nudgedLimit(data.limit, 0) : null

    if (limit !== null && editing !== null && limit !== draft) {
      draft = limit
      draftFrom = null
      $.ui.invalidate('ui.render')
    }

    return {}
  })

  on('tool.describe', { tool: 'mcp__progress__report_progress' }, async ($, e, next) => {
    // Listed in the prompt, not behind ToolSearch: the model reaches for it unprompted.
    const described = await next(e)

    return { ...described, isDeferred: false }
  })

  on('tool.call', { tool: 'mcp__progress__report_progress' }, async ($, e) => {
    await ensureLoaded($)
    const report = reportOf(e)

    if ('error' in report) {
      return { result: `report_progress refused: ${report.error}` }
    }

    const id = idOf(report.name)
    const adopted = plans.has(id) ? undefined : legacy.get(id)
    const previous = plans.get(id) ?? adopted

    if (report.isRemoved) {
      await removePlan($, id)

      return {
        result:
          previous === undefined
            ? `No plan named "${report.name}" in the progress band.`
            : `Removed "${previous.name}" from the progress band.`,
      }
    }

    const now = await $.clock.now()
    const updated = applied(previous, report, now)

    if ('error' in updated) {
      return { result: `report_progress refused: ${updated.error}` }
    }

    const fromShare = shareAt(previous, now)
    const toShare = updated.step / updated.total
    const wasDone = previous !== undefined && isDone(previous)
    const hasFinished = isDone(updated) && !wasDone
    const hasAdvanced = updated.step > (previous?.step ?? 0)

    plans.set(updated.id, updated)

    if (fromShare !== toShare) {
      fills.set(updated.id, { from: fromShare, to: toShare, startedAt: now })
    }

    if (hasFinished) {
      flashes.set(updated.id, now + FILL_MS * 0.7)
    }

    $.ui.invalidate('ui.render')
    startLoop($)
    await $.store.set(keyOf(await folderOf($), updated.id), updated)

    if (adopted !== undefined) {
      legacy.delete(id)
      await $.store.delete(legacyKeyOf(id)).catch(() => undefined)
    }

    if (hasFinished) {
      playSound($, PLAN_SOUND)
    } else if (hasAdvanced) {
      playSound($, STEP_SOUND)
    }

    return { result: `Progress band: ${summaryOf(updated)}` }
  }).catch(($, e, next) => ({
    result: `report_progress failed (${next.error.kind}): ${next.error.message}`,
  }))

  on('command.run', { command: 'progress' }, async ($, e) => {
    await ensureLoaded($)
    const [verb = '', ...rest] = e.args.trim().split(/\s+/)
    const target = rest.join(' ')

    if (verb === 'clear') {
      const count = plans.size

      for (const id of [...plans.keys()]) {
        await removePlan($, id)
      }

      return { text: count === 0 ? 'No plan to clear.' : `Cleared ${count} plan${count === 1 ? '' : 's'}.` }
    }

    if (verb === 'remove') {
      const id = idOf(target)
      const plan = plans.get(id)

      if (target === '' || plan === undefined) {
        return { text: `No plan named "${target}". /progress lists them.` }
      }

      await removePlan($, id)

      return { text: `Removed "${plan.name}".` }
    }

    const lines = sortedPlans(plans.values()).map(
      plan => `${isDone(plan) ? '✓' : '·'} ${summaryOf(plan)}`,
    )

    return {
      text:
        lines.length === 0
          ? 'No plan in progress. Claude adds one by calling report_progress.'
          : lines.join('\n'),
    }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    await ensureLoaded($)

    if (e.props.hasSurvey || (plans.size === 0 && shownQuotas().length === 0 && pause === null)) {
      if (e.surface === 'terminal') {
        mounted = null
      }

      return next(e)
    }

    isWorking = e.props.isWorking
    const theirs = await next(e)
    const now = await $.clock.now()

    return drawBand($, e, theirs, now)
  })

  on('prompt.compose', async ($, e, next) => {
    const result = await next(e)

    if (!e.tools.includes(`mcp__progress__${TOOL_NAME}`)) {
      return result
    }

    const sections = result.sections.filter(section => section.id !== PROMPT_SECTION.id)

    return { sections: [...sections, PROMPT_SECTION] }
  })
}

/**
 * Draws the band for the surface: the terminal's Rasters (and remembers
 * where, for the frame loop), the desktop's SVG bars, plain text elsewhere.
 */
function drawBand(
  $: EngineInterface,
  e: Frozen<RenderInput<'AbovePrompt'>>,
  theirs: RenderElement,
  now: number,
): RenderElement {
  const frames = framesAt(now)
  const context: FrameContext = { now, isWorking, isPaused: pause !== null }
  const columns = e.props.bodyColumns > 0 ? e.props.bodyColumns : (e.viewport?.columns ?? 80)
  const model: BandModel = {
    frames,
    context,
    columns,
    theirs,
    quotas: shownQuotas(),
    guard: guardViewOf($, now, e.surface),
    fold: {
      isFolded,
      isAnimating: now - foldedAt < FOLD_MS,
      onToggle: () => {
        void toggleFold($)
      },
    },
    onRemove: id => {
      void dissolvePlan($, id)
    },
  }

  if (e.surface === 'terminal') {
    const { Box, Text, Button, Input, Raster, Client } = $.ui.resolve(e)
    const layout = terminalLayoutOf(columns, frames)
    const alertCells = pause === null ? null : alertWaveWidthOf(columns)

    const shownIds = isFolded ? [] : frames.map(frame => frame.plan.id)

    mounted =
      shownIds.length === 0 && alertCells === null
        ? null
        : { requestId: e.requestId, layout, ids: shownIds, alertCells }
    blitted.clear()

    if (isAnimating()) {
      startLoop($)
    }

    return terminalBandView({ Box, Text, Button, Input, Raster, Client }, model, layout)
  }

  if (e.surface === 'desktop') {
    const { Box, Text, Button, Input, Svg, Client } = $.ui.resolve(e)
    const moves = new Map<string, Move>()

    // The SVG eases the head itself: hand it where the head is now and the time left.
    for (const [id, fill] of fills) {
      if (isFilling(fill, now)) {
        moves.set(id, { from: shownShare(fill, now), durationMs: FILL_MS - (now - fill.startedAt) })
      }
    }

    return desktopBandView({ Box, Text, Button, Input, Svg, Client }, { ...model, moves })
  }

  const { Box, Text, Button } = $.ui.resolve(e)

  return plainBandView({ Box, Text, Button }, model)
}

/** The plans as the instant `now` shows them, in the order they were first reported. */
function framesAt(now: number): PlanFrame[] {
  const ordered = sortedPlans(plans.values())
  const active = ordered
    .filter(plan => !isDone(plan))
    .reduce<Plan | null>((latest, plan) => (latest === null || plan.updatedAt > latest.updatedAt ? plan : latest), null)

  return ordered.map(plan => {
    const removedAt = removing.get(plan.id)

    return {
      plan,
      share: shareAt(plan, now),
      flash: flashProgress(flashes.get(plan.id), now),
      isActive: active !== null && plan.id === active.id,
      dissolve: removedAt === undefined ? null : Math.max(0, Math.min(1, (now - removedAt) / DISSOLVE_MS)),
    }
  })
}

/** The share a plan's bar shows at `now`: mid-fill when it is animating. */
function shareAt(plan: Plan | undefined, now: number): number {
  if (plan === undefined) {
    return 0
  }

  const fill = fills.get(plan.id)

  return fill !== undefined && isFilling(fill, now) ? shownShare(fill, now) : plan.step / plan.total
}

/** True while the band shows a plan or the alert: their pixels never stop moving. */
function isAnimating(): boolean {
  return plans.size > 0 || pause !== null
}

/** Starts the frame loop unless it runs. */
function startLoop($: EngineInterface): void {
  if (loop !== null) {
    return
  }

  lastLandedAt = Number.POSITIVE_INFINITY
  loop = $.clock.every(FRAME_MS, () => {
    void onFrame($)
  })
}

function stopLoop(): void {
  loop?.cancel()
  loop = null
}

/**
 * One frame: repaints the glyphs and the meters of the band last drawn,
 * each only when its cells changed, and stops the loop once nothing moves
 * or nothing has landed for STALE_MS.
 */
async function onFrame($: EngineInterface): Promise<void> {
  const now = await $.clock.now()

  if (lastLandedAt === Number.POSITIVE_INFINITY) {
    lastLandedAt = now
  }

  const target = mounted
  const isStale = now - lastLandedAt > STALE_MS

  if (target === null || isStale || !isAnimating()) {
    settleAnimations(now)
    stopLoop()

    if (target !== null) {
      await paint($, target, now)
    }

    return
  }

  await paint($, target, now)
}

/** Blits the band's two Rasters for `now`, skipping a frame whose rows changed shape. */
async function paint($: EngineInterface, target: Mounted, now: number): Promise<void> {
  const frames = framesAt(now)
  const ids = frames.map(row => row.plan.id)

  const context: FrameContext = { now, isWorking, isPaused: pause !== null }
  const hasPlanRasters = target.ids.length > 0 && ids.join('\n') === target.ids.join('\n')
  const repaints: [string, string, number, number][] =
    !hasPlanRasters
      ? []
      : [
          [GLYPHS_KEY, glyphsCellsOf(frames, context), 1, frames.length],
          [METERS_KEY, metersCellsOf(frames, context, target.layout), target.layout.meter, frames.length],
        ]

  if (pause !== null && target.alertCells !== null) {
    repaints.push([ALERT_WAVE_KEY, alertWaveCellsOf(pause, target.alertCells, now), target.alertCells, 1])
  }

  for (const [key, cells, columns, rows] of repaints) {
    if (blitted.get(key) === cells) {
      continue
    }

    const result = await $.ui.blit({ requestId: target.requestId, key, cells, columns, rows })

    if (result.deny === undefined) {
      blitted.set(key, cells)
      lastLandedAt = now
    }
  }
}

/** Forgets fills and flashes that have run their course. */
function settleAnimations(now: number): void {
  for (const [id, fill] of fills) {
    if (!isFilling(fill, now)) {
      fills.delete(id)
    }
  }

  for (const [id, startedAt] of flashes) {
    if (now >= startedAt + FILL_MS * 2) {
      flashes.delete(id)
    }
  }
}

/** What the band's guard controls do, bound to this `$`. */
function guardViewOf($: EngineInterface, now: number, surface: string): GuardView {
  return {
    limits,
    editing,
    draft,
    draftFrom: draftFrom !== null && now - draftMovedAt < NUDGE_MS ? draftFrom : null,
    isOpening: now - editedAt < OPEN_MS,
    justSet: confirmed !== null && now - confirmed.at < RETURN_MS ? confirmed.kind : null,
    isDragReady: dragReady.has(surface),
    onPick: limit => {
      void pickLimit($, limit)
    },
    pause,
    onEdit: kind => {
      void openEditor($, kind)
    },
    onNudge: delta => {
      void nudgeDraft($, delta)
    },
    onConfirm: () => {
      void confirmLimit($)
    },
    onClear: () => {
      draftFrom = null
      draft = null
      $.ui.invalidate('ui.render')
    },
    onSave: () => {
      void saveAndWait($)
    },
    onResume: () => {
      void resumeWork($, true)
      $.ui.toast('Resumed past the limit')
    },
  }
}

/**
 * Opens a window's limit picker in the quota row's place, on the limit set
 * (or none); its dial opens out of the middle. The window's label pressed
 * again while it is open leaves the limit as it was.
 */
async function openEditor($: EngineInterface, kind: string): Promise<void> {
  const now = await $.clock.now()

  if (editing === kind) {
    editing = null
    confirmed = { kind, at: now }
  } else {
    editing = kind
    editedAt = now
    confirmed = null
  }

  draft = limits[kind] ?? null
  draftFrom = null
  $.ui.invalidate('ui.render')
  // Redraws once the animation is over, so later redraws draw it at rest.
  $.clock.after(Math.max(OPEN_MS, RETURN_MS) + 50, () => {
    $.ui.invalidate('ui.render')
  })
}

/**
 * A click on the dial's track: the bar moves there and slides over from
 * where it stood; nothing is kept until the ✓.
 */
async function pickLimit($: EngineInterface, limit: number): Promise<void> {
  const picked = nudgedLimit(limit, 0)

  if (editing === null || picked === draft) {
    return
  }

  draftFrom = draft
  draft = picked
  draftMovedAt = await $.clock.now()
  $.ui.invalidate('ui.render')
}

/** The ✓: keeps the limit the dial shows (none, after Remove), closes the picker, and the quota row comes back lit. */
async function confirmLimit($: EngineInterface): Promise<void> {
  const kind = editing

  if (kind === null) {
    return
  }

  editing = null
  confirmed = { kind, at: await $.clock.now() }
  $.clock.after(RETURN_MS + 50, () => {
    $.ui.invalidate('ui.render')
  })

  if (draft === (limits[kind] ?? null)) {
    $.ui.invalidate('ui.render')

    return
  }

  await setLimit($, kind, draft)
}

/** Moves the picker's knob a step, remembering where it slides from. */
async function nudgeDraft($: EngineInterface, delta: number): Promise<void> {
  const moved = nudgedLimit(draft ?? LIMIT_START, delta)

  if (moved === draft) {
    return
  }

  draftFrom = draft
  draft = moved
  draftMovedAt = await $.clock.now()
  $.ui.invalidate('ui.render')
}

/** The store key of this folder's guard: its pause and the windows resumed past their limit. */
async function guardKeyOf($: EngineInterface): Promise<string> {
  return `guard:${await folderOf($)}`
}

/** The store key of this folder's view: whether its plans are folded. */
async function viewKeyOf($: EngineInterface): Promise<string> {
  return `view:${await folderOf($)}`
}

/** Folds the plans into one line, or opens them again; remembered for the folder, animated once. */
async function toggleFold($: EngineInterface): Promise<void> {
  isFolded = !isFolded
  foldedAt = await $.clock.now()
  $.ui.invalidate('ui.render')
  // A redraw once the animation is over, so later redraws draw the band at rest.
  $.clock.after(FOLD_MS + 50, () => {
    $.ui.invalidate('ui.render')
  })

  try {
    await $.store.set(await viewKeyOf($), { isFolded })
  } catch {
    // The fold holds for this session.
  }
}

/** Reads the limits and this folder's pause and view from the store. */
async function loadGuard($: EngineInterface): Promise<void> {
  try {
    const view = (await $.store.get(await viewKeyOf($))) as { isFolded?: unknown } | undefined

    isFolded = view?.isFolded === true
  } catch {
    // An unreadable store: the plans show open.
  }

  try {
    limits = limitsOf(await $.store.get(LIMITS_KEY))

    const state = guardStateOf(await $.store.get(await guardKeyOf($)))

    pause = state.pause
    acknowledged = state.acknowledged
  } catch {
    // An unreadable store: no limit, no pause.
  }
}

async function saveGuard($: EngineInterface): Promise<void> {
  try {
    await $.store.set(await guardKeyOf($), { pause, acknowledged })
  } catch {
    // The pause holds for this session; the next one starts without it.
  }
}

/** Sets (or, with null, lifts) a window's limit, closes the picker, and checks the windows against it. */
async function setLimit($: EngineInterface, kind: string, limit: number | null): Promise<void> {
  const next: Limits = { ...limits }

  if (limit === null) {
    delete next[kind]
  } else {
    next[kind] = limit
  }

  limits = next
  editing = null
  draft = limit
  delete acknowledged[kind]
  $.ui.invalidate('ui.render')
  $.ui.toast(limit === null ? 'Limit removed' : `Work pauses when ${kind === 'seven_day' ? '7d' : '5h'} has ${limit}% left`)

  try {
    await $.store.set(LIMITS_KEY, limits)
  } catch {
    // The limit holds for this session.
  }

  await saveGuard($)
  await checkLimits($)
}

/** Pauses the work when a window has reached the limit the person set, unless it already is. */
async function checkLimits($: EngineInterface): Promise<void> {
  if (pause !== null) {
    return
  }

  const breach = breachOf(quotas, limits, acknowledged)

  if (breach === null) {
    return
  }

  const turn = runningTurn

  pause = {
    kind: breach.kind,
    label: breach.label,
    limit: breach.limit,
    remaining: breach.remaining,
    since: await $.clock.now(),
    hasInterrupted: turn !== null,
    phase: 'alert',
    ...(breach.resetsAt === undefined ? {} : { resetsAt: breach.resetsAt }),
  }

  if (turn !== null) {
    $.turn.abort({ turnId: turn }).catch(() => {
      // The turn had already ended; the tool guard holds whatever comes next.
    })
  }

  playSound($, ALERT_SOUND)
  $.ui.toast(`⏸ ${breach.label} limit reached: the work is paused`)
  $.ui.invalidate('ui.render')
  startLoop($)
  await saveGuard($)
}

/** Save & wait: Claude writes a checkpoint without tools, and the work resumes once the window resets. */
async function saveAndWait($: EngineInterface): Promise<void> {
  if (pause === null || pause.phase === 'waiting') {
    return
  }

  pause = { ...pause, phase: 'waiting' }
  $.ui.invalidate('ui.render')
  await saveGuard($)
  await armResume($)
  $.ui.toast(pause.resetsAt === undefined ? 'Saved: resume whenever you are ready' : 'Saved: Claude picks up on its own after the reset')
  $.prompt.submit({ text: CHECKPOINT_PROMPT }).catch(() => {
    // No checkpoint: the wait holds all the same.
  })
}

/** Arms the wake-up of a saved pause: shortly after its window resets, or at once when that is past. */
async function armResume($: EngineInterface): Promise<void> {
  resumeTimer?.cancel()
  resumeTimer = null

  if (pause === null || pause.phase !== 'waiting' || pause.resetsAt === undefined) {
    return
  }

  const delay = Math.max(0, pause.resetsAt + RESET_GRACE_MS - (await $.clock.now()))

  resumeTimer = $.clock.after(delay, () => {
    void resumeAfterReset($)
  })
}

/** The window has reset after a save: lift the pause and ask Claude to pick up from its checkpoint. */
async function resumeAfterReset($: EngineInterface): Promise<void> {
  if (pause === null || pause.phase !== 'waiting') {
    return
  }

  const label = pause.label

  pause = null
  resumeTimer = null
  await saveGuard($)
  await refreshUsage($)
  playSound($, STEP_SOUND)
  $.ui.toast(`${label} window reset: resuming`)
  $.ui.invalidate('ui.render')
  $.prompt.submit({ text: RESET_PROMPT }).catch(() => {
    // The person resumes by hand.
  })
}

/**
 * Lifts the pause: the window stays quiet until it resets, and with
 * `shouldContinue` Claude is asked to go on when a turn was stopped or a
 * checkpoint written.
 */
async function resumeWork($: EngineInterface, shouldContinue: boolean): Promise<void> {
  const lifted = pause

  if (lifted === null) {
    return
  }

  acknowledged = { ...acknowledged, [lifted.kind]: lifted.resetsAt ?? 0 }
  pause = null
  resumeTimer?.cancel()
  resumeTimer = null
  $.ui.invalidate('ui.render')
  await saveGuard($)

  if (shouldContinue && (lifted.hasInterrupted || lifted.phase === 'waiting')) {
    $.prompt.submit({ text: RESUME_PROMPT }).catch(() => {
      // The person goes on by hand.
    })
  }
}

/** Reads the store, and asks for the windows, unless this instance of the module already has. */
async function ensureLoaded($: EngineInterface): Promise<void> {
  if (!hasLoaded) {
    await loadPlans($)
  }

  if (!hasUsage) {
    await refreshUsage($)
  }
}

/** The windows the band draws: none while the `usage` option is off. */
function shownQuotas(): Quota[] {
  return isUsageOn ? quotas : []
}

/** Asks the engine for the 5-hour and 7-day windows; a session that cannot say keeps what it had. */
async function refreshUsage($: EngineInterface): Promise<void> {
  hasUsage = true

  try {
    const usage = await $.session.usage()

    quotas = quotasOf(usage.rateLimits)
    await checkLimits($)
  } catch {
    // No reading: the row stays as it was, or absent.
  }
}

/** Redraws once a minute while a window shows, so `resets in 2h 14m` stays true. */
function startMinuteTick($: EngineInterface): void {
  if (minuteTick !== null) {
    return
  }

  minuteTick = $.clock.every(REFRESH_MS, () => {
    void refreshFromStore($)
  })
}

/**
 * Re-reads this folder's plans: another conversation in the folder may have
 * started, moved, finished or removed one. A plan that moved fills to its
 * new share and one that finished flashes, as if reported here; no chime,
 * which plays only where the work is done. Redraws when anything changed,
 * and in any case while a window's countdown shows.
 */
async function refreshFromStore($: EngineInterface): Promise<void> {
  const before = plans

  await loadPlans($)

  const now = await $.clock.now()
  let hasChanged = before.size !== plans.size

  for (const [id, plan] of plans) {
    const previous = before.get(id)

    if (previous === undefined) {
      hasChanged = true
      continue
    }

    if (previous.updatedAt === plan.updatedAt && previous.step === plan.step && previous.total === plan.total) {
      continue
    }

    hasChanged = true

    const from = previous.step / previous.total
    const to = plan.step / plan.total

    if (from !== to && !removing.has(id)) {
      fills.set(id, { from, to, startedAt: now })
    }

    if (isDone(plan) && !isDone(previous)) {
      flashes.set(id, now + FILL_MS * 0.7)
    }
  }

  if (hasChanged) {
    startLoop($)
  }

  if (hasChanged || shownQuotas().length > 0) {
    $.ui.invalidate('ui.render')
  }
}

/** The session's project folder as the store names it, read afresh: a `/cd` moves it. */
async function folderOf($: EngineInterface): Promise<string> {
  try {
    folder = folderKeyOf(await $.session.root())
  } catch {
    folder ??= folderKeyOf('')
  }

  return folder
}

/**
 * Reads this folder's plans from the store, and the legacy ones of no
 * folder: a finished legacy plan is dropped, an unfinished one kept for
 * adoption. A store that cannot be read leaves the plans as they are.
 */
async function loadPlans($: EngineInterface): Promise<void> {
  let keys: string[]

  try {
    keys = await $.store.keys()
  } catch {
    return
  }

  const mine = await folderOf($)
  const loaded = new Map<string, Plan>()
  const orphans = new Map<string, Plan>()

  for (const key of keys) {
    const parsed = parseKey(key)

    if (parsed === null || ('folder' in parsed && parsed.folder !== mine)) {
      continue
    }

    const value = await $.store.get(key).catch(() => undefined)

    if (!isPlan(value)) {
      continue
    }

    if ('folder' in parsed) {
      loaded.set(value.id, value)
    } else if (isDone(value)) {
      await $.store.delete(key).catch(() => undefined)
    } else {
      orphans.set(value.id, value)
    }
  }

  plans = loaded
  legacy = orphans
  hasLoaded = true
}

/**
 * The ✕: the row comes apart (its LEDs fly off, its chip bursts, a soft
 * dissolve sound plays), then the plan leaves the band and the store.
 */
async function dissolvePlan($: EngineInterface, id: string): Promise<void> {
  if (removing.has(id) || !plans.has(id)) {
    return
  }

  removing.set(id, await $.clock.now())
  playSound($, REMOVE_SOUND)
  $.ui.invalidate('ui.render')
  startLoop($)
  $.clock.after(DISSOLVE_MS, () => {
    void removePlan($, id)
  })
}

/** Drops a plan from the band, then from the store. */
async function removePlan($: EngineInterface, id: string): Promise<void> {
  plans.delete(id)
  fills.delete(id)
  flashes.delete(id)
  removing.delete(id)
  $.ui.invalidate('ui.render')

  try {
    await $.store.delete(keyOf(await folderOf($), id))
  } catch {
    // The row is gone; the store keeps the plan until the next write.
  }
}

/** Plays one of the plugin's clips without holding the tool's answer, unless `sound` is off. */
function playSound($: EngineInterface, asset: string): void {
  if (!isSoundOn) {
    return
  }

  $.audio.play({ asset }).catch(() => {
    // No player, or the clip is missing: the band still updated.
  })
}
