import { AMBER, AMBER_DEEP, EMERALD, hexOf, INDIGO, INDIGO_BRIGHT, LAVENDER, mix, noise, seedOf, WHITE, type Rgb } from '../palette'

/** What one desktop bar draws: its size, where it stands, how it moves, what its chip says. */
export type SvgBar = {
  /** The plan's id: the document's ids and the pixels' grain derive from it. */
  id: string
  /** CSS pixels across. */
  width: number
  /** CSS pixels down: the track's thickness. */
  height: number
  /** The share the bar stands at once any animation is over, 0 to 1. */
  share: number
  /** The share the head moves from, while it is moving; null at rest. */
  from: number | null
  /** How long the move takes from now, in milliseconds. */
  durationMs: number
  /** How many steps the plan has, and how many are done. */
  total: number
  step: number
  /** The chip's stage and its `n/total`. */
  label: string
  count: string
  isDone: boolean
  /** Claude works on this plan now: the pixels twinkle, a light sweeps, the glow breathes. */
  isLive: boolean
  /** A usage limit holds the work: the bar turns amber and only breathes. */
  isPaused?: boolean
  /** CSS pixels of air above and below the track, so stacked bars never touch. */
  padY?: number
  /** The ✕ was pressed: the bar comes apart, LED by LED, and the chip bursts. */
  isDissolving?: boolean
  /** The list just unfolded: the bar sweeps in from the left after this many seconds; absent at rest. */
  enterDelay?: number
}

/** How long a dissolving bar takes to come apart, its last LED's delay included. */
export const DISSOLVE_MS = 1100

/** The colors one state of the bar is drawn in. */
type Tone = {
  /** The pixels far from the head, at the head, and the chip. */
  dim: Rgb
  bright: Rgb
  chip: Rgb
}

const RUNNING: Tone = { dim: 0x4c4766, bright: 0xe6e1ff, chip: LAVENDER }
const FINISHED: Tone = { dim: 0x24543f, bright: 0xc6f7e2, chip: 0x22b07d }
const PAUSED: Tone = { dim: 0x4f3c1c, bright: 0xffe2a8, chip: AMBER_DEEP }

const FONT = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', Inter, 'Segoe UI', system-ui, sans-serif"
const FONT_SIZE = 12
/** One LED of the matrix, and the pitch between two. */
const LED = 3
const PITCH = 4
/** How far the wash's glow runs on past the head before it is gone. */
const FEATHER = 28
const CHIP_PAD = 11
const COUNT_GAP = 5
const EASE = '0.22 1 0.36 1'
/** The opacity steps the LEDs are sorted into: one path each, so the document stays small. */
const LEVELS = [0.16, 0.3, 0.46, 0.66, 0.86, 1]

/**
 * The desktop's bar, after the band in the reference shot: a softly domed
 * track; behind the head a matrix of square LEDs, sparse and dim at the
 * start, dense and bright at the head, each its own brightness, over a wash
 * of light that runs on under the chip and fades out past it, with no edge
 * anywhere; a bloom
 * of light behind the chip; the chip itself, `Stage 3/5`, a lit gradient
 * pill riding the head. The LEDs always twinkle one by one, a slow light
 * crosses the field now and then; while Claude works on the plan both
 * quicken and the bloom breathes. A move eases it all.
 * Drawn as an image: no frame, no ground of its own, in either theme.
 */
