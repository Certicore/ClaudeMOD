import type { On, SessionRateLimit } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine, FoundElement, MockClock } from 'claude-code/testing'

import { CHECKPOINT_PROMPT, RESET_PROMPT, RESUME_PROMPT } from '../hooks/guard'
import { folderKeyOf, keyOf } from '../hooks/plans'
import { decodeText } from '../hooks/raster'

/** The tool's full name, as the model calls it. */
const TOOL = 'mcp__progress__report_progress'

const SESSION = { surface: 'terminal', isInteractive: true, cwd: '/work' } as const

/** Who runs /progress and where its answer shows: the person, on the main screen. */
const RUN = {
  origin: { kind: 'composer' },
  presentation: { isFullscreen: false, columns: 120 },
} as const

/** What Claude Code passes to the band's ui.render hook, apart from the surface. */
function band(isWorking = false) {
  return {
    plugin: 'progress',
    component: 'AbovePrompt',
    requestId: 'band',
    viewport: { columns: 120, rows: 40 },
    props: {
      hasSurvey: false,
      isWorking,
      maxRows: 12,
      bodyColumns: 120,
      scroll: { offset: 0, bodyRows: 11 },
      view: {},
    },
  } as const
}

/** The store key of a plan of this test's project folder, `/work`. */
const HERE = (id: string) => keyOf(folderKeyOf('/work'), id)

/** Long enough for any fill and flash to settle. */
const SETTLED_MS = 3000

/**
 * The world beneath the mod: the session, the registrations, a store in a
 * Map the test reads back, the clips played, the blits landed, and what
 * Claude Code would draw in an empty band.
 */
function world(on: On, limits: readonly SessionRateLimit[] = []) {
  const saved = new Map<string, unknown>()
  const played: string[] = []
  const blits: { key: string; cells: string; columns: number }[] = []
  const prompts: string[] = []
  const aborted: string[] = []
  const clock = mock.clock(on)

  on('session.start', () => ({ cwd: '/work' }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('tool.register', ($, e) => ({ value: { tool: `mcp__progress__${e.name}` } }))
  on('tool.describe', ($, e) => ({ description: e.description }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('store.keys', () => ({ value: [...saved.keys()] }))
  on('store.get', ($, e) => ({ value: saved.get(e.key) }))
  on('store.set', ($, e) => {
    saved.set(e.key, e.value)

    return { value: undefined }
  })
  on('store.delete', ($, e) => {
    saved.delete(e.key)

    return { value: undefined }
  })
  on('audio.play', ($, e) => {
    played.push(e.clip.asset ?? '')

    return { value: undefined }
  })
  on('ui.blit', ($, e) => {
    if ('cells' in e && e.cells !== undefined) {
      blits.push({ key: e.key, cells: e.cells, columns: e.columns ?? 0 })
    }

    return { value: {} }
  })
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200_000 }, rateLimits: [...limits] } }))
  on('session.root', () => ({ value: '/work' }))
  on('ui.toast', () => ({ value: undefined }))
  on('turn.abort', ($, e) => {
    aborted.push(e.turnId)

    return { value: undefined }
  })
  on('prompt.submit', ($, e) => {
    prompts.push(e.text)

    return { text: e.text }
  })
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['drawn by Claude Code'] }))

  return { saved, played, blits, prompts, aborted, clock }
}

/** The rows a Raster the band drew shows, as text. */
async function rasterText(found: FoundElement | undefined): Promise<string[]> {
  expect(found, 'the Raster is drawn').toBeDefined()

  const columns = Number(found?.props.columns ?? 0)

  return decodeText(String(found?.props.cells ?? ''), columns)
}

async function report($: Engine, clock: MockClock, input: Record<string, unknown>) {
  const answer = await $.tool.call({ tool: TOOL, ...input })

  await clock.settle()

  return answer
}

/** A 5-hour window 38% used that resets in 2h 14m, and a 7-day one 19% used, as of the mock clock's 0. */
const LIMITS: readonly SessionRateLimit[] = [
  { kind: 'five_hour', percentUsed: 38, resetsAt: new Date((2 * 60 + 14) * 60_000).toISOString() },
  { kind: 'seven_day', percentUsed: 19, resetsAt: new Date((4 * 24 + 6) * 3_600_000).toISOString() },
]

