import type {
  BoxProps,
  ButtonProps,
  ClientProps,
  ElementConstructor,
  InputProps,
  RasterProps,
  RenderElement,
  SvgProps,
  TextProps,
} from 'claude-code'

import {
  glyphCell,
  meterRow,
  meterWidthOf,
  quotaCells,
  ruleCells,
  shownPercent,
  type FrameContext,
  type MeterWidths,
  type PlanFrame,
} from '../meter'
import { AMBER, DANGER, EMERALD, hexOf, INDIGO, LAVENDER, MUTED, seedOf, WHITE } from '../palette'
import { chipOf, isDone } from '../plans'
import { encodeRows } from '../raster'
import { quotaColorOf, remainingShortOf, remainingTextOf, resetShortOf, resetTextOf, type Quota } from '../usage'
import {
  desktopAlertCard,
  desktopLimitPicker,
  capsuleButtonOf,
  limitFlagOf,
  limitLabelButton,
  terminalAlertCard,
  terminalLimitPicker,
  type GuardView,
} from './guard'
import { burstLayerOf, chipCentreOf, chipGeometryOf, quotaBarOf, ringsOf, RINGS_PX, svgBarOf } from './svg-bar'

type Box = ElementConstructor<BoxProps>
type Text = ElementConstructor<TextProps>
type Button = ElementConstructor<ButtonProps>

/** The terminal's elements: the shared three and the cell grid. */
export type TerminalKit = {
  Box: Box
  Text: Text
  Button: Button
  Input: ElementConstructor<InputProps>
  Raster: ElementConstructor<RasterProps>
  Client: ElementConstructor<ClientProps>
}
/** The desktop's elements: the shared three and the vector drawing. */
export type DesktopKit = {
  Box: Box
  Text: Text
  Button: Button
  Input: ElementConstructor<InputProps>
  Svg: ElementConstructor<SvgProps>
  Client: ElementConstructor<ClientProps>
}
/** Any other surface's: the shared three. */
export type PlainKit = { Box: Box; Text: Text; Button: Button }

/** A move under way on the desktop: where the head starts and how long it has left. */
export type Move = { from: number; durationMs: number }

/** What the band draws: the plans as this instant shows them. */
export type BandModel = {
  frames: readonly PlanFrame[]
  context: FrameContext
  /** Cells across the band (`e.props.bodyColumns`). */
  columns: number
  onRemove: (id: string) => void
  /** What the mods beneath drew in the band, kept under the rows. */
  theirs: RenderElement | null
  /** For the desktop: each moving plan's head, from where and for how long. */
  moves?: ReadonlyMap<string, Move>
  /** The 5-hour and 7-day windows, drawn under the plans; empty to draw none. */
  quotas: readonly Quota[]
  /** The usage guard: the limits, their editor, the pause and its alert. */
  guard: GuardView
  /** Whether the plans are folded into one line, whether the fold just changed (its animation plays), and the toggle. */
  fold: { isFolded: boolean; isAnimating: boolean; onToggle: () => void }
}

/** How the terminal band shares its width. */
export type TerminalLayout = MeterWidths & {
  name: number
  meter: number
}

/** The band's keys: what `$.ui.blit` repaints between renders. */
export const GLYPHS_KEY = 'glyphs'
export const METERS_KEY = 'meters'

const TITLE = 'Progress'
const PADDING = 1
/** The band's own `[-]` collapse mark, drawn by Claude Code at the header's right end. */
const COLLAPSE_MARK = 4
/** CSS pixels per cell on the desktop: an under-estimate, so a row never overflows. */
const DESKTOP_CELL_PX = 7.2
/** The desktop bar's thickness, in CSS pixels, and the air above and below it. */
const DESKTOP_BAR_PX = 26
const DESKTOP_BAR_GAP_PX = 5

/** The header's right side: how many plans run and how many are done. */
export function summaryOf(frames: readonly PlanFrame[]): string {
  const done = frames.filter(frame => isDone(frame.plan)).length
  const running = frames.length - done

  if (running === 0) {
    return done === 1 ? 'done ✓' : `all ${done} done ✓`
  }

  return done === 0 ? `${running} running` : `${running} running · ${done} done`
}