export function svgBarOf(bar: SvgBar): string {
  const { width: w, height: h } = bar
  const key = bar.id.replace(/[^a-z0-9]/gi, '').slice(0, 24) || 'p'
  const isPaused = bar.isPaused === true && !bar.isDone
  const tone = bar.isDone ? FINISHED : isPaused ? PAUSED : RUNNING
  const accent = hexOf(bar.isDone ? EMERALD : isPaused ? AMBER : tone.chip)
  const live = bar.isLive && !bar.isDone && !isPaused
  const chipH = h - 4
  const { chipW, headOf } = chipGeometryOf(bar)
  const head = headOf(bar.share)
  const from = bar.from === null ? null : headOf(bar.from)
  const moving = from !== null && Math.abs(from - head) > 0.5 && bar.durationMs > 0
  const dur = `${Math.max(0.05, bar.durationMs / 1000).toFixed(2)}s`
  const spline = `dur="${dur}" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines="${EASE}"`
  const reveal = Math.round(head + FEATHER)
  const revealFrom = from === null ? reveal : Math.round(from + FEATHER)
  const chipTo = Math.round(head - chipW)
  const chipFrom = from === null ? chipTo : Math.round(from - chipW)
  // Where the field shows its brightest: at the chip's left cap, not under it.
  const peakOf = (x: number) => Math.max(8, Math.round(x - chipW + chipH / 2))
  const peak = peakOf(head)
  const peakFrom = from === null ? peak : peakOf(from)
  const follow = (attribute: string, a: number, b: number) =>
    moving ? `<animate attributeName="${attribute}" from="${a}" to="${b}" ${spline}/>` : ''

  const padY = Math.max(0, Math.round(bar.padY ?? 0))
  const isDissolving = bar.isDissolving === true
  const enter = bar.enterDelay === undefined ? null : unfoldOf(`u${key}`, w, h, padY, bar.enterDelay)

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h + padY * 2}" viewBox="0 ${-padY} ${w} ${h + padY * 2}">` +
    `<style>` +
    `@keyframes tw{0%,100%{opacity:.15}50%{opacity:1}}` +
    `@keyframes tz{0%,100%{opacity:.35}50%{opacity:1}}` +
    `@keyframes br{0%,100%{opacity:.4}50%{opacity:.85}}` +
    `.a{animation:tw 1.4s ease-in-out infinite}.b{animation:tw 2.1s ease-in-out .7s infinite}.c{animation:tw 1.1s ease-in-out .35s infinite}` +
    `.d{animation:tz 3.1s ease-in-out infinite}.e{animation:tz 4.3s ease-in-out 1.4s infinite}.f{animation:tz 2.5s ease-in-out .8s infinite}` +
    `.br{animation:br 1.9s ease-in-out infinite}` +
    (bar.isDissolving === true
      ? `@keyframes fl{0%{transform:translate(0,0);opacity:1}30%{opacity:1;fill:#fff}100%{transform:translate(var(--dx),var(--dy)) scale(.4);opacity:0}}` +
        `.fl{transform-box:fill-box;transform-origin:center;animation:fl .7s cubic-bezier(.2,.7,.3,1) both}` +
        `@keyframes fo{to{opacity:0}}.fo{animation:fo .55s ease-out .25s both}` +
        `@keyframes cp{0%{transform:scale(1)}28%{transform:scale(1.14);opacity:1}100%{transform:scale(.15);opacity:0}}` +
        `.cp{transform-box:fill-box;transform-origin:center;animation:cp .5s cubic-bezier(.5,0,.75,0) both}`
      : '') +
    `</style>` +
    `<defs>` +
    `<clipPath id="k${key}"><rect x="0" y="0" width="${w}" height="${h}" rx="${h / 2}"/></clipPath>` +
    // The LEDs end under the chip's left cap, wherever the chip is on its way.
    `<clipPath id="r${key}"><rect x="0" y="0" width="${peak + 2}" height="${h}">${follow('width', peakFrom + 2, peak + 2)}</rect></clipPath>` +
    // The LEDs' ramp: dim at the start, bright at the head.
    `<linearGradient id="p${key}" gradientUnits="userSpaceOnUse" x1="0" x2="${peak}" y1="0" y2="0">` +
    `<stop offset="0" stop-color="${hexOf(tone.dim)}"/><stop offset="0.6" stop-color="${hexOf(mix(tone.dim, tone.bright, 0.55))}"/><stop offset="1" stop-color="${hexOf(tone.bright)}"/>` +
    `${follow('x2', peakFrom, peak)}</linearGradient>` +
    // The wash: nothing at the start, a glow at the head that runs on and fades past it.
    `<linearGradient id="w${key}" gradientUnits="userSpaceOnUse" x1="0" x2="${reveal}" y1="0" y2="0">` +
    `<stop offset="0" stop-color="${accent}" stop-opacity="0"/>` +
    `<stop offset="${((peak * 0.55) / reveal).toFixed(3)}" stop-color="${accent}" stop-opacity="0.07"/>` +
    `<stop offset="${(peak / reveal).toFixed(3)}" stop-color="${accent}" stop-opacity="0.36"/>` +
    `<stop offset="${(head / reveal).toFixed(3)}" stop-color="${accent}" stop-opacity="0.26"/>` +
    `<stop offset="1" stop-color="${accent}" stop-opacity="0"/>` +
    `${follow('x2', revealFrom, reveal)}</linearGradient>` +
    // The track's dome: a breath of light on its upper half.
    `<linearGradient id="d${key}" x1="0" x2="0" y1="0" y2="1">` +
    `<stop offset="0" stop-color="#fff" stop-opacity="0.09"/><stop offset="0.5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.08"/>` +
    `</linearGradient>` +
    `<linearGradient id="s${key}" x1="0" x2="1" y1="0" y2="0">` +
    `<stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.5" stop-color="#fff" stop-opacity="0.22"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>` +
    `</linearGradient>` +
    `<linearGradient id="c${key}" x1="0" x2="0" y1="0" y2="1">` +
    `<stop offset="0" stop-color="${hexOf(mix(tone.chip, WHITE, 0.22))}"/><stop offset="1" stop-color="${hexOf(tone.chip)}"/>` +
    `</linearGradient>` +
    `<filter id="g${key}" x="-60%" y="-120%" width="220%" height="340%"><feGaussianBlur stdDeviation="7"/></filter>` +
    (enter?.defs ?? '') +
    `</defs>` +
    (enter?.open ?? '') +
    `<g clip-path="url(#k${key})"${isDissolving ? ' class="fo"' : ''}>` +
    `<rect x="0" y="0" width="${w}" height="${h}" fill="#8e8e96" fill-opacity="0.17"/>` +
    // The wash needs no clip: its gradient fades to nothing past the head, and moves with it.
    `<rect x="0" y="0" width="${w}" height="${h}" fill="url(#w${key})"/>` +
    `<g clip-path="url(#r${key})">` +
    (isDissolving ? '' : ledsOf(bar, key, head, peak, h, live)) +
    (live
      ? `<rect x="-80" y="0" width="80" height="${h}" fill="url(#s${key})" transform="skewX(-18)"><animate attributeName="x" from="-80" to="${w + 40}" dur="2.4s" repeatCount="indefinite"/></rect>`
      : `<rect x="-80" y="0" width="80" height="${h}" fill="url(#s${key})" opacity="0.55" transform="skewX(-18)"><animate attributeName="x" values="-80;${w + 40};${w + 40}" keyTimes="0;0.55;1" dur="6.5s" repeatCount="indefinite"/></rect>`) +
    `</g>` +
    `<rect x="0" y="0" width="${w}" height="${h}" fill="url(#d${key})"/>` +
    (isDissolving ? flyingLedsOf(bar, key, head, peak, h, tone, chipTo + chipW / 2) : '') +
    `<g transform="translate(${chipTo} 0)">` +
    (moving ? `<animateTransform attributeName="transform" type="translate" from="${chipFrom} 0" to="${chipTo} 0" ${spline}/>` : '') +
    `<ellipse cx="${chipW / 2}" cy="${h / 2}" rx="${Math.round(chipW * 0.62)}" ry="${h}" fill="${accent}" filter="url(#g${key})"${live ? ' class="br"' : ' opacity="0.42"'}/>` +
    `</g>` +
    `</g>` +
    `<g transform="translate(${chipTo} 0)">` +
    (moving ? `<animateTransform attributeName="transform" type="translate" from="${chipFrom} 0" to="${chipTo} 0" ${spline}/>` : '') +
    (isDissolving ? `<g class="cp">` : '') +
    `<rect x="0" y="2" width="${chipW}" height="${chipH}" rx="${chipH / 2}" fill="url(#c${key})"/>` +
    `<rect x="0.5" y="2.5" width="${chipW - 1}" height="${chipH - 1}" rx="${(chipH - 1) / 2}" fill="none" stroke="#fff" stroke-opacity="0.28"/>` +
    `<text x="${chipW / 2}" y="${h / 2 + 0.5}" text-anchor="middle" dominant-baseline="central" font-family="${FONT}" font-size="${FONT_SIZE}" fill="#fff">` +
    `<tspan font-weight="600">${escapeXml(bar.label)}</tspan>` +
    `<tspan dx="${COUNT_GAP}" font-weight="500" fill-opacity="0.8">${escapeXml(bar.count)}</tspan>` +
    `</text>` +
    (isDissolving ? `</g>` : '') +
    `</g>` +
    (enter?.close ?? '') +
    `</svg>`
  )
}

