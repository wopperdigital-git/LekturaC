import { describe, expect, it } from 'vitest'
import { DRAG_THRESHOLD_PX, exceedsDragThreshold } from './pointerDrag'

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