/** The name column: the longest name, within limits set by the band's width. */
function nameWidthOf(columns: number, frames: readonly PlanFrame[]): number {
  const inner = Math.max(20, columns - PADDING * 2)
  const longest = frames.reduce((most, frame) => Math.max(most, [...frame.plan.name].length), 0)

  return clamp(longest, 6, clamp(Math.floor(inner * 0.28), 10, 30))
}

/** Shares the terminal band's width: the names, then the bar takes what the percent and the ✕ leave. */
export function terminalLayoutOf(columns: number, frames: readonly PlanFrame[]): TerminalLayout {
  const inner = Math.max(20, columns - PADDING * 2)
  const name = nameWidthOf(columns, frames)
  const fixed = 1 + 1 + name + 1 + meterWidthOf({ bar: 0 }) + 1 + 1
  const bar = clamp(inner - fixed, 16, 80)

  return { name, bar, meter: meterWidthOf({ bar }) }
}

/** The glyph column's cells: one spinner, check or dot per plan. */
export function glyphsCellsOf(frames: readonly PlanFrame[], context: FrameContext): string {
  return encodeRows(frames.map(frame => [glyphCell(frame, context)]))
}

/** The meter column's cells: one bar and percent per plan. */
export function metersCellsOf(frames: readonly PlanFrame[], context: FrameContext, layout: MeterWidths): string {
  return encodeRows(frames.map(frame => meterRow(frame, context, layout)))
}

/**
 * The terminal band: a header (◆ Progress, a rule fading out, the count),
 * then the plans in aligned columns. The glyphs and the meters are one
 * Raster each, so the frame loop repaints them with `$.ui.blit` alone; the
 * names and the ✕ Buttons light up together under the pointer.
 */
export function terminalBandView(ui: TerminalKit, model: BandModel, layout: TerminalLayout): RenderElement {
  const { Box, Text, Button, Raster } = ui
  const { frames, context } = model
  const summary = summaryOf(frames)
  const inner = Math.max(20, model.columns - PADDING * 2)
  const rule = inner - (1 + 1 + TITLE.length + 1 + [...summary].length + 1 + [...foldLabelOf(model)].length + 1) - COLLAPSE_MARK

  const pause = model.guard.pause

  return (
    <Box flexDirection="column" paddingX={PADDING}>
      {pause === null ? null : terminalAlertCard(ui, model.guard, pause, context.now, alertWaveWidthOf(model.columns))}
      {frames.length > 0 ? (
        <Box flexDirection="row" gap={1}>
          <Text bold color={hexOf(LAVENDER)}>
            ◆
          </Text>
          <Text bold>{TITLE}</Text>
          {rule >= 3 ? <Raster key="rule" columns={rule} rows={1} cells={encodeRows([ruleCells(rule)])} /> : null}
          <Text dimColor>{summary}</Text>
          {foldButton(Button, model, false)}
        </Box>
      ) : null}
      {frames.length > 0 && model.fold.isFolded ? terminalRingsRow(ui, model) : null}
      {frames.length > 0 && !model.fold.isFolded ? (
      <Box flexDirection="row" gap={1}>
        <Raster key={GLYPHS_KEY} columns={1} rows={frames.length} cells={glyphsCellsOf(frames, context)} />
        <Box flexDirection="column" width={layout.name} flexShrink={0}>
          {frames.map(frame => (
            <Text
              bold={!isDone(frame.plan) && !isGoing(frame)}
              dimColor={isDone(frame.plan) || isGoing(frame)}
              strikethrough={isGoing(frame)}
              wrap="truncate-end"
              hover={{ scope: scopeOf(frame), color: hexOf(WHITE), dimColor: false }}
            >
              {frame.plan.name}
            </Text>
          ))}
        </Box>
        <Raster
          key={METERS_KEY}
          columns={layout.meter}
          rows={frames.length}
          cells={metersCellsOf(frames, context, layout)}
        />
        <Box flexDirection="column" flexShrink={0}>
          {frames.map(frame => (isGoing(frame) ? <Text> </Text> : removeButton(Button, model, frame)))}
        </Box>
      </Box>
      ) : null}
      {model.quotas.length > 0 ? (editedOf(model) === undefined ? terminalQuotaRow(ui, model) : terminalLimitPicker(ui, model.guard, editedOf(model) as Quota)) : null}
      {model.theirs}
    </Box>
  )
}

/** Cells of one quota meter on the terminal, its caps included. */
const QUOTA_CELLS = 12

