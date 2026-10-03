import { AMBER, AMBER_BRIGHT, AMBER_DIM, EMERALD, EMERALD_DEEP, hexOf, INDIGO, INDIGO_BRIGHT, mix, noise, WHITE, type Rgb } from '../palette'

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

/** An animation that plays once, `begin` seconds in, and holds its end. */
function once(attribute: string, values: string, begin: number, dur: number, extra = ''): string {
  return `<animate attributeName="${attribute}" values="${values}" begin="${begin.toFixed(2)}s" dur="${dur.toFixed(2)}s" fill="freeze"${extra}/>`
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
