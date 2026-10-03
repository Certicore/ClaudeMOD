import { AMBER, AMBER_BRIGHT, AMBER_DEEP, AMBER_DIM, EMERALD, EMERALD_DEEP, hexOf, INDIGO, INDIGO_BRIGHT, mix, noise, seedOf, WHITE, type Rgb } from '../palette'

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

/** What the limit picker draws: the window, what is left of it, and the limit chosen. */
export type LimitDial = {
  kind: string
  /** What is left of the window, 0 to 100, and its color. */
  remaining: number
  color: Rgb
  /** The limit set, in percent left; null while none is. */
  limit: number | null
  /** The limit the bar slides from, when it just moved; null at rest. */
  from: number | null
  width: number
  /** The picker just took the quota row's place: the dial opens out of its middle. */
  isOpening?: boolean
}

/** The dial's height: a bubble lane above, the track below. */
export const DIAL_HEIGHT = 42
/** The dial's track, its margins and its place in the drawing, shared with the click layer laid over it. */
export const DIAL_PAD = 8
export const DIAL_TRACK_Y = 25
export const DIAL_TRACK_H = 12

const FONT = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', Inter, system-ui, sans-serif"

/** An animation that plays once, `begin` seconds in, and holds its end. */
function once(attribute: string, values: string, begin: number, dur: number, extra = ''): string {
  return `<animate attributeName="${attribute}" values="${values}" begin="${begin.toFixed(2)}s" dur="${dur.toFixed(2)}s" fill="freeze"${extra}/>`
}

/**
 * The limit picker's dial: a wide LED track of what is left of the window;
 * the zone where the work would pause hatched in glowing amber; at the limit
 * a bar of light standing through the track, its glow breathing, and a
 * bubble above it that says `pause at 25%`. A new limit slides the bar, the
 * bubble and the zone together with an ease. With no limit yet, the bubble
 * invites a click instead.
 *
 * Opening, the dial grows out of its middle as the quota row gives way to
 * it, a gleam runs along the track, the LEDs pour in from the left, and the
 * bar drops into place with a bounce and a ring of light.
 */
