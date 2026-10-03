import type { BoxProps, ButtonProps, ClientProps, ElementConstructor, RasterProps, RenderElement, SvgProps, TextProps } from 'claude-code'

import { LIMIT_MAX, LIMIT_MIN, LIMIT_START, LIMIT_STEP, type Limits, type Pause } from '../guard'
import { alertWaveCells, limitDialCells } from '../meter'
import { AMBER, AMBER_DIM, hexOf, INDIGO, LAVENDER, MUTED } from '../palette'
import { encodeRows } from '../raster'
import { quotaColorOf, remainingTextOf, resetTextOf, type Quota } from '../usage'
import { alertRingOf, alertWaveOf, confirmMarkOf } from './svg-alert'
import { quotaBarOf } from './svg-bar'

type Box = ElementConstructor<BoxProps>
type Text = ElementConstructor<TextProps>
type Button = ElementConstructor<ButtonProps>

/** What the band needs of the usage guard: the limits, the editor, the pause, and what the buttons do. */
export type GuardView = {
  limits: Limits
  /** The window whose limit picker is open, or null. */
  editing: string | null
  /** The limit the picker shows (null while the window has none), and the one its bar slides from after a move. */
  draft: number | null
  draftFrom: number | null
  /** The picker just took the quota row's place: its dial opens out. */
  isOpening: boolean
  /** The window whose ✓ was just pressed: the quota row comes back with it lit. */
  justSet: string | null
  /** The dial's drag region runs on this surface; where it does not, the track takes clicks instead. */
  isDragReady: boolean
  /** Sets the limit where the track was clicked, and slides the bar there. */
  onPick: (limit: number) => void
  pause: Pause | null
  /** Opens a window's picker in the quota row's place, or leaves it unchanged when it is the open one. */
  onEdit: (kind: string) => void
  /** Moves the picker's bar by steps of 5%. */
  onNudge: (delta: number) => void
  /** The ✓: keeps the limit the picker shows and brings the quota row back. */
  onConfirm: () => void
  /** Clears the picker's limit; the ✓ then lifts it. */
  onClear: () => void
  onSave: () => void
  onResume: () => void
}

/** The Raster key of the terminal alert's wave: what the frame loop repaints. */
export const ALERT_WAVE_KEY = 'alert-wave'

/** The words of the alert card for a pause, as of `now`. */
export function alertWordsOf(pause: Pause, now: number): { title: string; subtitle: string } {
  const reset = pause.resetsAt === undefined ? '' : resetTextOf({ kind: pause.kind, label: pause.label, remaining: 0, resetsAt: pause.resetsAt }, now)

  if (pause.phase === 'waiting') {
    return {
      title: `Saved · waiting for the ${pause.label} reset`,
      subtitle: reset === '' ? 'Resume whenever you are ready' : `Claude picks up on its own when the window ${reset}`,
    }
  }

  return {
    title: `Paused · ${pause.label} limit reached`,
    subtitle: [remainingTextOf(pause.remaining), `your limit ${pause.limit}%`, reset].filter(Boolean).join(' · '),
  }
}

/** The share of the wait already gone, for the waiting ring's arc. */
function waitedOf(pause: Pause, now: number): number {
  if (pause.resetsAt === undefined || pause.resetsAt <= pause.since) {
    return 0
  }

  return Math.max(0, Math.min(1, (now - pause.since) / (pause.resetsAt - pause.since)))
}

/**
 * The desktop alert: the animated emblem, the title and the facts, the
 * travelling LED wave, and the two ways on (`Save & wait`, `Resume`), or
 * `Resume now` while waiting for the reset.
 */
export function desktopAlertCard(
  ui: { Box: Box; Text: Text; Button: Button; Svg: ElementConstructor<SvgProps> },
  guard: GuardView,
  pause: Pause,
  now: number,
  wavePx: number,
): RenderElement {
  const { Box, Text, Button, Svg } = ui
  const { title, subtitle } = alertWordsOf(pause, now)
  const color = hexOf(pause.phase === 'alert' ? AMBER : INDIGO)

  return (
    <Box key="alert" flexDirection="row" alignItems="center" gap={1} marginBottom={1}>
      <Svg source={alertRingOf(pause.phase, 46, waitedOf(pause, now))} alt={title} width={46} height={46} />
      <Box flexDirection="column" flexGrow={1} flexShrink={1}>
        <Text bold color={color}>
          {title}
        </Text>
        <Text color={hexOf(MUTED)}>{subtitle}</Text>
        <Svg source={alertWaveOf(pause.phase, wavePx, 9)} alt="Paused" width={wavePx} height={9} />
      </Box>
      {pause.phase === 'alert' ? (
        <Box flexDirection="row" gap={1}>
          <Button key="pause:save" variant="primary" hotkey="s" onPress={guard.onSave}>
            {'Save & wait'}
          </Button>
          <Button key="pause:resume" hotkey="r" onPress={guard.onResume}>
            Resume
          </Button>
        </Box>
      ) : (
        <Button key="pause:resume" variant="primary" hotkey="r" onPress={guard.onResume}>
          Resume now
        </Button>
      )}
    </Box>
  )
}