/** What a waiting message's bar draws. */
export type WaitingBar = {
  id: string
  width: number
  height: number
  /** Its place in the queue, from 1. */
  position: number
  padY?: number
  /** The list just unfolded: the bar sweeps in after this many seconds. */
  enterDelay?: number
}

/**
 * A message waiting its turn: the same track, dark but for a sparse field
 * of indigo LEDs breathing slowly, a soft glow gliding back and forth
 * across it like a scanner, and at its start a glassy indigo chip,
 * `⧗ Waiting #1`, its hourglass turning over now and then. Nothing fills:
 * nothing has started.
 */
export function waitingBarOf(bar: WaitingBar): string {
  const { width: w, height: h } = bar
  const key = `q${bar.id.replace(/[^a-z0-9]/gi, '').slice(-20)}`
  const padY = Math.max(0, Math.round(bar.padY ?? 0))
  const chipH = h - 4
  const label = 'Waiting'
  const count = `#${bar.position}`
  const icon = 12
  const chipW = Math.round(icon + 5 + textWidth(label, 600) + COUNT_GAP + textWidth(count, 500) + CHIP_PAD * 2)
  const seed = seedOf(bar.id)
  const rows = Math.max(1, Math.floor((h - 4) / PITCH))
  const top = Math.round((h - rows * PITCH + (PITCH - LED)) / 2)
  const indigo = hexOf(INDIGO)
  const enter = bar.enterDelay === undefined ? null : unfoldOf(`u${key}`, w, h, padY, bar.enterDelay)
  const glide = 'calcMode="spline" keyTimes="0;0.5;1" keySplines="0.45 0 0.55 1;0.45 0 0.55 1"'
  let leds = ''

  for (let x = chipW + 6, column = 0; x + LED <= w - 4; x += PITCH, column += 1) {
    for (let row = 0; row < rows; row += 1) {
      if (noise(seed, column * 31 + row, 1) > 0.17) {
        continue
      }

      const phase = ['d', 'e', 'f'][Math.floor(noise(seed, column * 31 + row, 2) * 3)] ?? 'd'

      leds += `<rect x="${x}" y="${top + row * PITCH}" width="${LED}" height="${LED}" rx="0.6" fill="${indigo}" class="${phase}"/>`
    }
  }

  const cy = h / 2
  const hx = CHIP_PAD + icon / 2

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h + padY * 2}" viewBox="0 ${-padY} ${w} ${h + padY * 2}">` +
    `<style>@keyframes tz{0%,100%{opacity:.08}50%{opacity:.32}}` +
    `.d{animation:tz 3.6s ease-in-out infinite}.e{animation:tz 4.8s ease-in-out 1.2s infinite}.f{animation:tz 4.1s ease-in-out 2.4s infinite}</style>` +
    `<defs>` +
    `<clipPath id="k${key}"><rect x="0" y="0" width="${w}" height="${h}" rx="${h / 2}"/></clipPath>` +
    `<linearGradient id="d${key}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.09"/><stop offset="0.5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.08"/></linearGradient>` +
    `<radialGradient id="s${key}"><stop offset="0" stop-color="${hexOf(INDIGO_BRIGHT)}" stop-opacity="0.6"/><stop offset="0.45" stop-color="${indigo}" stop-opacity="0.28"/><stop offset="1" stop-color="${indigo}" stop-opacity="0"/></radialGradient>` +
    `<linearGradient id="c${key}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${hexOf(mix(INDIGO, 0x1c1c22, 0.35))}"/><stop offset="1" stop-color="${hexOf(mix(INDIGO, 0x1c1c22, 0.6))}"/></linearGradient>` +
    (enter?.defs ?? '') +
    `</defs>` +
    (enter?.open ?? '') +
    `<g clip-path="url(#k${key})">` +
    `<rect x="0" y="0" width="${w}" height="${h}" fill="#8e8e96" fill-opacity="0.13"/>` +
    leds +
    // The scanner: a soft glow gliding from the chip to the end and back.
    `<ellipse cx="${chipW}" cy="${cy}" rx="70" ry="${h * 0.9}" fill="url(#s${key})">` +
    `<animate attributeName="cx" values="${chipW};${w - 30};${chipW}" dur="5.2s" repeatCount="indefinite" ${glide}/>` +
    `</ellipse>` +
    `<rect x="0" y="0" width="${w}" height="${h}" fill="url(#d${key})"/>` +
    `</g>` +
    `<rect x="0" y="2" width="${chipW}" height="${chipH}" rx="${chipH / 2}" fill="url(#c${key})"/>` +
    `<rect x="0.5" y="2.5" width="${chipW - 1}" height="${chipH - 1}" rx="${(chipH - 1) / 2}" fill="none" stroke="${indigo}" stroke-opacity="0.75"/>` +
    // The hourglass, turning over every few seconds.
    `<g transform="translate(${hx} ${cy})"><g>` +
    `<animateTransform attributeName="transform" type="rotate" values="0;0;180;180" keyTimes="0;0.72;0.86;1" dur="3s" repeatCount="indefinite"/>` +
    `<path d="M-4 -5.5h8M-4 5.5h8M-3.2 -5.5c0 3 6.4 3 6.4 5.5s-6.4 2.5-6.4 5.5M3.2 -5.5c0 3-6.4 3-6.4 5.5s6.4 2.5 6.4 5.5" fill="none" stroke="${hexOf(INDIGO_BRIGHT)}" stroke-width="1.3" stroke-linecap="round"/>` +
    `<path d="M-1.8 3.6h3.6l-1.8-2z" fill="${hexOf(INDIGO_BRIGHT)}"/>` +
    `</g></g>` +
    `<text x="${CHIP_PAD + icon + 5}" y="${cy + 0.5}" dominant-baseline="central" font-family="${FONT}" font-size="${FONT_SIZE}" fill="${hexOf(INDIGO_BRIGHT)}">` +
    `<tspan font-weight="600">${label}</tspan>` +
    `<tspan dx="${COUNT_GAP}" font-weight="500" fill-opacity="0.75">${count}</tspan>` +
    `</text>` +
    (enter?.close ?? '') +
    `</svg>`
  )
}

