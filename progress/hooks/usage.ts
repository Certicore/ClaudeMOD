import type { SessionRateLimit } from 'claude-code'

import { DANGER, type Rgb } from './palette'

/** One plan-limit window as the band shows it: what is left of it and when it starts over. */
export type Quota = {
  /** `five_hour` or `seven_day`, as the engine names the window. */
  kind: string
  /** `5h`, `7d`. */
  label: string
  /** The share of the window left, 0 to 100. */
  remaining: number
  /** When the window resets, milliseconds since the epoch; absent when the engine did not say. */
  resetsAt?: number
}

/** The windows the band shows, in its order, with their labels. */
const WINDOWS: readonly (readonly [string, string])[] = [
  ['five_hour', '5h'],
  ['seven_day', '7d'],
]

/** Plenty left. */
export const QUOTA_OK: Rgb = 0x8ab4ff
/** Under a quarter left. */
export const QUOTA_LOW: Rgb = 0xfbbf24
/** Under a tenth left. */
export const QUOTA_CRITICAL: Rgb = DANGER

/** The 5-hour and 7-day windows among the engine's rate limits, each as a quota; the others left out. */
export function quotasOf(limits: readonly SessionRateLimit[]): Quota[] {
  const quotas: Quota[] = []

  for (const [kind, label] of WINDOWS) {
    const limit = limits.find(each => each.kind === kind)

    if (limit === undefined || !Number.isFinite(limit.percentUsed)) {
      continue
    }

    const resetsAt = limit.resetsAt === undefined ? Number.NaN : Date.parse(limit.resetsAt)
    const quota: Quota = { kind, label, remaining: Math.max(0, Math.min(100, 100 - limit.percentUsed)) }

    if (Number.isFinite(resetsAt)) {
      quota.resetsAt = resetsAt
    }

    quotas.push(quota)
  }

  return quotas
}

/** The quota's color: blue with plenty left, amber under a quarter, red under a tenth. */
export function quotaColorOf(remaining: number): Rgb {
  if (remaining < 10) {
    return QUOTA_CRITICAL
  }

  return remaining < 25 ? QUOTA_LOW : QUOTA_OK
}

/** `62% left`, whole percents, `<1% left` for a sliver. */
export function remainingTextOf(remaining: number): string {
  if (remaining > 0 && remaining < 1) {
    return '<1% left'
  }

  return `${Math.round(remaining)}% left`
}

/** `resets in 2h 14m`, `in 4d 6h`, `in 9m`; empty when the reset time is unknown. */
export function resetTextOf(quota: Quota, now: number): string {
  if (quota.resetsAt === undefined) {
    return ''
  }

  const minutes = Math.max(0, Math.round((quota.resetsAt - now) / 60_000))

  if (minutes < 1) {
    return 'resets now'
  }

  if (minutes < 60) {
    return `resets in ${minutes}m`
  }

  const hours = Math.floor(minutes / 60)

  if (hours < 24) {
    return `resets in ${hours}h ${String(minutes % 60).padStart(2, '0')}m`
  }

  return `resets in ${Math.floor(hours / 24)}d ${hours % 24}h`
}

/** The quota row's short form of the reset: `↻ 2h 14m`, `↻ 4d 6h`; empty when unknown. */
export function resetShortOf(quota: Quota, now: number): string {
  const text = resetTextOf(quota, now)

  return text === '' ? '' : text === 'resets now' ? '↻ now' : text.replace(/^resets in /, '↻ ')
}

/** The quota row's short form of what is left: `62%`, `<1%`. */
export function remainingShortOf(remaining: number): string {
  return remainingTextOf(remaining).replace(/ left$/, '')
}