export function limitDialOf(dial: LimitDial): string {
  const w = dial.width
  const h = DIAL_HEIGHT
  const trackY = DIAL_TRACK_Y
  const trackH = DIAL_TRACK_H
  const pad = DIAL_PAD
  const xOf = (percent: number) => pad + (Math.max(0, Math.min(100, percent)) / 100) * (w - pad * 2)
  const amber = hexOf(AMBER)
  const color = hexOf(dial.color)
  const seed = seedOf(`dial:${dial.kind}`)
  const remainingX = xOf(dial.remaining)
  const opening = dial.isOpening === true
  const ease = 'calcMode="spline" keyTimes="0;1" keySplines="0.16 1 0.3 1"'
  let leds = ''

  for (let x = pad + 1, column = 0; x + 2 <= remainingX - 1; x += 3, column += 1) {
    for (let row = 0; row < 3; row += 1) {
      if (noise(seed, column * 7 + row, 1) < 0.7) {
        const phase = ['', 'd', 'e'][Math.floor(noise(seed, column * 7 + row, 2) * 3)] ?? ''

        leds += `<rect x="${x}" y="${trackY + 2 + row * 3.4}" width="2" height="2" fill="${color}"${phase === '' ? '' : ` class="${phase}"`}/>`
      }
    }
  }

  const head =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" overflow="visible">` +
    `<style>@keyframes tz{0%,100%{opacity:.4}50%{opacity:1}}.d{animation:tz 3s ease-in-out infinite}.e{animation:tz 2.2s ease-in-out .9s infinite}` +
    `@keyframes kb{0%,100%{opacity:.45}50%{opacity:1}}.kb{animation:kb 1.6s ease-in-out infinite}</style>` +
    `<defs>` +
    `<pattern id="hz" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)"><rect width="2.2" height="6" fill="${amber}" fill-opacity="0.38"/></pattern>` +
    `<linearGradient id="zg" x1="0" x2="1"><stop offset="0" stop-color="${amber}" stop-opacity="0.05"/><stop offset="1" stop-color="${amber}" stop-opacity="0.32"/></linearGradient>` +
    `<linearGradient id="lb" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${hexOf(AMBER_BRIGHT)}"/><stop offset="1" stop-color="${amber}"/></linearGradient>` +
    `<linearGradient id="gl" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.65" stop-color="#fff" stop-opacity="0.6"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>` +
    `<filter id="kf" x="-200%" y="-50%" width="500%" height="200%"><feGaussianBlur stdDeviation="3"/></filter>` +
    `<clipPath id="tc"><rect x="${pad}" y="${trackY}" width="${w - pad * 2}" height="${trackH}" rx="${trackH / 2}"/></clipPath>` +
    (opening
      ? `<clipPath id="op"><rect x="${w / 2 - 30}" y="-8" width="60" height="${h + 16}">` +
        `<animate attributeName="x" from="${w / 2 - 30}" to="-6" begin="0s" dur="0.55s" fill="freeze" ${ease}/>` +
        `<animate attributeName="width" from="60" to="${w + 12}" begin="0s" dur="0.55s" fill="freeze" ${ease}/></rect></clipPath>` +
        `<clipPath id="lp"><rect x="${pad}" y="${trackY}" width="0" height="${trackH}">` +
        `<animate attributeName="width" from="0" to="${(remainingX - pad).toFixed(1)}" begin="0.3s" dur="0.6s" fill="freeze" ${ease}/></rect></clipPath>`
      : '') +
    `</defs>`
  const track = `<rect x="${pad}" y="${trackY}" width="${w - pad * 2}" height="${trackH}" rx="${trackH / 2}" fill="#8e8e96" fill-opacity="0.18"/>`
  const pouredLeds = opening ? `<g clip-path="url(#lp)">${leds}</g>` : leds
  // The gleam that runs along the track once it has opened.
  const gleam = opening
    ? `<g clip-path="url(#tc)"><rect x="-60" y="${trackY}" width="60" height="${trackH}" fill="url(#gl)" opacity="0">` +
      once('x', `-60;${w}`, 0.4, 0.7, ` ${ease.replace('0.16 1 0.3 1', '0.6 0 0.4 1')}`) +
      once('opacity', '0;1;1;0', 0.4, 0.7, ' keyTimes="0;0.15;0.8;1"') +
      `</rect></g>`
    : ''
  const fadeIn = (begin: number) => (opening ? ` opacity="0"` : '') + '>' + (opening ? once('opacity', '0;1', begin, 0.35) : '')
  const tail = (body: string) =>
    head + (opening ? `<g clip-path="url(#op)">` : '') + `<g${fadeIn(0)}${body}</g>` + (opening ? '</g>' : '') + '</svg>'

  if (dial.limit === null) {
    return tail(
      track +
        `<g clip-path="url(#tc)">${pouredLeds}</g>` +
        gleam +
        `<g${fadeIn(0.55)}<text x="${w / 2}" y="10" text-anchor="middle" dominant-baseline="central" font-family="${FONT}" font-size="11" font-weight="500" fill="${amber}" class="kb">click the bar to set a limit</text></g>`,
    )
  }

  const bar = xOf(dial.limit)
  const from = dial.from === null ? bar : xOf(dial.from)
  const moving = Math.abs(from - bar) > 0.5
  const spline = 'dur="0.42s" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines="0.22 1 0.36 1"'
  const slide = (a: number, b: number) => (moving ? `<animate attributeName="width" from="${a.toFixed(1)}" to="${b.toFixed(1)}" ${spline}/>` : '')
  const zone = (fill: string) =>
    `<rect x="0" y="${trackY}" width="${opening ? 0 : bar.toFixed(1)}" height="${trackH}" fill="${fill}">` +
    (opening ? `<animate attributeName="width" from="0" to="${bar.toFixed(1)}" begin="0.55s" dur="0.4s" fill="freeze" ${ease}/>` : slide(from, bar)) +
    `</rect>`
  const bubbleW = 92
  const bubbleShift = Math.max(bubbleW / 2 + 1, Math.min(w - bubbleW / 2 - 1, bar)) - bar
  // Opening, the bar drops in from above with a bounce, then a ring of light spreads from where it lands.
  const drop = opening
    ? `<animateTransform attributeName="transform" type="translate" values="0 -18;0 2.5;0 -0.8;0 0" keyTimes="0;0.55;0.8;1" begin="0.5s" dur="0.55s" fill="freeze"/>` +
      once('opacity', '0;1', 0.5, 0.18)
    : ''
  const landing = opening
    ? `<ellipse cx="0" cy="${trackY + trackH / 2}" rx="2" ry="2" fill="none" stroke="${hexOf(AMBER_BRIGHT)}" stroke-width="1.6" opacity="0">` +
      once('rx', '2;34', 0.82, 0.6) +
      once('ry', '2;13', 0.82, 0.6) +
      once('opacity', '0;0.95;0', 0.82, 0.6, ' keyTimes="0;0.15;1"') +
      `</ellipse>` +
      `<ellipse cx="0" cy="${trackY + trackH / 2}" rx="6" ry="9" fill="${amber}" filter="url(#kf)" opacity="0">` +
      once('opacity', '0;0.9;0', 0.78, 0.5, ' keyTimes="0;0.2;1"') +
      `</ellipse>`
    : ''

  return tail(
    track +
      `<g clip-path="url(#tc)">` +
      pouredLeds +
      zone('url(#zg)') +
      zone('url(#hz)') +
      `</g>` +
      gleam +
      `<g transform="translate(${bar.toFixed(1)} 0)">` +
      (moving ? `<animateTransform attributeName="transform" type="translate" from="${from.toFixed(1)} 0" to="${bar.toFixed(1)} 0" ${spline}/>` : '') +
      landing +
      `<g${opening ? ' opacity="0"' : ''}>` +
      drop +
      `<rect class="kb" x="-4" y="${trackY - 6}" width="8" height="${trackH + 10}" rx="4" fill="${amber}" fill-opacity="0.7" filter="url(#kf)"/>` +
      `<rect x="-1.75" y="${trackY - 5}" width="3.5" height="${trackH + 9}" rx="1.75" fill="url(#lb)"/>` +
      `<rect x="-0.6" y="${trackY - 4}" width="1.2" height="${trackH + 7}" rx="0.6" fill="#fff" fill-opacity="0.85"/>` +
      `<g transform="translate(${bubbleShift.toFixed(1)} 0)">` +
      `<rect x="${-bubbleW / 2}" y="1" width="${bubbleW}" height="17" rx="8.5" fill="${hexOf(AMBER_DEEP)}"/>` +
      `<rect x="${-bubbleW / 2 + 0.5}" y="1.5" width="${bubbleW - 1}" height="16" rx="8" fill="none" stroke="#fff" stroke-opacity="0.25"/>` +
      `<text x="0" y="10" text-anchor="middle" dominant-baseline="central" font-family="${FONT}" font-size="11" font-weight="600" fill="${hexOf(WHITE)}">pause at ${dial.limit}%</text>` +
      `</g>` +
      `<path d="M-4 18 L4 18 L0 22 Z" fill="${hexOf(AMBER_DEEP)}"/>` +
      `</g>` +
      `</g>`,
  )
}