/**
 * A bar's unfold, as the list opens: the drawing is revealed left to right
 * behind a travelling edge of light that flares as it goes and fades out at
 * the end, each row a beat after the one above.
 */
function unfoldOf(id: string, w: number, h: number, padY: number, delay: number): { defs: string; open: string; close: string } {
  const begin = `${delay.toFixed(2)}s`
  const spline = `begin="${begin}" dur="0.62s" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines="0.65 0 0.25 1"`

  return {
    defs:
      `<clipPath id="${id}"><rect x="-4" y="${-padY}" width="0" height="${h + padY * 2}"><animate attributeName="width" from="0" to="${w + 8}" ${spline}/></rect></clipPath>` +
      `<linearGradient id="${id}e" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.7" stop-color="#fff" stop-opacity="0.55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>`,
    open: `<g clip-path="url(#${id})">`,
    close:
      `</g>` +
      `<rect x="-40" y="0" width="40" height="${h}" rx="${h / 2}" fill="url(#${id}e)" opacity="0">` +
      `<animate attributeName="x" from="-40" to="${w - 4}" ${spline}/>` +
      `<animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.1;0.8;1" begin="${begin}" dur="0.7s" fill="freeze"/>` +
      `</rect>`,
  }
}

/**
 * The LED matrix from the start of the track to under the chip: on a
 * regular grid, each LED lit with a chance that climbs toward the head and
 * given a brightness of its own, brighter near the head; sorted into a few
 * paths by brightness and twinkle phase (brisk while Claude works, calm
 * otherwise, a quarter never twinkling) so a bar
 * of hundreds of LEDs stays a handful of elements.
 */
function ledsOf(bar: SvgBar, key: string, head: number, peak: number, h: number, live: boolean): string {
  const seed = seedOf(bar.id)
  const rows = Math.max(1, Math.floor((h - 4) / PITCH))
  const top = Math.round((h - rows * PITCH + (PITCH - LED)) / 2)
  const end = head - 4
  const paths = new Map<string, string>()

  for (let x = 3, column = 0; x + LED <= end; x += PITCH, column += 1) {
    const t = Math.min(1, x / Math.max(1, peak))

    for (let row = 0; row < rows; row += 1) {
      const coin = noise(seed, column * 31 + row, 1)

      if (coin > (bar.isDone ? 0.55 + 0.4 * t : 0.38 + 0.6 * t ** 1.2)) {
        continue
      }

      const glow = Math.min(1, 0.12 + 0.88 * noise(seed, column * 31 + row, 2) ** 1.3 * (0.3 + 0.95 * t))
      const level = LEVELS.findIndex(step => glow <= step + 0.001)
      const phase = (live ? ['', 'a', 'b', 'c'] : ['', 'd', 'e', 'f'])[Math.floor(noise(seed, column * 31 + row, 3) * 4)] ?? ''
      const bucket = `${level === -1 ? LEVELS.length - 1 : level}:${phase}`

      paths.set(bucket, `${paths.get(bucket) ?? ''}M${x} ${top + row * PITCH}h${LED}v${LED}h-${LED}z`)
    }
  }

  let out = ''

  for (const [bucket, d] of paths) {
    const [level = '0', phase = ''] = bucket.split(':')
    const opacity = LEVELS[Number(level)] ?? 1

    out += `<path d="${d}" fill="url(#p${key})" fill-opacity="${opacity}"${phase === '' ? '' : ` class="${phase}"`}/>`
  }

  return out
}

