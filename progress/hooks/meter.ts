import { easeOutCubic, spinnerAt, twinkleTick } from './motion'
import {
  AMBER_BRIGHT,
  AMBER_DEEP,
  AMBER_DIM,
  DEFAULT_COLOR,
  EMERALD,
  EMERALD_DEEP,
  EMERALD_DIM,
  LAVENDER,
  LAVENDER_DEEP,
  LAVENDER_DIM,
  mix,
  MUTED,
  noise,
  DANGER,
  RULE_FROM,
  RULE_TO,
  seedOf,
  TRACK,
  WHITE,
  type Rgb,
} from './palette'
import { chipOf, isDone, type Plan } from './plans'
import { BLANK, cellOf, textCells, type Cell } from './raster'

/** One plan as one frame draws it: where its bar stands and whether it glows. */
export type PlanFrame = {
  plan: Plan
  /** The share of the bar shown now, 0 to 1 (mid-animation, not the target). */
  share: number
  /** How far into its completion flash, 0 to 1, or null. */
  flash: number | null
  /** The plan Claude reported last among the unfinished ones: it spins and twinkles. */
  isActive: boolean
  /** How far the plan's row has come apart since its ✕ was pressed, 0 to 1, or null. */
  dissolve?: number | null
}

/** What every row of a frame shares: the instant, whether Claude is working, whether a limit holds the work. */
export type FrameContext = {
  now: number
  isWorking: boolean
  isPaused?: boolean
}

/** How wide a meter's bar is, its rounded ends included. */
export type MeterWidths = {
  bar: number
}

const GAP = 2
const PERCENT_CELLS = 4
/** The braille cell with no dot: an empty pixel of the dither. */
const NO_DOTS = 0x2800
/** The eight dots of a braille cell, as bits of its code point. */
const DOTS = [0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80]

/** Cells across one meter: the bar, a gap, the percent. */
export function meterWidthOf(widths: MeterWidths): number {
  return widths.bar + GAP + PERCENT_CELLS
}

/** The percent a share reads as: 100 only once it is whole, so a bar still filling never says 100%. */
export function shownPercent(share: number): number {
  if (share >= 1) {
    return 100
  }

  return Math.max(0, Math.min(99, Math.round(share * 100)))
}

/**
 * One meter: a rounded track; behind the head a dither of braille pixels,
 * sparse at the start and dense at the head, that reshuffles while Claude
 * works; the chip (`Stage 3/5`) riding the head; the percent.
 */
export function meterRow(frame: PlanFrame, context: FrameContext, widths: MeterWidths): Cell[] {
  if (frame.dissolve !== undefined && frame.dissolve !== null) {
    return dissolvingRow(frame, context, widths, frame.dissolve)
  }

  const { plan } = frame
  const done = isDone(plan) && frame.share >= 0.999
  const flash = frame.flash === null ? 0 : 1 - easeOutCubic(frame.flash)
  const inner = Math.max(4, widths.bar - 2)
  const paused = context.isPaused === true && !done
  const chip = chipCellsOf(plan, done, flash, inner, paused)
  const head = Math.round(Math.max(0, Math.min(1, frame.share)) * inner)
  const chipEnd = Math.min(inner, Math.max(head, chip.length))
  const chipStart = chipEnd - chip.length
  const tick = twinkleTick(context.now, context.isWorking && frame.isActive && !done)
  const seed = seedOf(plan.id)
  const cells: Cell[] = [cellOf('▐', TRACK)]

  for (let i = 0; i < inner; i += 1) {
    if (i >= chipStart && i < chipEnd) {
      cells.push(chip[i - chipStart] ?? BLANK)
    } else if (i < chipStart) {
      cells.push(ditherCell(i, chipStart, seed, tick, done, flash, paused))
    } else {
      cells.push(cellOf(' ', TRACK, TRACK))
    }
  }

  cells.push(cellOf('▌', TRACK))

  for (let i = 0; i < GAP; i += 1) {
    cells.push(BLANK)
  }

  const percentColor = done ? mix(EMERALD, WHITE, flash) : MUTED

  cells.push(...textCells(`${shownPercent(frame.share)}%`.padStart(PERCENT_CELLS), percentColor))

  return cells
}

