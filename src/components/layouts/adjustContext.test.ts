import { describe, expect, it } from 'vitest'
import { canGrab, type BlockAdjusting } from './adjustContext'

const noop = () => {}

function adjusting(over: Partial<BlockAdjusting> = {}): BlockAdjusting {
  return {
    selected: 2,
    selectedItem: null,
    select: noop,
    selectItem: noop,
    change: noop,
    startMove: noop,
    ...over,
  }
}

const PRIMARY = { button: 0 }

describe('canGrab', () => {
  it('grabs the selected element from a primary press anywhere on it', () => {
    expect(canGrab(adjusting(), null, 2, PRIMARY)).toBe(true)
  })

  // The first press only selects; it is the press on an already-selected element that grabs.
  it('does not grab an element that is not the selected one', () => {
    expect(canGrab(adjusting(), null, 1, PRIMARY)).toBe(false)
    expect(canGrab(adjusting({ selected: null }), null, 2, PRIMARY)).toBe(false)
  })

  // A press in text that is open for editing places a caret or selects characters.
  it('does not grab while the element has text open for editing', () => {
    expect(canGrab(adjusting(), '2:text', 2, PRIMARY)).toBe(false)
    expect(canGrab(adjusting(), '2:items:1', 2, PRIMARY)).toBe(false)
    expect(canGrab(adjusting(), '0:text', 2, PRIMARY)).toBe(true)
  })

  it('does not grab while one of its items is picked out, or with no move to start', () => {
    expect(canGrab(adjusting({ selectedItem: 0 }), null, 2, PRIMARY)).toBe(false)
    expect(canGrab(adjusting({ startMove: undefined }), null, 2, PRIMARY)).toBe(false)
  })

  it('ignores anything but the primary button', () => {
    expect(canGrab(adjusting(), null, 2, { button: 2 })).toBe(false)
  })
})