/** A text's width in the chip's font, from rough per-glyph advances; the chip centres it, so a small error only shifts the padding. */
function textWidth(text: string, weight: 500 | 600): number {
  let width = 0

  for (const char of text) {
    if (/[ilj.,:;'|!]/.test(char)) {
      width += 3.3
    } else if (/[ frt/()\-]/.test(char)) {
      width += 4.4
    } else if (/[mwMW]/.test(char)) {
      width += 10
    } else if (/[A-Z]/.test(char)) {
      width += 8
    } else if (/[0-9]/.test(char)) {
      width += 7
    } else {
      width += 6.7
    }
  }

  return width * (FONT_SIZE / 12) * (weight === 600 ? 1.04 : 1)
}

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** What a quota capsule draws, and how it comes in. */
export type QuotaBar = {
  kind: string
  /** What is left of the window, 0 to 100, and its color. */
  remaining: number
  color: Rgb
  /** The limit's notch, in percent left; none when undefined. */
  limit?: number
  /** Where the notch slides from, when it just moved. */
  limitFrom?: number | null
  /** The capsule grows out of its middle (the quota row coming back, a limit picker opening). */
  isGrowing?: boolean
  /** A gleam runs along it and its notch drops in with a ring of amber light. */
  isLanding?: boolean
  /** CSS pixels of air above and below the capsule. */
  padY?: number
}

/**
 * A quota's bar on the desktop: a slim capsule whose LEDs fill what is left
 * of the window, brightest at its end, in the quota's color, calmly
 * twinkling; the empty part a groove; the limit a white notch in an amber
 * glow. The limit picker draws the same capsule, wider.
 *
 * Growing, it opens out of its middle; landing, a gleam runs along it and
 * its notch drops in with a ring of amber light. A moved notch slides.
 */
export function quotaBarOf(quota: QuotaBar, width: number, height: number): string {
  const key = `q${quota.kind.replace(/[^a-z0-9]/gi, '')}`
  const seed = seedOf(quota.kind)
  const fill = Math.round((Math.max(0, Math.min(100, quota.remaining)) / 100) * width)
  const color = hexOf(quota.color)
  const led = 2
  const pitch = 3
  const rows = Math.max(1, Math.floor((height - 2) / pitch))
  const top = Math.round((height - rows * pitch + (pitch - led)) / 2)
  const paths = new Map<string, string>()

  for (let x = 2, column = 0; x + led <= fill - 1; x += pitch, column += 1) {
    const t = Math.min(1, x / Math.max(1, fill))

    for (let row = 0; row < rows; row += 1) {
      if (noise(seed, column * 17 + row, 1) > 0.62 + 0.36 * t) {
        continue
      }

      const level = Math.min(2, Math.floor(noise(seed, column * 17 + row, 2) * 3))
      const phase = ['', 'd', 'e'][Math.floor(noise(seed, column * 17 + row, 3) * 3)] ?? ''
      const bucket = `${level}:${phase}`

      paths.set(bucket, `${paths.get(bucket) ?? ''}M${x} ${top + row * pitch}h${led}v${led}h-${led}z`)
    }
  }

  let leds = ''

  for (const [bucket, d] of paths) {
    const [level = '0', phase = ''] = bucket.split(':')

    leds += `<path d="${d}" fill="url(#p${key})" fill-opacity="${[0.45, 0.72, 1][Number(level)] ?? 1}"${phase === '' ? '' : ` class="${phase}"`}/>`
  }

  const returning = quota.isGrowing === true
  const lit = quota.isLanding === true
  const padY = quota.padY ?? 0
  const ease = 'calcMode="spline" keyTimes="0;1" keySplines="0.16 1 0.3 1"'
  const grow = returning
    ? `<animate attributeName="x" from="${width / 2 - 4}" to="0" dur="0.45s" fill="freeze" ${ease}/>` +
      `<animate attributeName="width" from="8" to="${width}" dur="0.45s" fill="freeze" ${ease}/>`
    : ''
  const gleam = lit
    ? `<rect x="-24" y="0" width="24" height="${height}" fill="url(#g${key})" opacity="0">` +
      `<animate attributeName="x" from="-24" to="${width}" begin="0.35s" dur="0.6s" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines="0.6 0 0.4 1"/>` +
      `<animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.15;0.8;1" begin="0.35s" dur="0.6s" fill="freeze"/>` +
      `</rect>`
    : ''

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height + padY * 2}" viewBox="0 ${-padY} ${width} ${height + padY * 2}" overflow="visible">` +
    `<style>@keyframes tz{0%,100%{opacity:.4}50%{opacity:1}}.d{animation:tz 3.4s ease-in-out infinite}.e{animation:tz 2.6s ease-in-out 1.1s infinite}</style>` +
    `<defs>` +
    `<clipPath id="k${key}"><rect x="${returning ? width / 2 - 4 : 0}" y="0" width="${returning ? 8 : width}" height="${height}" rx="${height / 2}">${grow}</rect></clipPath>` +
    (lit
      ? `<linearGradient id="g${key}" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.65" stop-color="#fff" stop-opacity="0.7"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>`
      : '') +
    `<linearGradient id="p${key}" gradientUnits="userSpaceOnUse" x1="0" x2="${Math.max(fill, 1)}" y1="0" y2="0">` +
    `<stop offset="0" stop-color="${hexOf(mix(quota.color, 0x1c1c22, 0.55))}"/><stop offset="1" stop-color="${hexOf(mix(quota.color, WHITE, 0.25))}"/>` +
    `</linearGradient>` +
    `<linearGradient id="f${key}" gradientUnits="userSpaceOnUse" x1="0" x2="${Math.max(fill, 1)}" y1="0" y2="0">` +
    `<stop offset="0" stop-color="${color}" stop-opacity="0.18"/><stop offset="1" stop-color="${color}" stop-opacity="0.62"/>` +
    `</linearGradient>` +
    `<linearGradient id="w${key}" gradientUnits="userSpaceOnUse" x1="0" x2="${Math.max(fill, 1) + 14}" y1="0" y2="0">` +
    `<stop offset="0" stop-color="${color}" stop-opacity="0.04"/><stop offset="${(fill / (fill + 14)).toFixed(3)}" stop-color="${color}" stop-opacity="0.3"/><stop offset="1" stop-color="${color}" stop-opacity="0"/>` +
    `</linearGradient>` +
    `</defs>` +
    `<g clip-path="url(#k${key})">` +
    `<rect x="0" y="0" width="${width}" height="${height}" fill="#8e8e96" fill-opacity="0.17"/>` +
    `<rect x="0" y="0" width="${width}" height="${height}" fill="url(#w${key})"/>` +
    (fill > 0 ? `<rect x="0" y="0" width="${fill}" height="${height}" rx="${height / 2}" fill="url(#f${key})"/>` : '') +
    leds +
    gleam +
    `</g>` +
    limitMarkOf(quota.limit, width, height, lit, quota.limitFrom ?? null) +
    `</svg>`
  )
}