/** The cells the terminal alert's wave shows at `now`. */
export function alertWaveCellsOf(pause: Pause, width: number, now: number): string {
  const color = pause.phase === 'alert' ? AMBER : INDIGO

  return encodeRows([alertWaveCells(width, now, color, pause.phase === 'alert' ? AMBER_DIM : 0x2d3160)])
}

/** The terminal alert: a rounded amber (or indigo) frame, the title and facts, the travelling wave, the buttons. */
export function terminalAlertCard(
  ui: { Box: Box; Text: Text; Button: Button; Raster: ElementConstructor<RasterProps> },
  guard: GuardView,
  pause: Pause,
  now: number,
  waveCells: number,
): RenderElement {
  const { Box, Text, Button, Raster } = ui
  const { title, subtitle } = alertWordsOf(pause, now)
  const color = hexOf(pause.phase === 'alert' ? AMBER : INDIGO)

  return (
    <Box key="alert" flexDirection="column" borderStyle="round" borderColor={color} paddingX={1}>
      <Box flexDirection="row" gap={1}>
        <Text bold color={color}>
          {pause.phase === 'alert' ? '⏸' : '◷'}
        </Text>
        <Text bold color={color}>
          {title}
        </Text>
        <Text dimColor wrap="truncate-end">
          {subtitle}
        </Text>
      </Box>
      <Raster key={ALERT_WAVE_KEY} columns={waveCells} rows={1} cells={alertWaveCellsOf(pause, waveCells, now)} />
      <Box flexDirection="row" gap={2}>
        {pause.phase === 'alert' ? (
          <Box flexDirection="row" gap={2}>
            <Button key="pause:save" variant="primary" hotkey="s" onPress={guard.onSave}>
              {'Save & wait'}
            </Button>
            <Button key="pause:resume" hotkey="r" onPress={guard.onResume}>
              Resume
            </Button>
          </Box>
        ) : (
          <Button key="pause:resume" variant="primary" hotkey="r" onPress={guard.onResume}>
            Resume now
          </Button>
        )}
      </Box>
    </Box>
  )
}

/** The label that opens a window's limit editor: `5h`, lit under the pointer. */
export function limitLabelButton(Button: Button, guard: GuardView, quota: Quota): RenderElement {
  return (
    <Button key={`limit:${quota.kind}`} plain hover={{ scope: `quota:${quota.kind}`, color: hexOf(LAVENDER) }} onPress={() => guard.onEdit(quota.kind)}>
      {quota.label}
    </Button>
  )
}

/** The flag after a window's figures, `⚑ 20%`, while a limit is set; nothing otherwise. */
export function limitFlagOf(ui: { Box: Box; Text: Text }, guard: GuardView, quota: Quota): RenderElement | null {
  const { Box, Text } = ui
  const limit = guard.limits[quota.kind]

  return limit === undefined ? null : (
    <Box key={`flag:${quota.kind}`} flexShrink={0}>
      <Text color={hexOf(AMBER)}>{`⚑ ${limit}%`}</Text>
    </Box>
  )
}

/** How many invisible buttons tile a quota capsule: each label short enough never to be cut with an ellipsis. */
const CAPSULE_SLOTS = 4

/**
 * The invisible buttons over a quota capsule on the desktop, side by side
 * across it: a click on the bar opens its limit picker, and the pointer on
 * it lights the window's label.
 */
export function capsuleButtonOf(ui: { Box: Box; Button: Button }, guard: GuardView, quota: Quota): RenderElement {
  const { Box, Button } = ui

  return (
    <Box position="absolute" top={0} left={0} right={0} bottom={0} flexDirection="row" alignItems="center">
      {Array.from({ length: CAPSULE_SLOTS }, (_, index) => (
        <Box key={`quota-slot:${quota.kind}:${index}`} width={0} flexGrow={1} flexDirection="row" justifyContent="center">
          <Button
            key={`quota-open:${quota.kind}:${index}`}
            plain
            hover={{ scope: `quota:${quota.kind}`, color: hexOf(LAVENDER) }}
            onPress={() => guard.onEdit(quota.kind)}
          >
            {BLANK_LABEL}
          </Button>
        </Box>
      ))}
    </Box>
  )
}

/**
 * The readout beside the dial: one place where the percent under the
 * pointer shows, `→ 40%`; each value is its own hidden line, lit by the
 * hover group of its click target on the track.
 */
