/**
 * The band's colors. Raster cells take `0x00RRGGBB` numbers; Text and Svg
 * take the same colors as `#rrggbb` strings.
 */

/** A color as a Raster cell takes it: `0x00RRGGBB`. */
export type Rgb = number

/** The terminal's own color, as a Raster cell spells it. */
export const DEFAULT_COLOR: Rgb = 0x01000000

/** The lavender of a running plan: its chip, its dot, its brightest pixels. */
export const LAVENDER: Rgb = 0xa99cf6
/** The chip's ground on the terminal, a shade deeper so white text reads on it. */
export const LAVENDER_DEEP: Rgb = 0x8473ea
/** The faintest pixels of the dither, far from the head. */
export const LAVENDER_DIM: Rgb = 0x6a6390

/** The amber of a pause at a limit: the alert, and the plans it holds. */
export const AMBER: Rgb = 0xf5a524
export const AMBER_BRIGHT: Rgb = 0xffdc9a
export const AMBER_DEEP: Rgb = 0xc77d0a
export const AMBER_DIM: Rgb = 0x5c4520

/** The indigo of a pause that waits for the window to reset. */
export const INDIGO: Rgb = 0x818cf8
export const INDIGO_BRIGHT: Rgb = 0xd4dafe

/** The emerald of a finished plan. */
export const EMERALD: Rgb = 0x34d399
export const EMERALD_DEEP: Rgb = 0x149a6c
export const EMERALD_DIM: Rgb = 0x2c6b56

/** The track the bar runs in, on the terminal. */
export const TRACK: Rgb = 0x2c2c33
/** The percent, the ✕ and the other quiet text. */
export const MUTED: Rgb = 0x9a9aa3

/** The header's rule, from its bright end to its faded one. */
export const RULE_FROM: Rgb = 0x7c6cf0
export const RULE_TO: Rgb = 0x26263a

export const WHITE: Rgb = 0xffffff
/** What the ✕ turns to under the pointer. */
export const DANGER: Rgb = 0xf87171

/** `#rrggbb`, as Text and Svg take a color. */
export function hexOf(color: Rgb): string {
  return `#${(color & 0xffffff).toString(16).padStart(6, '0')}`
}

/** The color `t` (0 to 1) of the way from `a` to `b`, channel by channel. */
export function mix(a: Rgb, b: Rgb, t: number): Rgb {
  const k = Math.max(0, Math.min(1, t))
  const channel = (shift: number) => {
    const from = (a >> shift) & 0xff
    const to = (b >> shift) & 0xff

    return Math.round(from + (to - from) * k) & 0xff
  }

  return (channel(16) << 16) | (channel(8) << 8) | channel(0)
}

/** A stable pseudo-random number in [0, 1) for three integers: the dither's coin. */
export function noise(a: number, b: number, c: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be59b, 0xc2b2ae35) ^ Math.imul(c + 0x27d4eb2f, 0x165667b1)

  h ^= h >>> 15
  h = Math.imul(h, 0x2c1b3c6d)
  h ^= h >>> 12
  h = Math.imul(h, 0x297a2d39)
  h ^= h >>> 15

  return (h >>> 0) / 4294967296
}

/** A small integer seed from a plan's id, so each bar has its own grain. */
export function seedOf(id: string): number {
  let h = 0x811c9dc5

  for (const char of id) {
    h = Math.imul(h ^ (char.codePointAt(0) ?? 0), 0x01000193)
  }

  return h >>> 0
}