/** Where a quota's limit sits on its capsule: a bright notch with a soft amber glow. */
function limitMarkOf(limit: number | undefined, width: number, height: number, isLanding = false, from: number | null = null): string {
  if (limit === undefined) {
    return ''
  }

  const xOf = (percent: number) => Math.max(1.5, Math.min(width - 1.5, (percent / 100) * width))
  const x = xOf(limit).toFixed(1)
  const glow = Math.max(4, height * 0.42)
  const core = Math.max(1.4, height * 0.16)
  const shift = from === null ? 0 : xOf(from) - xOf(limit)
  const lines =
    `<line x1="${x}" x2="${x}" y1="0" y2="${height}" stroke="${hexOf(AMBER)}" stroke-opacity="0.45" stroke-width="${glow.toFixed(1)}" stroke-linecap="round"/>` +
    `<line x1="${x}" x2="${x}" y1="0.5" y2="${height - 0.5}" stroke="#fff" stroke-width="${core.toFixed(1)}" stroke-linecap="round"/>`
  // A moved notch slides over from where it stood.
  const mark =
    Math.abs(shift) > 0.5
      ? `<g><animateTransform attributeName="transform" type="translate" from="${shift.toFixed(1)} 0" to="0 0" dur="0.42s" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines="0.22 1 0.36 1"/>${lines}</g>`
      : lines

  if (!isLanding) {
    return mark
  }

  // Just validated: the notch drops in with a bounce, and a ring of amber light spreads from it.
  return (
    `<g opacity="0">` +
    `<animateTransform attributeName="transform" type="translate" values="0 -12;0 1.5;0 -0.5;0 0" keyTimes="0;0.55;0.8;1" begin="0.45s" dur="0.5s" fill="freeze"/>` +
    `<animate attributeName="opacity" values="0;1" begin="0.45s" dur="0.15s" fill="freeze"/>` +
    mark +
    `</g>` +
    `<ellipse cx="${x}" cy="${height / 2}" rx="1" ry="1" fill="none" stroke="${hexOf(AMBER)}" stroke-width="1.4" opacity="0">` +
    `<animate attributeName="rx" values="1;${Math.round(height * 1.6)}" begin="0.72s" dur="0.55s" fill="freeze"/>` +
    `<animate attributeName="ry" values="1;${Math.round(height * 0.9)}" begin="0.72s" dur="0.55s" fill="freeze"/>` +
    `<animate attributeName="opacity" values="0;0.95;0" keyTimes="0;0.15;1" begin="0.72s" dur="0.55s" fill="freeze"/>` +
    `</ellipse>`
  )
}

/**
 * A dissolving bar's LEDs: each its own square, flying up and away at its
 * own angle as it flares white and fades, the ones nearest the chip first.
 */
function flyingLedsOf(bar: SvgBar, key: string, head: number, peak: number, h: number, tone: Tone, chipCentre: number): string {
  const seed = seedOf(bar.id)
  const rows = Math.max(1, Math.floor((h - 4) / PITCH))
  const top = Math.round((h - rows * PITCH + (PITCH - LED)) / 2)
  const end = Math.min(head - 4, peak + 2)
  let out = ''
  let count = 0

  for (let x = 3, column = 0; x + LED <= end && count < 900; x += PITCH, column += 1) {
    const t = Math.min(1, x / Math.max(1, peak))

    for (let row = 0; row < rows; row += 1) {
      const n = column * 31 + row

      if (noise(seed, n, 1) > (bar.isDone ? 0.55 + 0.4 * t : 0.38 + 0.6 * t ** 1.2)) {
        continue
      }

      const dx = ((noise(seed, n, 4) - 0.25) * 30).toFixed(1)
      const dy = (-(5 + noise(seed, n, 5) * 20) * (noise(seed, n, 6) < 0.18 ? -0.6 : 1)).toFixed(1)
      const delay = ((1 - t) * 0.38 + noise(seed, n, 7) * 0.08).toFixed(2)
      const color = hexOf(mix(tone.dim, tone.bright, 0.25 + 0.75 * t))

      out += `<rect class="fl" x="${x}" y="${top + row * PITCH}" width="${LED}" height="${LED}" fill="${color}" style="--dx:${dx}px;--dy:${dy}px;animation-delay:${delay}s"/>`
      count += 1
    }
  }

  void chipCentre

  return out
}


/** Where a bar's chip sits: its width, and the head (its right edge) for a share. */
export function chipGeometryOf(bar: Pick<SvgBar, 'width' | 'label' | 'count'>): { chipW: number; headOf: (share: number) => number } {
  const w = bar.width
  const chipW = Math.round(textWidth(bar.label, 600) + COUNT_GAP + textWidth(bar.count, 500) + CHIP_PAD * 2)

  return { chipW, headOf: (share: number) => Math.min(w - 2, Math.max(chipW + 2, 2 + share * (w - 4))) }
}

/** The chip's centre in a bar's SVG, in CSS pixels from its left edge. */
export function chipCentreOf(bar: Pick<SvgBar, 'width' | 'label' | 'count' | 'share'>): number {
  const { chipW, headOf } = chipGeometryOf(bar)

  return Math.round(headOf(bar.share) - chipW / 2)
}

/** What the burst layer draws: how big, where the chip was, in which color. */
export type Burst = {
  width: number
  height: number
  /** The chip's centre, from the layer's left edge, in CSS pixels; the layer is centred on the bar. */
  cx: number
  /** The chip's width, which sets the burst's scale. */
  chipW: number
  isDone: boolean
}

/**
 * The ✕'s burst, drawn on a layer of its own over the band, in front of
 * everything and taller than the row so nothing cuts it: a radial flash
 * where the chip pops, a sharp white shockwave and a wide colored one in
 * its wake, both glowing, a star of spark trails streaking outward, and
 * glitter drifting down as it all fades. Played once, as the layer mounts.
 */