/**
 * A row coming apart after its ✕: the cells nearest the chip go first,
 * each flaring into a sparkle (`✦`, then `·`) before it goes out; the chip
 * flashes white and crumbles into sparkles; the track, the percent and the
 * caps fade away last.
 */
function dissolvingRow(frame: PlanFrame, context: FrameContext, widths: MeterWidths, progress: number): Cell[] {
  const done = isDone(frame.plan)
  const living = meterRow({ ...frame, dissolve: null }, context, widths)
  const inner = Math.max(4, widths.bar - 2)
  const seed = seedOf(frame.plan.id)
  const [, bright] = done ? [EMERALD_DIM, EMERALD] : [LAVENDER_DIM, LAVENDER]
  const p = Math.max(0, Math.min(1, progress))
  const trackGone = p > 0.82

  return living.map((cell, index) => {
    if (index === 0 || index === inner + 1) {
      return trackGone ? BLANK : cell
    }

    if (index > inner + 1) {
      return p > 0.45 ? BLANK : cell
    }

    const i = index - 1
    const isChip = cell.bg !== TRACK && cell.bg !== DEFAULT_COLOR
    const order = isChip ? 0.05 + 0.1 * noise(seed, i, 12) : 0.12 + 0.5 * (1 - i / inner) + 0.18 * noise(seed, i, 11)
    const ground = trackGone ? DEFAULT_COLOR : TRACK

    if (p < order) {
      return isChip && p > 0.02 ? cellOf(cell.glyph, cell.fg, mix(cell.bg, WHITE, Math.min(1, p / 0.08) * 0.7)) : cell
    }

    const since = p - order

    if (since < 0.1) {
      return cellOf('✦', mix(WHITE, bright, since / 0.1), ground)
    }

    if (since < 0.22) {
      return cellOf('·', mix(bright, TRACK, (since - 0.1) / 0.12), ground)
    }

    return trackGone ? BLANK : cellOf(' ', TRACK, TRACK)
  })
}

/** One pixel of the dither: dots lit with a chance that grows toward the head. */
function ditherCell(i: number, span: number, seed: number, tick: number, done: boolean, flash: number, paused: boolean): Cell {
  const t = span <= 1 ? 1 : (i + 0.5) / span
  const density = done ? 0.35 + 0.45 * t : 0.06 + 0.74 * t ** 1.6
  let code = NO_DOTS

  DOTS.forEach((bit, dot) => {
    if (noise(seed + tick * 7919, i, dot) < density) {
      code |= bit
    }
  })

  const [dim, bright] = done ? [EMERALD_DIM, EMERALD] : paused ? [AMBER_DIM, AMBER_BRIGHT] : [LAVENDER_DIM, LAVENDER]
  const fg = mix(mix(dim, bright, t ** 1.2), WHITE, flash * 0.8)

  return cellOf(String.fromCodePoint(code), fg, TRACK)
}

/**
 * The chip's cells: half-block caps round it, the label in white and the
 * count a touch softer on lavender (emerald once done); the label is cut,
 * then dropped, when the bar is too short to hold it.
 */
function chipCellsOf(plan: Plan, done: boolean, flash: number, inner: number, paused: boolean): Cell[] {
  const chip = chipOf(plan)
  const label = paused ? 'Paused' : chip.label
  const { count } = chip
  const ground: Rgb = mix(done ? EMERALD_DEEP : paused ? AMBER_DEEP : LAVENDER_DEEP, WHITE, flash * 0.6)
  const room = inner - 2
  let text = `${label} ${count}`

  if ([...text].length > room) {
    const cut = room - count.length - 2
    text = cut >= 3 ? `${[...label].slice(0, cut).join('')}… ${count}` : count
  }

  const labelLength = [...text].length - count.length
  const body = [...text].map((glyph, index) => cellOf(glyph, index < labelLength ? WHITE : mix(WHITE, ground, 0.25), ground))

  return [cellOf('▐', ground, TRACK), ...body, cellOf('▌', ground, TRACK)]
}