/**
 * The terminal's quota row: `◷`, then each window's label, a short braille
 * meter of what is left in its color, `62% left` and when it resets.
 */
function terminalQuotaRow(ui: TerminalKit, model: BandModel): RenderElement {
  const { Box, Text, Raster } = ui

  return (
    <Box key="quotas" flexDirection="row" gap={1}>
      <Text dimColor>◷</Text>
      {model.quotas.map((quota, index) => {
        const color = quotaColorOf(quota.remaining)
        const reset = resetShortOf(quota, model.context.now)

        return (
          <Box key={`quota:${quota.kind}`} flexDirection="row" gap={1} flexShrink={0} marginLeft={index === 0 ? 0 : 2}>
            {limitLabelButton(ui.Button, model.guard, quota)}
            <Raster
              key={`quota:${quota.kind}`}
              columns={QUOTA_CELLS}
              rows={1}
              cells={encodeRows([quotaCells(quota.remaining, color, QUOTA_CELLS, seedOf(quota.kind))])}
            />
            <Text color={hexOf(color)}>{remainingShortOf(quota.remaining)}</Text>
            {reset === '' ? null : <Text dimColor>{reset}</Text>}
            {limitFlagOf(ui, model.guard, quota)}
          </Box>
        )
      })}
    </Box>
  )
}

/** The window whose limit picker stands in the quota row's place, if any. */
function editedOf(model: BandModel): Quota | undefined {
  return model.quotas.find(each => each.kind === model.guard.editing)
}

/** The terminal alert wave's width: the band less the frame and its padding. */
export function alertWaveWidthOf(columns: number): number {
  return clamp(columns - PADDING * 2 - 4, 10, 200)
}

/**
 * The desktop's quota row, under the plans: each window's label, a slim
 * LED capsule of what is left in its color, `62% left` and when it resets.
 */
function desktopQuotaRow(ui: DesktopKit, model: BandModel): RenderElement {
  const { Box, Text, Svg } = ui

  return (
    <Box key="quotas" flexDirection="row" gap={1} alignItems="center" marginTop={model.frames.length > 0 ? 1 : 0}>
      <Text color={hexOf(MUTED)}>◷</Text>
      {model.quotas.map((quota, index) => {
        const color = quotaColorOf(quota.remaining)
        const reset = resetShortOf(quota, model.context.now)

        return (
          <Box key={`quota:${quota.kind}`} flexDirection="row" gap={1} alignItems="center" flexShrink={0} marginLeft={index === 0 ? 0 : 3}>
            {limitLabelButton(ui.Button, model.guard, quota)}
            <Box key={`quota-bar:${quota.kind}`} position="relative" flexShrink={0}>
              <Svg
                source={quotaBarOf(
                  {
                    kind: quota.kind,
                    remaining: quota.remaining,
                    color,
                    limit: model.guard.limits[quota.kind],
                    isGrowing: model.guard.justSet !== null,
                    isLanding: model.guard.justSet === quota.kind,
                  },
                  QUOTA_BAR_PX,
                  10,
                )}
                alt={`${quota.label}: ${remainingTextOf(quota.remaining)}`}
                width={QUOTA_BAR_PX}
                height={10}
              />
              {capsuleButtonOf(ui, model.guard, quota)}
            </Box>
            <Text color={hexOf(color)} wrap="truncate-end">
              {remainingShortOf(quota.remaining)}
            </Text>
            {reset === '' ? null : (
              <Text color={hexOf(MUTED)} wrap="truncate-end">
                {reset}
              </Text>
            )}
            {limitFlagOf(ui, model.guard, quota)}
          </Box>
        )
      })}
      {model.frames.length > 0 && !model.fold.isFolded ? (
        <Box key="band-toggle-box" marginLeft={3} flexShrink={0}>
          {foldButton(ui.Button, model, true)}
        </Box>
      ) : null}
    </Box>
  )
}

/** The desktop quota capsule's width, in CSS pixels. */
const QUOTA_BAR_PX = 80

/**
 * The desktop band, after the reference shot: no header, one row per plan
 * (a dot, the name, the SVG bar with its pixel field and riding
 * chip, the percent in a quiet grey, the ✕), the bars all one width so the
 * percents line up, the whole band centred.
 */
