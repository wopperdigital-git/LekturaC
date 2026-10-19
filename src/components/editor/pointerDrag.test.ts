import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { DRAG_THRESHOLD_PX, exceedsDragThreshold, startPendingDrag, startPointerDrag } from './pointerDrag'

describe('exceedsDragThreshold', () => {
  // A still click must stay a click: it is how a selected element's text is opened.
  it('keeps a press that barely moved a tap', () => {
    expect(exceedsDragThreshold(0, 0)).toBe(false)
    expect(exceedsDragThreshold(2, 2)).toBe(false)
    expect(exceedsDragThreshold(-3, 0)).toBe(false)
  })

  it('turns a press into a drag once it has travelled the threshold, in any direction', () => {
    expect(exceedsDragThreshold(DRAG_THRESHOLD_PX, 0)).toBe(true)
    expect(exceedsDragThreshold(0, -DRAG_THRESHOLD_PX)).toBe(true)
    expect(exceedsDragThreshold(3, 3)).toBe(true)
  })
})

/*
  The gestures against a stand-in `window` (a plain EventTarget): there is no DOM here.
  What matters for touch is which pointer a gesture follows, and what a second finger
  does to it — on a tablet, two fingers are a pinch to zoom, never a drag or a tap.
*/
describe('drag gestures with more than one pointer', () => {
  const target = new EventTarget()
  beforeEach(() => {
    vi.stubGlobal('window', Object.assign(target, { getSelection: () => null }))
    vi.stubGlobal('document', { body: { style: { userSelect: '' } } })
  })
  afterEach(() => vi.unstubAllGlobals())

  const press = (pointerId: number, x = 0, y = 0) => ({ pointerId, clientX: x, clientY: y }) as unknown as ReactPointerEvent
  const fire = (type: string, pointerId: number, x = 0, y = 0) =>
    target.dispatchEvent(Object.assign(new Event(type), { pointerId, clientX: x, clientY: y }))

  it("follows only the finger that pressed, not another one's moves", () => {
    const onMove = vi.fn()
    startPendingDrag(press(1), { onMove })
    fire('pointermove', 2, 50, 50)
    expect(onMove).not.toHaveBeenCalled()
    fire('pointermove', 1, 10, 0)
    expect(onMove).toHaveBeenCalledWith(10, 0, expect.anything())
    fire('pointerup', 1)
  })

  it('stands down without a tap when a second finger lands before it moved', () => {
    const handlers = { onMove: vi.fn(), onEnd: vi.fn(), onTap: vi.fn() }
    startPendingDrag(press(1), handlers)
    fire('pointerdown', 2)
    fire('pointermove', 1, 30, 0)
    fire('pointerup', 1)
    expect(handlers.onTap).not.toHaveBeenCalled()
    expect(handlers.onMove).not.toHaveBeenCalled()
    expect(handlers.onEnd).not.toHaveBeenCalled()
  })

  it('ends a move once when a second finger lands mid-drag, and ignores what follows', () => {
    const handlers = { onMove: vi.fn(), onEnd: vi.fn(), onTap: vi.fn() }
    startPendingDrag(press(1), handlers)
    fire('pointermove', 1, 10, 0)
    fire('pointerdown', 2)
    fire('pointermove', 1, 40, 0)
    fire('pointerup', 1)
    expect(handlers.onEnd).toHaveBeenCalledTimes(1)
    expect(handlers.onMove).toHaveBeenCalledTimes(1)
    expect(handlers.onTap).not.toHaveBeenCalled()
  })

  it('ends on the release of its own pointer only', () => {
    const onEnd = vi.fn()
    startPointerDrag(press(1), vi.fn(), onEnd)
    fire('pointerup', 2)
    expect(onEnd).not.toHaveBeenCalled()
    fire('pointerup', 1)
    expect(onEnd).toHaveBeenCalledTimes(1)
  })

  it('a resize or rotate also follows one finger and ends when a second lands', () => {
    const onMove = vi.fn()
    const onEnd = vi.fn()
    startPointerDrag(press(1), onMove, onEnd)
    fire('pointermove', 2, 50, 50)
    expect(onMove).not.toHaveBeenCalled()
    fire('pointerdown', 2)
    expect(onEnd).toHaveBeenCalledTimes(1)
    fire('pointermove', 1, 10, 10)
    expect(onMove).not.toHaveBeenCalled()
  })
})