export function burstLayerOf(burst: Burst): string {
  const { width: w, height: h, cx } = burst
  const cy = h / 2
  const accent = hexOf(burst.isDone ? EMERALD : LAVENDER)
  const bright = hexOf(burst.isDone ? 0xc6f7e2 : 0xe6e1ff)
  const reach = Math.max(42, Math.min(h / 2 - 4, burst.chipW * 0.62))
  const once = (attribute: string, values: string, begin: number, dur: number, keyTimes?: string) =>
    `<animate attributeName="${attribute}" values="${values}" begin="${begin}s" dur="${dur}s" fill="freeze"` +
    (keyTimes === undefined ? '' : ` keyTimes="${keyTimes}"`) +
    ` calcMode="${keyTimes === undefined ? 'spline' : 'linear'}"` +
    (keyTimes === undefined ? ` keyTimes="0;1" keySplines="0.16 1 0.3 1"` : '') +
    `/>`
  let trails = ''

  for (let i = 0; i < 18; i += 1) {
    const angle = (i / 18) * Math.PI * 2 + (noise(23, i, 1) - 0.5) * 0.3
    const length = reach * (0.75 + noise(23, i, 2) * 0.55) * (1.35 - 0.35 * Math.abs(Math.sin(angle)))
    const x2 = (cx + Math.cos(angle) * length).toFixed(1)
    const y2 = (cy + Math.sin(angle) * length * 0.82).toFixed(1)
    const dash = Math.round(length)
    const color = i % 3 === 0 ? '#fff' : i % 3 === 1 ? bright : accent
    const begin = (0.1 + noise(23, i, 3) * 0.08).toFixed(2)

    trails +=
      `<line x1="${cx}" y1="${cy}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${(1.2 + noise(23, i, 4)).toFixed(1)}" stroke-linecap="round" ` +
      `stroke-dasharray="${Math.round(dash * 0.32)} ${dash * 2}" stroke-dashoffset="${Math.round(dash * 0.32)}" opacity="0">` +
      `<animate attributeName="stroke-dashoffset" values="${Math.round(dash * 0.32)};${-Math.round(dash * 0.7)}" begin="${begin}s" dur="0.62s" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines="0.16 1 0.3 1"/>` +
      `<animate attributeName="opacity" values="0;1;0" keyTimes="0;0.12;1" begin="${begin}s" dur="0.62s" fill="freeze"/>` +
      `</line>`
  }

  let glitter = ''

  for (let i = 0; i < 14; i += 1) {
    const angle = noise(29, i, 1) * Math.PI * 2
    const r = reach * (0.35 + noise(29, i, 2) * 0.6)
    const x = (cx + Math.cos(angle) * r).toFixed(1)
    const y = cy + Math.sin(angle) * r * 0.6
    const begin = (0.22 + noise(29, i, 3) * 0.2).toFixed(2)

    glitter +=
      `<circle cx="${x}" cy="${y.toFixed(1)}" r="${(0.9 + noise(29, i, 4) * 0.9).toFixed(1)}" fill="${i % 2 === 0 ? '#fff' : bright}" opacity="0">` +
      `<animate attributeName="opacity" values="0;1;0.8;0" keyTimes="0;0.15;0.5;1" begin="${begin}s" dur="0.75s" fill="freeze"/>` +
      `<animate attributeName="cy" values="${y.toFixed(1)};${(y + 10 + noise(29, i, 5) * 8).toFixed(1)}" begin="${begin}s" dur="0.75s" fill="freeze"/>` +
      `</circle>`
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<defs>` +
    `<radialGradient id="bf"><stop offset="0" stop-color="#fff" stop-opacity="1"/><stop offset="0.35" stop-color="${bright}" stop-opacity="0.75"/>` +
    `<stop offset="0.7" stop-color="${accent}" stop-opacity="0.25"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient>` +
    `<filter id="bg" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3"/></filter>` +
    `<filter id="bs" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.2"/></filter>` +
    `</defs>` +
    // the flash where the chip pops
    `<ellipse cx="${cx}" cy="${cy}" rx="4" ry="3" fill="url(#bf)" opacity="0">` +
    once('rx', `4;${Math.round(burst.chipW * 0.7)}`, 0.06, 0.4) +
    once('ry', `3;${Math.round(reach * 0.55)}`, 0.06, 0.4) +
    `<animate attributeName="opacity" values="0;1;0" keyTimes="0;0.2;1" begin="0.06s" dur="0.45s" fill="freeze"/>` +
    `</ellipse>` +
    // the wide colored shockwave, glowing
    `<ellipse cx="${cx}" cy="${cy}" rx="6" ry="4" fill="none" stroke="${accent}" stroke-width="5" opacity="0" filter="url(#bg)">` +
    once('rx', `6;${Math.round(reach * 1.25)}`, 0.12, 0.75) +
    once('ry', `4;${Math.round(reach * 0.78)}`, 0.12, 0.75) +
    `<animate attributeName="opacity" values="0;0.9;0" keyTimes="0;0.15;1" begin="0.12s" dur="0.75s" fill="freeze"/>` +
    `<animate attributeName="stroke-width" values="5;1" begin="0.12s" dur="0.75s" fill="freeze"/>` +
    `</ellipse>` +
    // the sharp white shockwave ahead of it
    `<ellipse cx="${cx}" cy="${cy}" rx="5" ry="3" fill="none" stroke="#fff" stroke-width="1.8" opacity="0" filter="url(#bs)">` +
    once('rx', `5;${Math.round(reach * 1.05)}`, 0.08, 0.5) +
    once('ry', `3;${Math.round(reach * 0.62)}`, 0.08, 0.5) +
    `<animate attributeName="opacity" values="0;1;0" keyTimes="0;0.1;1" begin="0.08s" dur="0.5s" fill="freeze"/>` +
    `<animate attributeName="stroke-width" values="1.8;0.3" begin="0.08s" dur="0.5s" fill="freeze"/>` +
    `</ellipse>` +
    trails +
    glitter +
    `</svg>`
  )
}