/**
 * The picker's validate mark: an emerald disc with a soft breathing halo, a
 * glass highlight and a white check. Opening, the disc pops in after the
 * dial and the check draws itself stroke by stroke.
 */
export function confirmMarkOf(size: number, isOpening: boolean): string {
  const c = size / 2
  const r = size * 0.36
  const check = `M${(c - r * 0.45).toFixed(1)} ${(c + r * 0.02).toFixed(1)} L${(c - r * 0.1).toFixed(1)} ${(c + r * 0.36).toFixed(1)} L${(c + r * 0.5).toFixed(1)} ${(c - r * 0.34).toFixed(1)}`
  const length = (r * 1.45).toFixed(1)

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `<style>@keyframes hb{0%,100%{opacity:.35}50%{opacity:.8}}.hb{animation:hb 2.4s ease-in-out infinite}</style>` +
    `<defs>` +
    `<radialGradient id="ch"><stop offset="0" stop-color="${hexOf(EMERALD)}" stop-opacity="0.6"/><stop offset="1" stop-color="${hexOf(EMERALD)}" stop-opacity="0"/></radialGradient>` +
    `<linearGradient id="cd" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${hexOf(mix(EMERALD, WHITE, 0.25))}"/><stop offset="1" stop-color="${hexOf(EMERALD_DEEP)}"/></linearGradient>` +
    `</defs>` +
    `<g transform="translate(${c} ${c})"><g${isOpening ? ' transform="scale(0)"' : ''}>` +
    (isOpening
      ? `<animateTransform attributeName="transform" type="scale" values="0;1.18;1" keyTimes="0;0.6;1" begin="0.62s" dur="0.42s" fill="freeze"/>`
      : '') +
    `<g transform="translate(${-c} ${-c})">` +
    `<circle class="hb" cx="${c}" cy="${c}" r="${c}" fill="url(#ch)"/>` +
    `<circle cx="${c}" cy="${c}" r="${r}" fill="url(#cd)"/>` +
    `<ellipse cx="${c}" cy="${(c - r * 0.45).toFixed(1)}" rx="${(r * 0.62).toFixed(1)}" ry="${(r * 0.32).toFixed(1)}" fill="#fff" fill-opacity="0.22"/>` +
    `<circle cx="${c}" cy="${c}" r="${(r - 0.5).toFixed(1)}" fill="none" stroke="#fff" stroke-opacity="0.3"/>` +
    `<path d="${check}" fill="none" stroke="#fff" stroke-width="${(size * 0.09).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round"` +
    (isOpening
      ? ` stroke-dasharray="${length}" stroke-dashoffset="${length}">` + once('stroke-dashoffset', `${length};0`, 0.9, 0.32, ' calcMode="spline" keyTimes="0;1" keySplines="0.4 0 0.2 1"') + `</path>`
      : '/>') +
    `</g></g></g>` +
    `</svg>`
  )
}