export function desktopBandView(ui: DesktopKit, model: BandModel): RenderElement {
  const { Box, Text, Svg } = ui
  const { frames, context } = model
  const name = nameWidthOf(model.columns, frames)
  const fixedCells = PADDING * 2 + 2 + name + 1 + 1 + 5 + 1 + 2
  const barPx = clamp(Math.floor((model.columns - fixedCells) * DESKTOP_CELL_PX), 160, 960)

  const pause = model.guard.pause

  return (
    <Box flexDirection="column" alignItems="center" paddingX={PADDING}>
      {pause === null ? null : desktopAlertCard(ui, model.guard, pause, context.now, clamp(barPx, 160, 520))}
      {frames.length > 0 && model.fold.isFolded ? desktopRingsRow(ui, model) : null}
      {(model.fold.isFolded ? [] : frames).map((frame, index) => {
        const { plan } = frame
        const done = isDone(plan)
        const target = done ? 1 : plan.step / plan.total
        const move = model.moves?.get(plan.id)
        const chip = chipOf(plan)
        const isPaused = pause !== null && !done
        const label = isPaused ? 'Paused' : chip.label
        const { count } = chip
        const source = svgBarOf({
          id: plan.id,
          width: barPx,
          height: DESKTOP_BAR_PX,
          share: target,
          from: move?.from ?? null,
          durationMs: move?.durationMs ?? 0,
          total: plan.total,
          step: plan.step,
          label,
          count,
          isDone: done,
          isLive: context.isWorking && frame.isActive,
          isPaused,
          padY: DESKTOP_BAR_GAP_PX,
          isDissolving: isGoing(frame),
          ...(model.fold.isAnimating ? { enterDelay: index * 0.07 } : {}),
        })

        return (
          <Box key={`row:${plan.id}`} flexDirection="row" gap={1} alignItems="center">
            <Text color={hexOf(done ? EMERALD : LAVENDER)}>•</Text>
            <Box width={name} flexShrink={0}>
              <Text dimColor={done || isGoing(frame)} strikethrough={isGoing(frame)} wrap="truncate-end">
                {plan.name}
              </Text>
            </Box>
            <Box key={`bar:${plan.id}`} position="relative" flexShrink={0}>
              <Svg
                source={source}
                alt={`${plan.name}: ${label} ${count}, ${shownPercent(target)}%`}
                width={barPx}
                height={DESKTOP_BAR_PX + DESKTOP_BAR_GAP_PX * 2}
              />
              {isGoing(frame) ? burstOverlayOf(ui, plan.id, barPx, label, count, target, done) : null}
            </Box>
            <Box width={5} flexShrink={0}>
              <Text color={hexOf(done ? EMERALD : MUTED)} dimColor={isGoing(frame)}>
                {isGoing(frame) ? '' : `${shownPercent(target)}%`.padStart(4)}
              </Text>
            </Box>
            {isGoing(frame) ? <Text> </Text> : removeButton(ui.Button, model, frame)}
          </Box>
        )
      })}
      {model.quotas.length > 0 ? (
        editedOf(model) === undefined ? (
          desktopQuotaRow(ui, model)
        ) : (
          desktopLimitPicker(ui, model.guard, editedOf(model) as Quota, frames.length > 0 ? 1 : 0)
        )
      ) : frames.length > 0 && !model.fold.isFolded ? (
        <Box key="quotas" flexDirection="row" marginTop={1}>
          {foldButton(ui.Button, model, true)}
        </Box>
      ) : null}
      {model.theirs}
    </Box>
  )
}