describe('register', () => {
  test('a report draws a dithered meter with its chip, ticks and percent', async ($, on) => {
    const { saved, clock } = world(on)

    await $.session.start(SESSION)

    const answer = await report($, clock, { plan: 'Ship the release', step: 1, total: 4, note: 'tagging' })

    expect(answer).toMatchObject({ result: expect.stringContaining('Ship the release: 1/4 (25%)') })
    expect(saved.get(HERE('ship-the-release'))).toMatchObject({ name: 'Ship the release', step: 1, total: 4 })

    await clock.advance(SETTLED_MS)

    const ui = await $.ui.mount({ ...band(), surface: 'terminal' })
    const [meter = ''] = await rasterText(await ui.find({ key: 'meters' }))

    expect(meter, 'the chip names the stage and the step under way').toContain('▐tagging 2/4▌')
    expect(meter, 'pixels behind the head, a clean track ahead of it').toMatch(/^▐[\u2800-\u28ff]+▐tagging 2\/4▌ +▌ {2} 25%$/)
    expect(await ui.find({ type: 'Text', text: 'Ship the release' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '1 running' })).toBeDefined()
    expect(await ui.find({ key: 'remove:ship-the-release' })).toBeDefined()
    expect(await ui.find({ key: 'rule' }), 'the header rule').toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'drawn by Claude Code' }), 'the band beneath stays').toBeDefined()

    await ui.unmount()
  })

  test('the desktop draws the bar as an SVG with its chip and the percent', async ($, on) => {
    const { clock } = world(on)

    await $.session.start(SESSION)
    await report($, clock, { plan: 'Ship the release', step: 3, total: 4 })
    await clock.advance(SETTLED_MS)

    const ui = await $.ui.mount({ ...band(), surface: 'desktop' })
    const svg = await ui.find({ type: 'Svg' })
    const source = String(svg?.props.source)

    expect(source, 'the LED matrix').toMatch(/<path d="M\d+ \d+h3v3h-3z/)
    expect(source, 'the chip').toContain('>Step</tspan>')
    expect(source).toContain('>4/4</tspan>')
    expect(svg?.props.isInteractive, 'drawn as an image, so no frame ground').toBeUndefined()
    expect(await ui.find({ type: 'Text', text: ' 75%' })).toBeDefined()

    await ui.unmount()
  })

  test('the desktop percent reads the target while the SVG eases the head', async ($, on) => {
    const { clock } = world(on)

    await $.session.start(SESSION)
    await report($, clock, { plan: 'Docs', step: 0, total: 4 })
    await clock.advance(SETTLED_MS)
    await report($, clock, { plan: 'Docs', step: 1, note: 'Typing' })

    const ui = await $.ui.mount({ ...band(true), surface: 'desktop' })
    const source = String((await ui.find({ type: 'Svg' }))?.props.source)

    expect(await ui.find({ type: 'Text', text: ' 25%' }), 'not the 1% of the first frame').toBeDefined()
    expect(source, 'the head moves').toContain('<animateTransform')
    expect(source, 'the LEDs twinkle while Claude works').toMatch(/<path [^>]*class="[abc]"/)
    expect(source).toContain('>Typing</tspan>')

    await ui.unmount()
  })

  test('the bar fills over time, counting its percent up', async ($, on) => {
    const { clock, blits } = world(on)

    await $.session.start(SESSION)
    await report($, clock, { plan: 'Refactor', step: 0, total: 4 })
    await clock.advance(SETTLED_MS)

    const ui = await $.ui.mount({ ...band(), surface: 'terminal' })

    await report($, clock, { plan: 'Refactor', step: 4, total: 4 })
    await clock.advance(400)

    const midway = blits.filter(blit => blit.key === 'meters').at(-1)
    const [mid = ''] = midway === undefined ? [] : decodeText(midway.cells, midway.columns)
    const percent = Number(/(\d+)%$/.exec(mid)?.[1] ?? 'NaN')

    expect(percent).toBeGreaterThan(0)
    expect(percent).toBeLessThan(100)

    await clock.advance(SETTLED_MS)
    await ui.unmount()

    const after = await $.ui.mount({ ...band(), surface: 'terminal' })
    const [meter = ''] = await rasterText(await after.find({ key: 'meters' }))
    const [glyph = ''] = await rasterText(await after.find({ key: 'glyphs' }))

    expect(meter).toMatch(/▐Done 4\/4▌▌ {2}100%$/)
    expect(glyph).toBe('✓')

    await after.unmount()
  })

  test('while Claude works the active plan spins', async ($, on) => {
    const { clock } = world(on)

    await $.session.start(SESSION)
    await report($, clock, { plan: 'Docs', step: 1, total: 3 })
    await clock.advance(SETTLED_MS)

    const idle = await $.ui.mount({ ...band(false), surface: 'terminal' })
    const [pie = ''] = await rasterText(await idle.find({ key: 'glyphs' }))

    expect(pie).toBe('•')

    await idle.unmount()

    const busy = await $.ui.mount({ ...band(true), surface: 'terminal' })
    const [spinner = ''] = await rasterText(await busy.find({ key: 'glyphs' }))

    expect('⣾⣽⣻⢿⡿⣟⣯⣷').toContain(spinner)

    await busy.unmount()
  })

  test('a finished bar keeps twinkling, on both surfaces', async ($, on) => {
    const { clock, blits } = world(on)

    await $.session.start(SESSION)
    await report($, clock, { plan: 'Shipped', step: 3, total: 3 })
    await clock.advance(SETTLED_MS)

    const desktop = await $.ui.mount({ ...band(false), surface: 'desktop' })
    const source = String((await desktop.find({ type: 'Svg' }))?.props.source)

    expect(source, 'calm twinkle phases at rest').toMatch(/<path [^>]*class="[def]"/)
    expect(source, 'the slow light crossing it').toContain('dur="6.5s"')

    await desktop.unmount()

    const terminal = await $.ui.mount({ ...band(false), surface: 'terminal' })
    const before = blits.length

    await clock.advance(1500)

    const meters = blits.slice(before).filter(blit => blit.key === 'meters').map(blit => blit.cells)

    expect(meters.length, 'the pixels are repainted while idle').toBeGreaterThan(1)
    expect(new Set(meters).size, 'and change from frame to frame').toBeGreaterThan(1)

    await terminal.unmount()
  })

  test('the 5h and 7d windows show under the plans with what is left', async ($, on) => {
    const { clock } = world(on, LIMITS)

    await $.session.start(SESSION)
    await report($, clock, { plan: 'Docs', step: 1, total: 3 })

    const ui = await $.ui.mount({ ...band(), surface: 'terminal' })

    expect((await ui.find({ key: 'limit:five_hour' }))?.text, 'the label opens the limit editor').toBe('5h')
    expect(await ui.find({ type: 'Text', text: '62%' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '↻ 2h 14m' })).toBeDefined()
    expect((await ui.find({ key: 'limit:seven_day' }))?.text, 'the label opens the limit editor').toBe('7d')
    expect(await ui.find({ type: 'Text', text: '81%' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '↻ 4d 6h' })).toBeDefined()
    expect(await ui.find({ key: 'quota:five_hour' }), 'its meter').toBeDefined()

    await ui.unmount()

    const desktop = await $.ui.mount({ ...band(), surface: 'desktop' })

    expect(await desktop.find({ type: 'Svg', text: /5h: 62% left/ }) ?? (await desktop.find({ type: 'Text', text: '62%' }))).toBeDefined()
    expect((await desktop.find({ key: 'quotas' }))?.props.marginTop, 'a line of air under the bars').toBe(1)

    await desktop.unmount()
  })

  test('the windows show alone when no plan runs, and follow session.measure', async ($, on) => {
    world(on, LIMITS)

    await $.session.start(SESSION)

    const ui = await $.ui.mount({ ...band(), surface: 'terminal' })

    expect(await ui.find({ type: 'Text', text: '62%' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Progress' }), 'no header without plans').toBeUndefined()

    await ui.unmount()

    await $.session.measure({
      context: { window: 200_000 },
      rateLimits: [{ kind: 'five_hour', percentUsed: 94.5 }, { kind: 'seven_day', percentUsed: 30 }],
      changed: ['rateLimits'],
    })

    const after = await $.ui.mount({ ...band(), surface: 'terminal' })

    expect(await after.find({ type: 'Text', text: '6%' })).toBeDefined()
    expect(await after.find({ type: 'Text', text: '70%' })).toBeDefined()

    await after.unmount()
  })

  test('the usage option hides the windows', { options: { usage: false } }, async ($, on) => {
    world(on, LIMITS)

    await $.session.start(SESSION)

    const ui = await $.ui.mount({ ...band(), surface: 'terminal' })

    expect(await ui.find({ type: 'Text', text: '62%' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: 'drawn by Claude Code' })).toBeDefined()

    await ui.unmount()
  })

  test('a quota label opens the dial; a click on the track sets the limit, another moves it', async ($, on) => {
    const { saved } = world(on, LIMITS)

    await $.session.start(SESSION)

    const ui = await $.ui.mount({ ...band(), surface: 'desktop' })
    const picker = async () => JSON.stringify(await ui.find({ key: 'editor:five_hour' }))

    expect((await ui.find({ key: 'flag:five_hour' }))?.text, 'no limit yet').toBe('⚑')

    await ui.press({ key: 'limit:five_hour' })

    expect(await picker(), 'with no limit, the dial invites a click').toContain('click the bar to set a limit')
    expect(await ui.find({ key: 'dial-step:five_hour:40' }), 'the track is clickable').toBeDefined()
    expect(JSON.stringify(await ui.find({ key: 'dial-readout:five_hour' })), 'the readout beside the dial holds each percent').toContain('→ 40%')

    await ui.press({ key: 'dial-step:five_hour:40' })

    expect(saved.get('limits'), 'set at the click').toEqual({ five_hour: 40 })
    expect(await picker(), 'the bar stands at 40%').toContain('pause at 40%')
    expect(await ui.find({ key: 'dial-step:five_hour:60' }), 'the picker stays open').toBeDefined()

    await ui.press({ key: 'dial-step:five_hour:60' })

    expect(saved.get('limits')).toEqual({ five_hour: 60 })
    expect(await picker(), 'another click moves the bar').toContain('pause at 60%')
    expect(await picker(), 'and it slides there').toContain('animateTransform')

    await ui.press({ key: 'editor-close:five_hour' })

    expect(await ui.find({ key: 'editor:five_hour' }), 'the picker closes').toBeUndefined()
    expect((await ui.find({ key: 'flag:five_hour' }))?.text).toBe('⚑ 60%')
    expect(JSON.stringify(await ui.find({ key: 'quota:five_hour' })), 'an amber notch marks the limit on the gauge').toContain('#f5a524')

    await ui.press({ key: 'flag:five_hour' })

    expect(await picker(), 'it reopens on the limit set').toContain('pause at 60%')

    await ui.press({ key: 'limit-off:five_hour' })

    expect(saved.get('limits'), 'Remove lifts a limit').toEqual({})

    await ui.unmount()

    const terminal = await $.ui.mount({ ...band(), surface: 'terminal' })

    await terminal.press({ key: 'flag:seven_day' })
    await terminal.press({ key: 'nudge:seven_day:up' })
    await terminal.press({ key: 'limit-set:seven_day' })

    expect(saved.get('limits'), 'the terminal keeps its arrows').toEqual({ seven_day: 30 })

    await terminal.unmount()
  })

  test('reaching a limit stops the turn, holds the tools and raises the alert', async ($, on) => {
    const { saved, played, aborted, clock } = world(on, LIMITS)

    on('tool.call', () => ({ result: 'ran' }))
    saved.set('limits', { five_hour: 50 })

    await $.session.start(SESSION)
    await report($, clock, { plan: 'Refactor', step: 1, total: 4, note: 'Build' })
    await $.turn.start({ turnId: 't1', text: 'go' })
    await $.session.measure({
      context: { window: 200_000 },
      rateLimits: [{ kind: 'five_hour', percentUsed: 55, resetsAt: LIMITS[0]?.resetsAt }],
      changed: ['rateLimits'],
    })
    await clock.settle()

    expect(aborted, 'the running turn is stopped').toEqual(['t1'])
    expect(played).toContain('fx/alert.wav')
    expect(await $.tool.call({ tool: 'Bash', command: 'ls' })).toMatchObject({ deny: expect.stringContaining('Paused by the progress band') })
    expect(await report($, clock, { plan: 'Refactor', step: 2 }), 'the band itself still answers').toMatchObject({
      result: expect.stringContaining('Refactor: 2/4'),
    })

    const ui = await $.ui.mount({ ...band(), surface: 'desktop' })

    expect(await ui.find({ type: 'Text', text: 'Paused · 5h limit reached' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /45% left · your limit 50% · resets in/ })).toBeDefined()
    expect(await ui.find({ key: 'pause:save' })).toBeDefined()
    expect(JSON.stringify(await ui.find({ key: 'row:refactor' })), 'the plan reads Paused').toContain('>Paused</tspan>')

    await ui.unmount()

    const terminal = await $.ui.mount({ ...band(), surface: 'terminal' })

    expect(await terminal.find({ key: 'alert-wave' }), 'the travelling wave').toBeDefined()

    await terminal.unmount()
  })

  test('Resume lifts the pause, asks Claude to go on, and the window stays quiet until it resets', async ($, on) => {
    const { saved, prompts, clock } = world(on, LIMITS)
    const measure = (percentUsed: number, resetsAt: string | undefined) =>
      $.session.measure({ context: { window: 200_000 }, rateLimits: [{ kind: 'five_hour', percentUsed, resetsAt }], changed: ['rateLimits'] })

    on('tool.call', () => ({ result: 'ran' }))
    saved.set('limits', { five_hour: 50 })

    await $.session.start(SESSION)
    await $.turn.start({ turnId: 't1', text: 'go' })
    await measure(55, LIMITS[0]?.resetsAt)
    await clock.settle()

    const ui = await $.ui.mount({ ...band(), surface: 'desktop' })

    await ui.press({ key: 'pause:resume' })
    await ui.unmount()

    expect(prompts).toEqual([RESUME_PROMPT])
    expect(await $.tool.call({ tool: 'Bash', command: 'ls' })).toMatchObject({ result: 'ran' })

    await measure(70, LIMITS[0]?.resetsAt)
    await clock.settle()

    expect(await $.tool.call({ tool: 'Bash', command: 'ls' }), 'the same window stays quiet').toMatchObject({ result: 'ran' })

    await measure(55, new Date(10 * 3_600_000).toISOString())
    await clock.settle()

    expect(await $.tool.call({ tool: 'Bash', command: 'ls' }), 'the next window holds again').toMatchObject({
      deny: expect.stringContaining('Paused'),
    })
  })

  test('Save & wait writes a checkpoint, then picks up on its own after the reset', async ($, on) => {
    const { saved, prompts, clock } = world(on, LIMITS)

    on('tool.call', () => ({ result: 'ran' }))
    saved.set('limits', { five_hour: 50 })

    await $.session.start(SESSION)
    await $.turn.start({ turnId: 't1', text: 'go' })
    await $.session.measure({
      context: { window: 200_000 },
      rateLimits: [{ kind: 'five_hour', percentUsed: 55, resetsAt: LIMITS[0]?.resetsAt }],
      changed: ['rateLimits'],
    })
    await clock.settle()

    const ui = await $.ui.mount({ ...band(), surface: 'desktop' })

    await ui.press({ key: 'pause:save' })

    expect(prompts).toEqual([CHECKPOINT_PROMPT])
    expect(await ui.find({ type: 'Text', text: 'Saved · waiting for the 5h reset' })).toBeDefined()
    expect(await ui.find({ key: 'pause:save' }), 'one way on while waiting').toBeUndefined()
    expect(await $.tool.call({ tool: 'Bash', command: 'ls' }), 'still held while waiting').toMatchObject({ deny: expect.stringContaining('Paused') })

    await ui.unmount()
    await clock.advance((2 * 60 + 14) * 60_000 + 21_000)

    expect(prompts).toEqual([CHECKPOINT_PROMPT, RESET_PROMPT])
    expect(await $.tool.call({ tool: 'Bash', command: 'ls' }), 'the work goes on after the reset').toMatchObject({ result: 'ran' })
  })

  test('a prompt the person types during a pause lifts it', async ($, on) => {
    const { saved, prompts, clock } = world(on, LIMITS)

    on('tool.call', () => ({ result: 'ran' }))
    saved.set('limits', { five_hour: 70 })

    await $.session.start(SESSION)
    await clock.settle()

    expect(await $.tool.call({ tool: 'Bash', command: 'ls' }), 'already past the limit at the start').toMatchObject({ deny: expect.stringContaining('Paused') })

    await $.prompt.submit({ text: 'go on anyway', origin: { kind: 'composer' }, wait: false })

    expect(prompts, 'no resume prompt: the person wrote their own').toEqual(['go on anyway'])
    expect(await $.tool.call({ tool: 'Bash', command: 'ls' })).toMatchObject({ result: 'ran' })
  })

  test('an empty band is left to Claude Code', async ($, on) => {
    world(on)

    await $.session.start(SESSION)

    const ui = await $.ui.mount({ ...band(), surface: 'terminal' })

    expect(await ui.find({ type: 'Text', text: 'drawn by Claude Code' })).toBeDefined()
    expect(await ui.find({ type: 'Button' })).toBeUndefined()

    await ui.unmount()
  })

  test('a completed step plays the step chime and a finished plan the plan chime', async ($, on) => {
    const { played, clock } = world(on)

    await $.session.start(SESSION)

    await report($, clock, { plan: 'Refactor', step: 0, total: 2 })
    expect(played, 'a plan that starts completes no step').toEqual([])

    await report($, clock, { plan: 'Refactor', step: 1, note: 'tests' })
    expect(played).toEqual(['fx/step-done.wav'])

    await report($, clock, { plan: 'Refactor', step: 1 })
    expect(played, 'the same step again plays nothing').toEqual(['fx/step-done.wav'])

    await report($, clock, { plan: 'Refactor', done: true })
    expect(played).toEqual(['fx/step-done.wav', 'fx/plan-done.wav'])
  })

  test('the sound option turns the chimes off', { options: { sound: false } }, async ($, on) => {
    const { played, clock } = world(on)

    await $.session.start(SESSION)
    await report($, clock, { plan: 'Quiet', step: 1, total: 2 })
    await report($, clock, { plan: 'Quiet', done: true })

    expect(played).toEqual([])
  })

  test('✕ dissolves the row, then removes the plan from the band and the store', async ($, on) => {
    const { saved, played, blits, clock } = world(on)

    await $.session.start(SESSION)

    for (const surface of ['terminal', 'desktop'] as const) {
      await report($, clock, { plan: 'Docs', step: 1, total: 3 })
      await clock.advance(SETTLED_MS)

      const ui = await $.ui.mount({ ...band(), surface })
      const before = blits.length

      await ui.press({ key: 'remove:docs' })

      expect(played.at(-1), 'a soft dissolve sound').toBe('fx/dissolve.wav')
      expect(saved.has(HERE('docs')), 'the plan stays while its row comes apart').toBe(true)
      expect(await ui.find({ key: 'remove:docs' }), 'its ✕ gives way at once').toBeUndefined()

      if (surface === 'desktop') {
        const row = JSON.stringify(await ui.find({ key: 'row:docs' }))

        expect(row, 'its LEDs fly off').toContain('class=\\"fl\\"')
        expect(row, 'its chip pops').toContain('class=\\"cp\\"')
        expect(await ui.find({ key: 'burst:docs' }), 'the burst plays on a layer of its own, in front').toBeDefined()
      } else {
        await clock.advance(400)

        const sparkles = blits.slice(before).filter(blit => blit.key === 'meters').map(blit => decodeText(blit.cells, blit.columns)[0] ?? '')

        expect(sparkles.some(row => /[✦·]/.test(row)), 'its cells sparkle as they go').toBe(true)
      }

      await clock.advance(1200)

      expect(saved.has(HERE('docs'))).toBe(false)
      expect(await ui.find({ type: 'Text', text: 'Docs' }), 'the row is gone').toBeUndefined()
      expect(await ui.find({ type: 'Text', text: 'drawn by Claude Code' })).toBeDefined()

      await ui.unmount()
    }
  })

  test('an accented name keys the plan by its letters', async ($, on) => {
    const { saved, clock } = world(on)

    await $.session.start(SESSION)
    await report($, clock, { plan: 'Contrôle du mod — été', step: 1, total: 2 })

    expect(saved.has(HERE('controle-du-mod-ete'))).toBe(true)

    const removed = await $.command.run({ command: 'progress', args: 'remove Contrôle du mod — été', ...RUN })

    expect(removed.text).toBe('Removed "Contrôle du mod — été".')
    expect(saved.size).toBe(0)
  })

  test('a reloaded module finds a stored plan before its session.start runs', async ($, on) => {
    const { saved, clock } = world(on)

    saved.set(HERE('refonte'), {
      id: 'refonte',
      name: 'Refonte',
      step: 3,
      total: 5,
      note: 'Rendu',
      createdAt: 1,
      updatedAt: 2,
    })

    const answer = await report($, clock, { plan: 'Refonte', step: 4, note: 'Terminal' })

    expect(answer).toMatchObject({ result: expect.stringContaining('Refonte: 4/5 (80%) — Terminal') })
    expect(saved.get(HERE('refonte'))).toMatchObject({ step: 4, total: 5, createdAt: 1 })
  })

  test('every minute the band picks up what another conversation of the folder reported', async ($, on) => {
    const { saved, clock, played, blits } = world(on)
    const theirs = (step: number, updatedAt: number) => ({
      id: 'their-plan',
      name: 'Their plan',
      step,
      total: 4,
      note: 'Build',
      createdAt: 1,
      updatedAt,
    })

    await $.session.start(SESSION)
    await report($, clock, { plan: 'Mine', step: 1, total: 2 })

    const ui = await $.ui.mount({ ...band(), surface: 'terminal' })

    expect(await ui.find({ type: 'Text', text: 'Their plan' }), 'not there yet').toBeUndefined()

    saved.set(HERE('their-plan'), theirs(1, 10))
    await clock.advance(60_000)

    expect(await ui.find({ type: 'Text', text: 'Their plan' }), 'there within the minute').toBeDefined()

    saved.set(HERE('their-plan'), theirs(4, 20))
    played.length = 0
    await clock.advance(60_000 + SETTLED_MS)

    const painted = blits.filter(blit => blit.key === 'meters').at(-1)
    const rows = painted === undefined ? [] : decodeText(painted.cells, painted.columns)

    expect(rows.some(row => /Done 4\/4.*100%$/.test(row)), 'its progress fills to where it stands').toBe(true)
    expect(played, 'no chime for work done elsewhere').toEqual([])

    saved.delete(HERE('their-plan'))
    await clock.advance(60_000)

    expect(await ui.find({ type: 'Text', text: 'Their plan' }), 'and it leaves when removed there').toBeUndefined()
    expect(await ui.find({ type: 'Text', text: 'Mine' }), 'this conversation keeps its own').toBeDefined()

    await ui.unmount()
  })

  test('each project folder has its own band', async ($, on) => {
    const { saved, clock } = world(on)

    saved.set(keyOf(folderKeyOf('/elsewhere/ifrit'), 'nouvel-ifrit'), {
      id: 'nouvel-ifrit',
      name: 'Nouvel Ifrit',
      step: 5,
      total: 6,
      note: 'Test',
      createdAt: 1,
      updatedAt: 2,
    })

    await $.session.start(SESSION)
    await report($, clock, { plan: 'Mine', step: 1, total: 2 })

    const ui = await $.ui.mount({ ...band(), surface: 'terminal' })

    expect(await ui.find({ type: 'Text', text: 'Mine' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Nouvel Ifrit' }), "another folder's plan").toBeUndefined()

    await ui.unmount()

    const cleared = await $.command.run({ command: 'progress', args: 'clear', ...RUN })

    expect(cleared.text).toBe('Cleared 1 plan.')
    expect(saved.has(keyOf(folderKeyOf('/elsewhere/ifrit'), 'nouvel-ifrit')), 'clear leaves other folders alone').toBe(true)
  })

  test('a plan of no folder is adopted by the first folder that reports it, a finished one dropped', async ($, on) => {
    const { saved, clock } = world(on)
    const plan = (id: string, name: string, step: number) => ({ id, name, step, total: 6, note: null, createdAt: 1, updatedAt: 2 })

    saved.set('plan:nouvel-ifrit', plan('nouvel-ifrit', 'Nouvel Ifrit', 5))
    saved.set('plan:old-and-done', plan('old-and-done', 'Old and done', 6))

    await $.session.start(SESSION)

    expect(saved.has('plan:old-and-done'), 'a finished legacy plan is dropped').toBe(false)

    const ui = await $.ui.mount({ ...band(), surface: 'terminal' })

    expect(await ui.find({ type: 'Text', text: 'Nouvel Ifrit' }), 'shown nowhere until reported').toBeUndefined()

    await ui.unmount()

    const answer = await report($, clock, { plan: 'Nouvel Ifrit', step: 6 })

    expect(answer).toMatchObject({ result: expect.stringContaining('Nouvel Ifrit: 6/6 (done)') })
    expect(saved.has('plan:nouvel-ifrit')).toBe(false)
    expect(saved.get(HERE('nouvel-ifrit'))).toMatchObject({ step: 6, total: 6, createdAt: 1 })
  })

  test('a refused input tells the model why', async ($, on) => {
    const { clock } = world(on)

    await $.session.start(SESSION)

    expect(await report($, clock, { step: 1 })).toMatchObject({
      result: expect.stringContaining('"plan" is required'),
    })
    expect(await report($, clock, { plan: 'New one', step: 1 })).toMatchObject({
      result: expect.stringContaining('"total" is required'),
    })
    expect(await report($, clock, { plan: 'New one', step: 7, total: 3 })).toMatchObject({
      result: expect.stringContaining('New one: 3/3 (done)'),
    })
  })

  test('the tool is listed in the prompt, not behind ToolSearch', async ($, on) => {
    world(on)

    await $.session.start(SESSION)

    const described = await $.tool.describe({
      tool: TOOL,
      description: 'Report your progress',
      provider: { plugin: 'progress', tier: 'user' },
    })

    expect(described.isDeferred).toBe(false)
  })

  test('/progress lists the plans, clear drops them', async ($, on) => {
    const { saved, clock } = world(on)

    await $.session.start(SESSION)
    await report($, clock, { plan: 'A', step: 1, total: 2 })
    await report($, clock, { plan: 'B', total: 5, note: 'reading' })

    const listed = await $.command.run({ command: 'progress', args: '', ...RUN })

    expect(listed.text).toContain('· A: 1/2 (50%)')
    expect(listed.text).toContain('· B: 0/5 (0%) — reading')

    const removed = await $.command.run({ command: 'progress', args: 'remove B', ...RUN })

    expect(removed.text).toBe('Removed "B".')
    expect(saved.has(HERE('b'))).toBe(false)

    const cleared = await $.command.run({ command: 'progress', args: 'clear', ...RUN })

    expect(cleared.text).toBe('Cleared 1 plan.')
    expect(saved.size).toBe(0)
  })

  test('plans another session of this folder saved show from the start', async ($, on) => {
    const { saved } = world(on)

    saved.set(HERE('elsewhere'), {
      id: 'elsewhere',
      name: 'Elsewhere',
      step: 2,
      total: 4,
      note: null,
      createdAt: 1,
      updatedAt: 2,
    })
    saved.set('other-key', 'not a plan')

    await $.session.start(SESSION)

    const ui = await $.ui.mount({ ...band(), surface: 'terminal' })
    const [meter = ''] = await rasterText(await ui.find({ key: 'meters' }))

    expect(await ui.find({ type: 'Text', text: 'Elsewhere' })).toBeDefined()
    expect(meter).toMatch(/▐Step 3\/4▌.* 50%$/)

    await ui.unmount()
  })
})
