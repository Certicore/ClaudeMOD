import { describe, expect, test } from 'claude-code/testing'

import type { GuardView } from '../hooks/views/guard'
import { desktopLimitPicker } from '../hooks/views/guard'

/** A drawn element as the fake constructors below build it. */
type Drawn = { type: string; props: Record<string, unknown> }

/** Element constructors that record what they were called with, as the surface's table would build it. */
function table() {
  const make = (type: string) => (props: Record<string, unknown>) => ({ type, props }) as never

  return { Box: make('Box'), Text: make('Text'), Button: make('Button'), Svg: make('Svg'), Client: make('Client') }
}

/** Every element of a drawn tree, depth first. */
function walk(node: unknown, found: Drawn[] = []): Drawn[] {
  if (Array.isArray(node)) {
    node.forEach(child => walk(child, found))
  } else if (node !== null && typeof node === 'object' && 'type' in node) {
    const element = node as Drawn

    found.push(element)
    walk(element.props.children, found)
  }

  return found
}

function guard(draft: number | null, picked: number[]): GuardView {
  return {
    limits: {},
    editing: 'five_hour',
    draft,
    draftFrom: null,
    isOpening: false,
    justSet: null,
    isDragReady: false,
    pause: null,
    onEdit: () => {},
    onNudge: () => {},
    onConfirm: () => {},
    onPick: limit => {
      picked.push(limit)
    },
    onClear: () => {},
    onSave: () => {},
    onResume: () => {},
  }
}

const QUOTA = { kind: 'five_hour', label: '5h', remaining: 62 }

describe('guard-view', () => {
  test('the desktop dial is a row of click targets, each showing its percent on hover', () => {
    const picked: number[] = []
    const elements = walk(desktopLimitPicker(table(), guard(25, picked), QUOTA, 1))
    const steps = elements.filter(each => String(each.props.key ?? '').startsWith('dial-step:five_hour:'))
    const readouts = elements.filter(each => each.type === 'Box' && each.props.display === 'none')
    const scopeOf = (each: Drawn) => (each.props.hover as { scope?: string } | undefined)?.scope

    expect(steps.length, 'one per 5% step, 5% to 90%').toBe(18)
    expect(readouts.length, 'a readout line per step').toBe(18)
    expect(readouts.every(each => (each.props.hover as { display?: string } | undefined)?.display === 'flex'), 'shown while its step is hovered').toBe(true)
    expect(readouts.map(scopeOf), 'each readout lit by its own step').toEqual(steps.map(scopeOf))
    expect(new Set(steps.map(scopeOf)).size, 'one hover group per step').toBe(18)
    expect(
      elements.some(each => String(each.props.key ?? '').startsWith('dial-slot:') && JSON.stringify(each.props.children ?? '').includes('display')),
      'nothing revealed on the track itself',
    ).toBe(false)
    expect(elements.some(each => each.type === 'Client'), 'no drag region on the desktop').toBe(false)
    expect(elements.some(each => String(each.props.key ?? '').startsWith('nudge:')), 'no arrows').toBe(false)

    ;(steps.find(each => each.props.key === 'dial-step:five_hour:70')?.props.onPress as () => void)()
    ;(steps.find(each => each.props.key === 'dial-step:five_hour:5')?.props.onPress as () => void)()

    expect(picked, 'a click sets the limit there').toEqual([70, 5])
  })

  test('with no limit yet, the dial asks for a click', () => {
    const elements = walk(desktopLimitPicker(table(), guard(null, []), QUOTA, 1))
    const svg = elements.find(each => each.type === 'Svg')

    expect(String(svg?.props.source)).toContain('click the bar to set a limit')
    expect(String(svg?.props.source)).not.toContain('pause at')
  })
})