/** Any other surface: the bar as text, `████░░░░`, and the chip's words. */
export function plainBandView(ui: PlainKit, model: BandModel): RenderElement {
  const { Box, Text, Button } = ui
  const pause = model.guard.pause

  return (
    <Box flexDirection="column" paddingX={PADDING}>
      {pause === null ? null : (
        <Box key="alert" flexDirection="row" gap={1}>
          <Text bold color={hexOf(pause.phase === 'alert' ? AMBER : INDIGO)}>
            {pause.phase === 'alert' ? `Paused · ${pause.label} limit reached` : `Saved · waiting for the ${pause.label} reset`}
          </Text>
          {pause.phase === 'alert' ? (
            <Button key="pause:save" variant="primary" onPress={model.guard.onSave}>
              {'Save & wait'}
            </Button>
          ) : null}
          <Button key="pause:resume" onPress={model.guard.onResume}>
            {pause.phase === 'alert' ? 'Resume' : 'Resume now'}
          </Button>
        </Box>
      )}
      {model.frames.map(frame => {
        const done = isDone(frame.plan)
        const target = done ? 1 : frame.plan.step / frame.plan.total
        const filled = Math.round(target * 20)
        const { label, count } = chipOf(frame.plan)

        return (
          <Box key={`row:${frame.plan.id}`} flexDirection="row" gap={1}>
            <Text color={hexOf(done ? EMERALD : LAVENDER)}>•</Text>
            <Text wrap="truncate-end">{frame.plan.name}</Text>
            <Text color={hexOf(done ? EMERALD : LAVENDER)}>{'█'.repeat(filled) + '░'.repeat(20 - filled)}</Text>
            <Text bold>{`${label} ${count}`}</Text>
            <Text color={hexOf(MUTED)}>{`${shownPercent(target)}%`}</Text>
            {removeButton(ui.Button, model, frame)}
          </Box>
        )
      })}
      {model.quotas.length > 0 ? (
        <Text color={hexOf(MUTED)}>
          {model.quotas
            .map(quota => [quota.label, remainingTextOf(quota.remaining), resetTextOf(quota, model.context.now)].filter(Boolean).join(' '))
            .join('   ')}
        </Text>
      ) : null}
      {model.theirs}
    </Box>
  )
}

function removeButton(Button: Button, model: BandModel, frame: PlanFrame): RenderElement {
  return (
    <Button
      key={`remove:${frame.plan.id}`}
      plain
      dimColor
      hover={{ scope: scopeOf(frame), color: hexOf(DANGER) }}
      onPress={() => model.onRemove(frame.plan.id)}
    >
      ✕
    </Button>
  )
}

/** How tall and how much wider than its bar the burst layer is: the margins the burst can spill into. */
const BURST_PX = DESKTOP_BAR_PX + DESKTOP_BAR_GAP_PX * 2 + 96
const BURST_SPILL_PX = 80

/**
 * The ✕'s burst on the desktop: a layer laid over the bar and spilling past
 * it on every side, in front of the rows around it, centred on the bar so
 * its burst sits on the chip whatever the surface's cell size.
 */
function burstOverlayOf(ui: DesktopKit, id: string, barPx: number, label: string, count: string, share: number, done: boolean): RenderElement {
  const { Box, Svg } = ui
  const bar = { width: barPx, label, count, share }
  const { chipW } = chipGeometryOf(bar)

  return (
    <Box key={`burst:${id}`} position="absolute" top={-3} bottom={-3} left={-12} right={-12} justifyContent="center" alignItems="center">
      <Svg
        source={burstLayerOf({ width: barPx + BURST_SPILL_PX * 2, height: BURST_PX, cx: chipCentreOf(bar) + BURST_SPILL_PX, chipW, isDone: done })}
        alt=""
        width={barPx + BURST_SPILL_PX * 2}
        height={BURST_PX}
      />
    </Box>
  )
}

/** `3 tasks`, `1 task`. */
function tasksWordOf(frames: readonly PlanFrame[]): string {
  return frames.length === 1 ? '1 task' : `${frames.length} tasks`
}

/** What the fold toggle says: `▴ Collapse` over the open list, `▾ 3 tasks` on the folded line. */
function foldLabelOf(model: BandModel): string {
  return model.fold.isFolded ? `▾ ${tasksWordOf(model.frames)}` : '▴ Collapse'
}

/**
 * The fold toggle, a labelled control rather than a bare mark: a native
 * secondary button on the desktop (`▴ Collapse`, `▾ 3 tasks`), lit text on
 * the terminal.
 */
function foldButton(Button: Button, model: BandModel, isNative: boolean): RenderElement {
  return isNative ? (
    <Button key="band-toggle" variant="secondary" onPress={model.fold.onToggle}>
      {foldLabelOf(model)}
    </Button>
  ) : (
    <Button key="band-toggle" plain hover={{ scope: 'band-toggle', color: hexOf(LAVENDER) }} onPress={model.fold.onToggle}>
      {foldLabelOf(model)}
    </Button>
  )
}

