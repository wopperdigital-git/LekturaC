import { describe, expect, it } from 'vitest'
import { PAN_THRESHOLD_PX, hasPanned, panScroll } from './pan'

describe('panScroll', () => {
  it('moves the view opposite to the pointer, so the content follows the hand', () => {
    // Dragging left and up by (30, 40) reveals more to the right and below.
    expect(panScroll({ x: 100, y: 200 }, { x: 500, y: 500 }, { x: 470, y: 460 })).toEqual({ x: 130, y: 240 })
  })

  it('is exactly where it started when the pointer has not moved', () => {
    expect(panScroll({ x: 12, y: 34 }, { x: 5, y: 5 }, { x: 5, y: 5 })).toEqual({ x: 12, y: 34 })
  })

  it('depends only on the start and the current pointer, so a skipped event cannot cause drift', () => {
    const start = { x: 0, y: 0 }
    const direct = panScroll({ x: 50, y: 50 }, start, { x: 40, y: 10 })
    const afterWander = panScroll({ x: 50, y: 50 }, start, { x: 40, y: 10 })
    expect(afterWander).toEqual(direct)
  })

  it('can ask for a negative scroll; the browser clamps it, not this', () => {
    expect(panScroll({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 25, y: 25 })).toEqual({ x: -25, y: -25 })
  })
})

describe('hasPanned', () => {
  it('does not count a press that barely moved, so a click is still a click', () => {
    expect(hasPanned({ x: 10, y: 10 }, { x: 11, y: 11 })).toBe(false)
    expect(hasPanned({ x: 10, y: 10 }, { x: 10 + PAN_THRESHOLD_PX, y: 10 })).toBe(false)
  })

  it('counts a press that travelled past the threshold in any direction', () => {
    expect(hasPanned({ x: 10, y: 10 }, { x: 10 + PAN_THRESHOLD_PX + 1, y: 10 })).toBe(true)
    expect(hasPanned({ x: 10, y: 10 }, { x: 10, y: 10 - PAN_THRESHOLD_PX - 1 })).toBe(true)
  })
})
