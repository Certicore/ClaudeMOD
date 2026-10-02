import { AMBER, AMBER_BRIGHT, AMBER_DEEP, AMBER_DIM, hexOf, INDIGO, INDIGO_BRIGHT, mix, noise, seedOf, WHITE, type Rgb } from '../palette'

/** Which pause is drawn: at the limit, waiting for a choice; or saved, waiting for the reset. */
export type AlertPhase = 'alert' | 'waiting'

/** The two looks of the alert. */
type Look = { color: Rgb; bright: Rgb; dim: Rgb }

const LOOKS: Record<AlertPhase, Look> = {
  alert: { color: AMBER, bright: AMBER_BRIGHT, dim: AMBER_DIM },
  waiting: { color: INDIGO, bright: INDIGO_BRIGHT, dim: 0x2d3160 },
}

/**
 * The alert's emblem: a breathing glow, three sonar rings rippling out, a
 * comet arc circling a dark core, and in the core a pause sign (at the
 * limit) or a clock whose hand sweeps (waiting for the reset, its arc
 * then the share of the wait already gone).
 */
export function alertRingOf(phase: AlertPhase, size: number, waited: number): string {
  const look = LOOKS[phase]
  const c = size / 2
  const color = hexOf(look.color)
  const bright = hexOf(look.bright)
  const track = size * 0.33
  const circumference = 2 * Math.PI * track
  const pulses = [0, 0.8, 1.6]
    .map(
      begin =>
        `<circle cx="${c}" cy="${c}" r="${size * 0.2}" fill="none" stroke="${color}" stroke-width="1.5">` +
        `<animate attributeName="r" values="${size * 0.2};${size * 0.49}" dur="2.4s" begin="${begin}s" repeatCount="indefinite"/>` +
        `<animate attributeName="stroke-opacity" values="0.8;0" dur="2.4s" begin="${begin}s" repeatCount="indefinite"/>` +
        `</circle>`,
    )
    .join('')
  const arc =
    phase === 'waiting'
      ? `<circle cx="${c}" cy="${c}" r="${track}" fill="none" stroke="url(#ag)" stroke-width="2.6" stroke-linecap="round" ` +
        `stroke-dasharray="${(circumference * Math.max(0.02, Math.min(1, waited))).toFixed(1)} ${circumference.toFixed(1)}" transform="rotate(-90 ${c} ${c})"/>`
      : `<g class="sp"><circle cx="${c}" cy="${c}" r="${track}" fill="none" stroke="url(#ag)" stroke-width="2.6" stroke-linecap="round" ` +
        `stroke-dasharray="${(circumference * 0.28).toFixed(1)} ${circumference.toFixed(1)}"/></g>`
  const core =
    phase === 'waiting'
      ? `<line x1="${c}" y1="${c}" x2="${c}" y2="${c - size * 0.13}" stroke="#fff" stroke-width="2" stroke-linecap="round">` +
        `<animateTransform attributeName="transform" type="rotate" from="0 ${c} ${c}" to="360 ${c} ${c}" dur="6s" repeatCount="indefinite"/></line>` +
        `<line x1="${c}" y1="${c}" x2="${c + size * 0.09}" y2="${c}" stroke="#fff" stroke-opacity="0.75" stroke-width="2" stroke-linecap="round"/>` +
        `<circle cx="${c}" cy="${c}" r="1.6" fill="#fff"/>`
      : `<rect x="${c - size * 0.1}" y="${c - size * 0.12}" width="${size * 0.07}" height="${size * 0.24}" rx="${size * 0.03}" fill="#fff"/>` +
        `<rect x="${c + size * 0.03}" y="${c - size * 0.12}" width="${size * 0.07}" height="${size * 0.24}" rx="${size * 0.03}" fill="#fff"/>`

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `<style>@keyframes sp{to{transform:rotate(360deg)}}.sp{transform-origin:${c}px ${c}px;animation:sp 2.6s linear infinite}` +
    `@keyframes gl{0%,100%{opacity:.45}50%{opacity:1}}.gl{animation:gl 2.4s ease-in-out infinite}</style>` +
    `<defs>` +
    `<radialGradient id="ah"><stop offset="0" stop-color="${color}" stop-opacity="0.55"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>` +
    `<linearGradient id="ag" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="${bright}"/><stop offset="1" stop-color="${color}"/></linearGradient>` +
    `<radialGradient id="ac" cx="0.4" cy="0.35"><stop offset="0" stop-color="${hexOf(mix(look.dim, look.color, 0.45))}"/><stop offset="1" stop-color="${hexOf(look.dim)}"/></radialGradient>` +
    `</defs>` +
    `<circle class="gl" cx="${c}" cy="${c}" r="${c}" fill="url(#ah)"/>` +
    pulses +
    `<circle cx="${c}" cy="${c}" r="${track}" fill="none" stroke="#fff" stroke-opacity="0.12" stroke-width="2.6"/>` +
    arc +
    `<circle cx="${c}" cy="${c}" r="${size * 0.24}" fill="url(#ac)" stroke="#fff" stroke-opacity="0.2"/>` +
    core +
    `</svg>`
  )
}