/** A finished plan's check; the active plan's spinner while Claude works; a dot otherwise; a red ✕ fading as its row goes. */
export function glyphCell(frame: PlanFrame, context: FrameContext): Cell {
  if (frame.dissolve !== undefined && frame.dissolve !== null) {
    return frame.dissolve > 0.6 ? BLANK : cellOf('✕', mix(DANGER, TRACK, frame.dissolve / 0.6))
  }

  if (isDone(frame.plan)) {
    const color = frame.flash === null ? EMERALD : mix(WHITE, EMERALD, easeOutCubic(frame.flash))

    return cellOf('✓', color)
  }

  if (context.isWorking && frame.isActive) {
    return cellOf(spinnerAt(context.now), LAVENDER)
  }

  return cellOf('•', LAVENDER)
}

/** The header's rule: `─` fading from the accent into the background. */
export function ruleCells(width: number): Cell[] {
  const cells: Cell[] = []

  for (let i = 0; i < width; i += 1) {
    const t = width <= 1 ? 0 : i / (width - 1)

    cells.push(cellOf('─', mix(RULE_FROM, RULE_TO, Math.sqrt(t)), DEFAULT_COLOR))
  }

  return cells
}

/**
 * A quota's meter on the terminal: a short rounded track whose braille
 * pixels fill what is left of the window, in the quota's color.
 */
export function quotaCells(remaining: number, color: Rgb, width: number, seed: number): Cell[] {
  const inner = Math.max(2, width - 2)
  const lit = Math.round((Math.max(0, Math.min(100, remaining)) / 100) * inner)
  const cells: Cell[] = [cellOf('▐', TRACK)]

  for (let i = 0; i < inner; i += 1) {
    if (i >= lit) {
      cells.push(cellOf(' ', TRACK, TRACK))
      continue
    }

    let code = NO_DOTS

    DOTS.forEach((bit, dot) => {
      if (noise(seed, i, dot) < 0.72) {
        code |= bit
      }
    })

    cells.push(cellOf(String.fromCodePoint(code), mix(color, WHITE, 0.12), TRACK))
  }

  cells.push(cellOf('▌', TRACK))

  return cells
}

/**
 * The terminal alert's wave: braille LEDs in the alert's color, whose dots
 * gather under a crest that travels left to right without end.
 */
export function alertWaveCells(width: number, now: number, color: Rgb, dim: Rgb): Cell[] {
  const cells: Cell[] = []
  const period = 2200
  const crest = ((now % period) / period) * (width + 16) - 8

  for (let i = 0; i < width; i += 1) {
    const near = Math.exp(-((i - crest) ** 2) / 18)
    const density = 0.12 + 0.8 * near
    let code = NO_DOTS

    DOTS.forEach((bit, dot) => {
      if (noise(41 + Math.floor(now / 160), i, dot) < density) {
        code |= bit
      }
    })

    cells.push(cellOf(String.fromCodePoint(code), mix(dim, color, 0.35 + 0.65 * near)))
  }

  return cells
}

/**
 * The terminal limit dial: the window's braille LEDs in its color, the zone
 * where the work would pause shaded amber, and an amber knob at the limit.
 */
export function limitDialCells(remaining: number, limit: number, color: Rgb, width: number, kind: string): Cell[] {
  const inner = Math.max(4, width - 2)
  const lit = Math.round((Math.max(0, Math.min(100, remaining)) / 100) * inner)
  const knob = Math.min(inner - 1, Math.max(0, Math.round((limit / 100) * inner)))
  const seed = seedOf(`dial:${kind}`)
  const cells: Cell[] = [cellOf('▐', TRACK)]

  for (let i = 0; i < inner; i += 1) {
    if (i === knob) {
      cells.push(cellOf('◆', AMBER_BRIGHT, TRACK))
      continue
    }

    const ground = i < knob ? mix(TRACK, AMBER_DIM, 0.55) : TRACK

    if (i >= lit) {
      cells.push(cellOf(i < knob ? '╱' : ' ', mix(AMBER_DIM, AMBER_BRIGHT, 0.25), ground))
      continue
    }

    let code = NO_DOTS

    DOTS.forEach((bit, dot) => {
      if (noise(seed, i, dot) < 0.7) {
        code |= bit
      }
    })

    cells.push(cellOf(String.fromCodePoint(code), i < knob ? AMBER_BRIGHT : mix(color, WHITE, 0.12), ground))
  }

  cells.push(cellOf('▌', TRACK))

  return cells
}
