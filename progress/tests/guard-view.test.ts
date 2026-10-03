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

function guard(isDragReady: boolean, picked: number[]): GuardView {
  return {
    limits: {},
    editing: 'five_hour',
    draft: 25,
    draftFrom: null,
    isDragReady,
    pause: null,
    onEdit: () => {},
    onNudge: () => {},
    onConfirm: () => {},
    onPick: limit => {
      picked.push(limit)
    },
    onSetLimit: () => {},
    onSave: () => {},
    onResume: () => {},
  }
}

const QUOTA = { kind: 'five_hour', label: '5h', remaining: 62 }

describe('guard-view', () => {
  test('where the drag region does not run, the track is a row of click targets', () => {
    const picked: number[] = []
    const elements = walk(desktopLimitPicker(table(), guard(false, picked), QUOTA))
    const steps = elements.filter(each => String(each.props.key ?? '').startsWith('dial-step:five_hour:'))

    expect(steps.length, 'one per 5% step, 5% to 95%').toBe(19)
    expect(elements.some(each => String(each.props.key ?? '').startsWith('nudge:')), 'no arrows').toBe(false)

    const seventy = steps.find(each => each.props.key === 'dial-step:five_hour:70')
    const ninetyFive = steps.find(each => each.props.key === 'dial-step:five_hour:95')

    ;(seventy?.props.onPress as () => void)()
    ;(ninetyFive?.props.onPress as () => void)()

    expect(picked, 'a click moves the knob there, kept within 90%').toEqual([70, 90])
  })

  test('where the drag region runs, the track is left to it', () => {
    const elements = walk(desktopLimitPicker(table(), guard(true, []), QUOTA))

    expect(elements.some(each => String(each.props.key ?? '').startsWith('dial-step:'))).toBe(false)
    expect(elements.some(each => each.type === 'Client'), 'the drag region').toBe(true)
  })
})