function hoverReadoutOf(ui: { Box: Box; Text: Text }, quota: Quota): RenderElement {
  const { Box, Text } = ui

  return (
    <Box key={`dial-readout:${quota.kind}`} position="relative" width={7} flexShrink={0}>
      <Text> </Text>
      {limitSteps().map(value => (
        <Box
          key={`dial-readout:${quota.kind}:${value}`}
          position="absolute"
          top={0}
          left={0}
          display="none"
          hover={{ scope: stepScopeOf(quota.kind, value), display: 'flex' }}
        >
          <Text bold color={hexOf(AMBER)}>{`→ ${value}%`}</Text>
        </Box>
      ))}
    </Box>
  )
}

/** The desktop limit dial's width, in CSS pixels. */
const DIAL_PX = 300

/** A blank label, invisible but not whitespace, so no surface trims it away. */
const BLANK_LABEL = '\u2800\u2800'

/** The limits the track offers, one per click target: 5% to 90%. */
function limitSteps(): number[] {
  const steps: number[] = []

  for (let value = LIMIT_MIN; value <= LIMIT_MAX; value += LIMIT_STEP) {
    steps.push(value)
  }

  return steps
}

/** The hover group tying a click target on the track to its percent in the readout. */
function stepScopeOf(kind: string, value: number): string {
  return `dial:${kind}:${value}`
}

/**
 * The dial's click layer: one invisible target per 5% laid across the
 * track, each centred on its value (the spacers before and after keep the
 * track's own proportions). Nothing it reveals sits on the track: the
 * percent under the pointer shows in the readout beside the dial, so a fast
 * sweep never leaves a trail of bubbles behind. A click sets the limit there
 * and the bar slides to it.
 */
function clickLayerOf(ui: { Box: Box; Button: Button }, guard: GuardView, quota: Quota): RenderElement {
  const { Box, Button } = ui

  return (
    <Box position="absolute" top={0} left={0} right={0} bottom={0} flexDirection="row" alignItems="stretch">
      <Box key={`dial-margin:${quota.kind}:start`} width={0} flexGrow={LIMIT_MIN - LIMIT_STEP / 2} />
      {limitSteps().map(value => (
        <Box
          key={`dial-slot:${quota.kind}:${value}`}
          width={0}
          flexGrow={LIMIT_STEP}
          flexDirection="column"
          justifyContent="flex-end"
          alignItems="center"
        >
          <Button
            key={`dial-step:${quota.kind}:${value}`}
            plain
            hover={{ scope: stepScopeOf(quota.kind, value), color: hexOf(AMBER) }}
            onPress={() => guard.onPick(value)}
          >
            {BLANK_LABEL}
          </Button>
        </Box>
      ))}
      <Box key={`dial-margin:${quota.kind}:end`} width={0} flexGrow={100 - LIMIT_MAX - LIMIT_STEP / 2} />
    </Box>
  )
}

/** The props the dial's drag region gets: the range, the grid, the value, the track's margins. */
function dragPropsOf(guard: GuardView, inset: number) {
  return { min: LIMIT_MIN, max: LIMIT_MAX, step: LIMIT_STEP, value: guard.draft ?? LIMIT_START, inset }
}

/** The drag region over a dial: an absolute layer spanning it, where the pointer carries the knob. */
function dragLayerOf(ui: { Box: Box; Client: ElementConstructor<ClientProps> }, guard: GuardView, quota: Quota, inset: number): RenderElement {
  const { Box, Client } = ui

  return (
    <Box position="absolute" top={0} left={0} right={0} bottom={0}>
      <Client key={`dial-drag:${quota.kind}`} module="./dial-drag.tsx" props={dragPropsOf(guard, inset)} width="100%" height="100%" />
    </Box>
  )
}

/** The ✓ disc's size, in CSS pixels. */
const CONFIRM_PX = 24
/** The picker's capsule: the quota capsule drawn wide, and the air above and below it for the click layer. */
const DIAL_TRACK_PX = 12
const DIAL_PAD_PX = 3
/** Cells on each side of the picker's capsule, the same both sides, so the capsule stands in the middle. */
const DIAL_SIDE = 26

/**
 * A window's limit picker on the desktop, in the quota row's place: the
 * window's capsule drawn wide and centred, the window on its left and, on
 * its right, the limit it shows, the percent under the pointer, `Remove`
 * while a limit shows, and the ✓ that keeps it and brings the two windows
 * back. A click on the capsule puts the notch there; another moves it.
 * Opening, the capsule grows out of its middle, a gleam runs along it and
 * the notch drops in; the ✓ pops in after.
 */