/** The folded line's words: the plan under way (or `All done`), its step and how many are done, and the overall percent. */
function foldedFactsOf(frames: readonly PlanFrame[]): { title: string; detail: string; percent: number; isAllDone: boolean } {
  const done = frames.filter(frame => isDone(frame.plan)).length
  const running = frames.filter(frame => !isDone(frame.plan))
  const active = running.find(frame => frame.isActive) ?? running.at(-1)
  const overall = frames.reduce((sum, frame) => sum + (isDone(frame.plan) ? 1 : frame.plan.step / frame.plan.total), 0) / Math.max(1, frames.length)

  if (active === undefined) {
    return { title: 'All done', detail: tasksWordOf(frames), percent: 100, isAllDone: true }
  }

  const others = running.length > 1 ? ` · ${running.length - 1} more` : ''

  return {
    title: active.plan.name,
    detail: `${chipOf(active.plan).count}${done > 0 ? ` · ${done} done` : ''}${others}`,
    percent: shownPercent(overall),
    isAllDone: false,
  }
}

/**
 * The folded list on the desktop, one centred line: a ring per plan (an
 * emerald check when finished, a lavender arc as far round as its share
 * while running, a spark circling the one Claude works on), the plan under
 * way and its step, the overall percent, and `▾ 3 tasks` to open the list.
 */
function desktopRingsRow(ui: DesktopKit, model: BandModel): RenderElement {
  const { Box, Text, Svg } = ui
  const { frames, context } = model
  const facts = foldedFactsOf(frames)
  const rings = ringsOf(
    frames.map(frame => ({
      id: frame.plan.id,
      share: isDone(frame.plan) ? 1 : frame.plan.step / frame.plan.total,
      isDone: isDone(frame.plan),
      isLive: context.isWorking && frame.isActive,
    })),
    model.fold.isAnimating,
  )

  return (
    <Box key="summary" flexDirection="row" gap={1} alignItems="center">
      <Svg source={rings.source} alt={`${facts.title}, ${facts.detail}`} width={rings.width} height={RINGS_PX} />
      <Box flexShrink={1}>
        <Text bold color={facts.isAllDone ? hexOf(EMERALD) : undefined} wrap="truncate-end">
          {facts.title}
        </Text>
      </Box>
      <Text color={hexOf(MUTED)} wrap="truncate-end">
        {facts.detail}
      </Text>
      <Box width={5} flexShrink={0}>
        <Text color={hexOf(facts.isAllDone ? EMERALD : MUTED)}>{`${facts.percent}%`.padStart(4)}</Text>
      </Box>
      <Box key="band-toggle-box" marginLeft={1} flexShrink={0}>
        {foldButton(ui.Button, model, true)}
      </Box>
    </Box>
  )
}

/** A running plan's ring on the terminal, filled as far as its share. */
function ringGlyphOf(share: number): string {
  return ['○', '◔', '◑', '◕', '●'][Math.min(4, Math.round(share * 4))] ?? '○'
}

/** The folded list on the terminal: `✓─✓─◑`, the plan under way and its step, the overall percent. */
function terminalRingsRow(ui: TerminalKit, model: BandModel): RenderElement {
  const { Box, Text } = ui
  const { frames } = model
  const facts = foldedFactsOf(frames)

  return (
    <Box key="summary" flexDirection="row" gap={1}>
      <Box flexDirection="row" flexShrink={0}>
        {frames.map((frame, index) => (
          <Box key={`ring:${frame.plan.id}`} flexDirection="row">
            {index > 0 ? <Text color={hexOf(isDone(frames[index - 1]?.plan ?? frame.plan) ? EMERALD : MUTED)} dimColor>─</Text> : null}
            <Text bold color={hexOf(isDone(frame.plan) ? EMERALD : LAVENDER)}>
              {isDone(frame.plan) ? '✓' : ringGlyphOf(frame.plan.step / frame.plan.total)}
            </Text>
          </Box>
        ))}
      </Box>
      <Text bold color={facts.isAllDone ? hexOf(EMERALD) : undefined} wrap="truncate-end">
        {facts.title}
      </Text>
      <Text dimColor wrap="truncate-end">
        {facts.detail}
      </Text>
      <Text color={hexOf(facts.isAllDone ? EMERALD : MUTED)}>{`${facts.percent}%`}</Text>
    </Box>
  )
}

/** Whether a plan's row is coming apart after its ✕. */
function isGoing(frame: PlanFrame): boolean {
  return frame.dissolve !== undefined && frame.dissolve !== null
}

/** The hover group of one plan's row: its name and its ✕ light together. */
function scopeOf(frame: PlanFrame): string {
  return `row:${frame.plan.id}`.slice(0, 64)
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