/**
 * The alert's wave: a strip of LEDs where a crest of light travels left to
 * right without end, each column a beat later than the one before, each
 * LED its own brightness, over a faint wash.
 */
export function alertWaveOf(phase: AlertPhase, width: number, height: number): string {
  const look = LOOKS[phase]
  const led = 2
  const pitch = 3
  const rows = Math.max(1, Math.floor((height - 1) / pitch))
  const top = Math.round((height - rows * pitch + (pitch - led)) / 2)
  const period = phase === 'alert' ? 1.9 : 3.2
  let columns = ''

  for (let x = 1, column = 0; x + led <= width - 1; x += pitch, column += 1) {
    let d = ''

    for (let row = 0; row < rows; row += 1) {
      if (noise(97, column * 13 + row, 1) < 0.78) {
        d += `M${x} ${top + row * pitch}h${led}v${led}h-${led}z`
      }
    }

    if (d === '') {
      continue
    }

    const delay = (-(1 - x / width) * period * 2).toFixed(2)
    const shade = hexOf(mix(look.dim, look.bright, 0.35 + 0.65 * noise(97, column, 2)))

    columns += `<path d="${d}" fill="${shade}" class="w" style="animation-delay:${delay}s"/>`
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<style>@keyframes wv{0%,100%{opacity:.12}50%{opacity:1}}.w{animation:wv ${period * 2}s ease-in-out infinite}</style>` +
    `<defs><linearGradient id="aw" x1="0" x2="1"><stop offset="0" stop-color="${hexOf(look.color)}" stop-opacity="0"/>` +
    `<stop offset="0.5" stop-color="${hexOf(look.color)}" stop-opacity="0.16"/><stop offset="1" stop-color="${hexOf(look.color)}" stop-opacity="0"/></linearGradient></defs>` +
    `<rect x="0" y="0" width="${width}" height="${height}" rx="${height / 2}" fill="url(#aw)"/>` +
    columns +
    `</svg>`
  )
}

/** What the limit picker draws: the window, what is left of it, and the limit being chosen. */
export type LimitDial = {
  kind: string
  /** What is left of the window, 0 to 100, and its color. */
  remaining: number
  color: Rgb
  /** The limit being chosen, in percent left. */
  limit: number
  /** The limit the knob slides from, when it just moved; null at rest. */
  from: number | null
  width: number
}

/** The dial's height: a bubble above, the track below. */
export const DIAL_HEIGHT = 42

/**
 * The limit picker's dial: a wide LED track of what is left of the window;
 * the zone where the work would pause hatched in glowing amber; a knob at
 * the limit, breathing, with a halo rippling out of it; a bubble riding
 * above it that says `pause at 25%`. A move slides the knob, the bubble and
 * the zone together with an ease.
 */
export function limitDialOf(dial: LimitDial): string {
  const w = dial.width
  const h = DIAL_HEIGHT
  const trackY = 25
  const trackH = 12
  const pad = 8
  const xOf = (percent: number) => pad + (Math.max(0, Math.min(100, percent)) / 100) * (w - pad * 2)
  const knob = xOf(dial.limit)
  const from = dial.from === null ? knob : xOf(dial.from)
  const moving = Math.abs(from - knob) > 0.5
  const spline = 'dur="0.42s" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines="0.22 1 0.36 1"'
  const remainingX = xOf(dial.remaining)
  const amber = hexOf(AMBER)
  const color = hexOf(dial.color)
  const seed = seedOf(`dial:${dial.kind}`)
  let leds = ''

  for (let x = pad + 1, column = 0; x + 2 <= remainingX - 1; x += 3, column += 1) {
    for (let row = 0; row < 3; row += 1) {
      if (noise(seed, column * 7 + row, 1) < 0.7) {
        const phase = ['', 'd', 'e'][Math.floor(noise(seed, column * 7 + row, 2) * 3)] ?? ''

        leds += `<rect x="${x}" y="${trackY + 2 + row * 3.4}" width="2" height="2" fill="${color}"${phase === '' ? '' : ` class="${phase}"`}/>`
      }
    }
  }

  const bubbleW = 92
  const bubbleShift = (x: number) => Math.max(bubbleW / 2 + 1, Math.min(w - bubbleW / 2 - 1, x)) - x
  const slide = (attribute: 'x' | 'width', a: number, b: number) =>
    moving ? `<animate attributeName="${attribute}" from="${a.toFixed(1)}" to="${b.toFixed(1)}" ${spline}/>` : ''

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<style>@keyframes tz{0%,100%{opacity:.4}50%{opacity:1}}.d{animation:tz 3s ease-in-out infinite}.e{animation:tz 2.2s ease-in-out .9s infinite}` +
    `@keyframes kb{0%,100%{opacity:.55}50%{opacity:1}}.kb{animation:kb 1.6s ease-in-out infinite}</style>` +
    `<defs>` +
    `<pattern id="hz" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)"><rect width="2.2" height="6" fill="${amber}" fill-opacity="0.38"/></pattern>` +
    `<linearGradient id="zg" x1="0" x2="1"><stop offset="0" stop-color="${amber}" stop-opacity="0.05"/><stop offset="1" stop-color="${amber}" stop-opacity="0.32"/></linearGradient>` +
    `<radialGradient id="kg" cx="0.35" cy="0.3"><stop offset="0" stop-color="${hexOf(AMBER_BRIGHT)}"/><stop offset="1" stop-color="${hexOf(AMBER_DEEP)}"/></radialGradient>` +
    `<filter id="kf" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="3.5"/></filter>` +
    `<clipPath id="tc"><rect x="${pad}" y="${trackY}" width="${w - pad * 2}" height="${trackH}" rx="${trackH / 2}"/></clipPath>` +
    `</defs>` +
    `<g clip-path="url(#tc)">` +
    `<rect x="0" y="${trackY}" width="${w}" height="${trackH}" fill="#8e8e96" fill-opacity="0.18"/>` +
    leds +
    `<rect x="0" y="${trackY}" width="${knob.toFixed(1)}" height="${trackH}" fill="url(#zg)">${slide('width', from, knob)}</rect>` +
    `<rect x="0" y="${trackY}" width="${knob.toFixed(1)}" height="${trackH}" fill="url(#hz)">${slide('width', from, knob)}</rect>` +
    `</g>` +
    `<g transform="translate(${knob.toFixed(1)} 0)">` +
    (moving
      ? `<animateTransform attributeName="transform" type="translate" from="${from.toFixed(1)} 0" to="${knob.toFixed(1)} 0" ${spline}/>`
      : '') +
    `<line x1="0" x2="0" y1="${trackY - 3}" y2="${trackY + trackH + 3}" stroke="${amber}" stroke-width="6" stroke-opacity="0.35" filter="url(#kf)"/>` +
    `<circle cx="0" cy="${trackY + trackH / 2}" r="8" fill="none" stroke="${amber}" stroke-width="1.5">` +
    `<animate attributeName="r" values="8;15" dur="1.8s" repeatCount="indefinite"/>` +
    `<animate attributeName="stroke-opacity" values="0.7;0" dur="1.8s" repeatCount="indefinite"/></circle>` +
    `<circle class="kb" cx="0" cy="${trackY + trackH / 2}" r="9" fill="${amber}" fill-opacity="0.45" filter="url(#kf)"/>` +
    `<circle cx="0" cy="${trackY + trackH / 2}" r="7" fill="url(#kg)" stroke="#fff" stroke-width="1.6"/>` +
    `<g transform="translate(${bubbleShift(knob).toFixed(1)} 0)">` +
    `<rect x="${-bubbleW / 2}" y="1" width="${bubbleW}" height="17" rx="8.5" fill="${hexOf(AMBER_DEEP)}"/>` +
    `<rect x="${-bubbleW / 2 + 0.5}" y="1.5" width="${bubbleW - 1}" height="16" rx="8" fill="none" stroke="#fff" stroke-opacity="0.25"/>` +
    `<text x="0" y="10" text-anchor="middle" dominant-baseline="central" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Text', Inter, system-ui, sans-serif" font-size="11" font-weight="600" fill="${hexOf(WHITE)}">` +
    `pause at ${dial.limit}%</text>` +
    `</g>` +
    `<path d="M-4 18 L4 18 L0 22 Z" fill="${hexOf(AMBER_DEEP)}"/>` +
    `</g>` +
    `</svg>`
  )
}