export function desktopLimitPicker(
  ui: { Box: Box; Text: Text; Button: Button; Svg: ElementConstructor<SvgProps> },
  guard: GuardView,
  quota: Quota,
  marginTop: number,
): RenderElement {
  const { Box, Text, Button, Svg } = ui
  const value = guard.draft === null ? 'no limit' : `${guard.draft}%`

  return (
    <Box key={`editor:${quota.kind}`} flexDirection="row" gap={1} alignItems="center" marginTop={marginTop}>
      <Box width={DIAL_SIDE} flexShrink={0} flexDirection="row" justifyContent="flex-end">
        <Text bold color={hexOf(AMBER)}>
          {`⚑ ${quota.label}`}
        </Text>
      </Box>
      <Box key={`dial:${quota.kind}`} position="relative" flexShrink={0}>
        <Svg
          source={quotaBarOf(
            {
              kind: quota.kind,
              remaining: quota.remaining,
              color: quotaColorOf(quota.remaining),
              ...(guard.draft === null ? {} : { limit: guard.draft }),
              limitFrom: guard.draftFrom,
              isGrowing: guard.isOpening,
              isLanding: guard.isOpening,
              padY: DIAL_PAD_PX,
            },
            DIAL_PX,
            DIAL_TRACK_PX,
          )}
          alt={`${quota.label}: ${remainingTextOf(quota.remaining)}, ${guard.draft === null ? 'no limit' : `pause at ${guard.draft}% left`}`}
          width={DIAL_PX}
          height={DIAL_TRACK_PX + DIAL_PAD_PX * 2}
        />
        {clickLayerOf(ui, guard, quota)}
      </Box>
      <Box width={DIAL_SIDE} flexShrink={0} flexDirection="row" gap={1} alignItems="center">
        <Box key={`dial-value:${quota.kind}`} flexShrink={0}>
          <Text bold color={hexOf(AMBER)}>
            {value}
          </Text>
        </Box>
        {hoverReadoutOf(ui, quota)}
        {guard.draft === null ? null : (
          <Button key={`limit-off:${quota.kind}`} plain dimColor onPress={guard.onClear}>
            Remove
          </Button>
        )}
        <Box key={`confirm:${quota.kind}`} position="relative" flexShrink={0}>
          <Svg source={confirmMarkOf(CONFIRM_PX, guard.isOpening)} alt="Validate the limit" width={CONFIRM_PX} height={CONFIRM_PX} />
          <Box position="absolute" top={0} left={0} right={0} bottom={0} justifyContent="center" alignItems="center">
            <Button key={`limit-confirm:${quota.kind}`} plain autoFocus onPress={guard.onConfirm}>
              {BLANK_LABEL}
            </Button>
          </Box>
        </Box>
      </Box>
    </Box>
  )
}

/** The terminal dial's cells. */
const DIAL_CELLS = 32

/**
 * A window's limit picker on the terminal, in the quota row's place: `◀`,
 * a cell dial with its amber zone and knob (the mouse drags it where the
 * terminal reports one), `▶`, the value, `Remove`, and the ✓ that keeps it.
 */
export function terminalLimitPicker(
  ui: { Box: Box; Text: Text; Button: Button; Raster: ElementConstructor<RasterProps>; Client: ElementConstructor<ClientProps> },
  guard: GuardView,
  quota: Quota,
): RenderElement {
  const { Box, Text, Button, Raster } = ui

  return (
    <Box key={`editor:${quota.kind}`} flexDirection="row" gap={1}>
      <Text bold color={hexOf(AMBER)}>
        {`⚑ ${quota.label}`}
      </Text>
      <Button key={`nudge:${quota.kind}:down`} plain hotkey="h" onPress={() => guard.onNudge(-1)}>
        ◀
      </Button>
      <Box key={`dial-box:${quota.kind}`} position="relative" flexShrink={0}>
        <Raster
          key={`dial:${quota.kind}`}
          columns={DIAL_CELLS}
          rows={1}
          cells={encodeRows([limitDialCells(quota.remaining, guard.draft ?? LIMIT_START, quotaColorOf(quota.remaining), DIAL_CELLS, quota.kind)])}
        />
        {dragLayerOf(ui, guard, quota, 1)}
      </Box>
      <Button key={`nudge:${quota.kind}:up`} plain hotkey="l" onPress={() => guard.onNudge(1)}>
        ▶
      </Button>
      <Text color={hexOf(AMBER)}>{guard.draft === null ? 'no limit' : `pause at ${guard.draft}%`}</Text>
      {guard.draft === null ? null : (
        <Button key={`limit-off:${quota.kind}`} plain dimColor onPress={guard.onClear}>
          Remove
        </Button>
      )}
      <Button key={`limit-confirm:${quota.kind}`} variant="primary" hotkey="s" autoFocus onPress={guard.onConfirm}>
        ✓
      </Button>
    </Box>
  )
}