/** One plan as the folded list's rings draw it. */
export type RingSegment = {
  id: string
  /** Its share, 0 to 1. */
  share: number
  isDone: boolean
  /** Claude works on it now: a spark circles its ring. */
  isLive: boolean
  /** A message waiting its turn: a dashed indigo ring, slowly turning. */
  isWaiting?: boolean
}

/** The rings' height, a ring's diameter and the pitch between two, in CSS pixels. */
export const RINGS_PX = 24
const RING_D = 20
const RING_PITCH = 32
/** The most rings drawn; older finished plans beyond them fold into a `+n`. */
const RINGS_MAX = 12

/**
 * The folded list: one ring per plan, joined by a thread, as a stepper
 * reads. A finished plan is an emerald disc with its check; a running one a
 * lavender arc around a grey track, as far round as its share, its core
 * breathing, and a spark circling it while Claude works on it. More plans
 * than fit fold their oldest finished ones into `+n`. Just folded, the rings
 * fade in one after the other.
 */
export function ringsOf(segments: readonly RingSegment[], isEntering: boolean): { source: string; width: number } {
  let shown = [...segments]
  let hidden = 0

  while (shown.length > RINGS_MAX) {
    const index = shown.findIndex(segment => segment.isDone)

    shown.splice(index === -1 ? 0 : index, 1)
    hidden += 1
  }

  const lead = hidden > 0 ? 26 : 0
  const width = lead + 2 + RING_D + Math.max(0, shown.length - 1) * RING_PITCH + 2
  const cy = RINGS_PX / 2
  const r = RING_D / 2 - 2
  const circumference = 2 * Math.PI * r
  const emerald = hexOf(EMERALD)
  const lavender = hexOf(LAVENDER)
  let body = hidden > 0 ? `<text x="${lead / 2}" y="${cy}" text-anchor="middle" dominant-baseline="central" font-family="${FONT}" font-size="11" font-weight="600" fill="#9a9aa3">+${hidden}</text>` : ''

  shown.forEach((segment, index) => {
    const cx = lead + 2 + RING_D / 2 + index * RING_PITCH
    const enter = isEntering
      ? ` opacity="0"><animate attributeName="opacity" from="0" to="1" begin="${(index * 0.05).toFixed(2)}s" dur="0.3s" fill="freeze"/>`
      : '>'

    if (index > 0) {
      const done = shown[index - 1]?.isDone === true

      body += `<line x1="${cx - RING_PITCH + RING_D / 2 + 3}" x2="${cx - RING_D / 2 - 3}" y1="${cy}" y2="${cy}" stroke="${done ? emerald : '#8e8e96'}" stroke-opacity="${done ? 0.55 : 0.3}" stroke-width="2" stroke-linecap="round"/>`
    }

    if (segment.isWaiting === true) {
      body +=
        `<g${enter}` +
        `<g class="wt" style="transform-origin:${cx}px ${cy}px"><circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${hexOf(INDIGO)}" stroke-width="2" stroke-dasharray="3.2 3.2" stroke-linecap="round"/></g>` +
        `<circle class="br" cx="${cx}" cy="${cy}" r="2.4" fill="${hexOf(INDIGO)}"/>` +
        `</g>`

      return
    }

    if (segment.isDone) {
      body +=
        `<g${enter}` +
        `<circle cx="${cx}" cy="${cy}" r="${r + 1.5}" fill="url(#rd)"/>` +
        `<ellipse cx="${cx}" cy="${cy - r * 0.45}" rx="${r * 0.6}" ry="${r * 0.3}" fill="#fff" fill-opacity="0.22"/>` +
        `<path d="M${cx - 4.2} ${cy + 0.2}l2.8 2.8 5.4-5.6" fill="none" stroke="#0b3b2a" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/>` +
        `</g>`

      return
    }

    const arc = Math.max(0, Math.min(1, segment.share)) * circumference

    body +=
      `<g${enter}` +
      `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#8e8e96" stroke-opacity="0.28" stroke-width="2.6"/>` +
      (arc > 0.5
        ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${lavender}" stroke-opacity="0.35" stroke-width="5" stroke-dasharray="${arc.toFixed(1)} ${circumference.toFixed(1)}" transform="rotate(-90 ${cx} ${cy})" filter="url(#rg)"/>` +
          `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="url(#ra)" stroke-width="2.6" stroke-linecap="round" stroke-dasharray="${arc.toFixed(1)} ${circumference.toFixed(1)}" transform="rotate(-90 ${cx} ${cy})"/>`
        : '') +
      `<circle class="br" cx="${cx}" cy="${cy}" r="3" fill="${lavender}"/>` +
      (segment.isLive
        ? `<g class="or" style="transform-origin:${cx}px ${cy}px"><circle cx="${cx}" cy="${cy - r}" r="3.2" fill="${lavender}" fill-opacity="0.45" filter="url(#rg)"/><circle cx="${cx}" cy="${cy - r}" r="1.6" fill="#fff"/></g>`
        : '') +
      `</g>`
  })

  return {
    width,
    source:
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${RINGS_PX}" viewBox="0 0 ${width} ${RINGS_PX}">` +
      `<style>@keyframes br{0%,100%{opacity:.45}50%{opacity:1}}.br{animation:br 2.4s ease-in-out infinite}` +
      `@keyframes or{to{transform:rotate(360deg)}}.or{animation:or 2.4s linear infinite}.wt{animation:or 9s linear infinite}</style>` +
      `<defs>` +
      `<linearGradient id="rd" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${hexOf(mix(EMERALD, WHITE, 0.25))}"/><stop offset="1" stop-color="#149a6c"/></linearGradient>` +
      `<linearGradient id="ra" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#e6e1ff"/><stop offset="1" stop-color="${lavender}"/></linearGradient>` +
      `<filter id="rg" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.6"/></filter>` +
      `</defs>` +
      body +
      `</svg>`,
  }
}
