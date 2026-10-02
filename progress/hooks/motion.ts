/**
 * Time in the band: how long a fill and a completion flash take, where a
 * bar stands mid-animation, and what the spinner and the shimmer show at a
 * given instant. All pure: the clock's reading comes in as `now`.
 */

/** How long a bar takes to move to its new fill. */
export const FILL_MS = 900
/** How long a finished plan's bar glows white before it settles to emerald. */
export const FLASH_MS = 1100
/** One sweep of the shimmer across the filled part. */
export const SHIMMER_MS = 1700
/** The frame loop's period: 20 frames a second. */
export const FRAME_MS = 50
/** How often the dither's pixels reshuffle while Claude works on the plan, and at rest. */
export const TWINKLE_MS = 140
export const TWINKLE_IDLE_MS = 420

/** A fill moving from one share to another, started at `startedAt`. */
export type Fill = {
  from: number
  to: number
  startedAt: number
}

const SPINNER = ['⣾', '⣽', '⣻', '⢿', '⡿', '⣟', '⣯', '⣷']
const SPINNER_MS = 80

/** Fast at first, settling at the end. */
export function easeOutCubic(t: number): number {
  const k = Math.max(0, Math.min(1, t))

  return 1 - (1 - k) ** 3
}

/** The share of the bar shown at `now`, `fill`'s target once it is over. */
export function shownShare(fill: Fill, now: number): number {
  const t = (now - fill.startedAt) / FILL_MS

  return fill.from + (fill.to - fill.from) * easeOutCubic(t)
}

export function isFilling(fill: Fill | undefined, now: number): boolean {
  return fill !== undefined && now - fill.startedAt < FILL_MS
}

/** How far into its flash a plan is, 0 to 1, or null when it has none running. */
export function flashProgress(startedAt: number | undefined, now: number): number | null {
  if (startedAt === undefined) {
    return null
  }

  const t = (now - startedAt) / FLASH_MS

  return t >= 0 && t < 1 ? t : null
}

/** The spinner's glyph at `now`. */
export function spinnerAt(now: number): string {
  return SPINNER[Math.floor(now / SPINNER_MS) % SPINNER.length] ?? '⣾'
}

/**
 * Where the shimmer's crest is at `now`, in cells, over a filled part
 * `filled` cells long: it enters from the left and leaves past the head.
 */
export function shimmerCrest(now: number, filled: number): number {
  const lead = 6
  const t = (now % SHIMMER_MS) / SHIMMER_MS

  return -lead + t * (filled + lead * 2)
}

/** How bright the shimmer makes a cell `distance` cells from its crest, 0 to 1. */
export function shimmerGlow(distance: number): number {
  const spread = 2.4

  return Math.exp(-(distance * distance) / (2 * spread * spread))
}

/** The dither's frame at `now`: it never stops, and runs faster while Claude works on the plan. */
export function twinkleTick(now: number, isLive: boolean): number {
  return Math.floor(now / (isLive ? TWINKLE_MS : TWINKLE_IDLE_MS))
}
