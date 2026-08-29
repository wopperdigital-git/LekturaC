import { describe, expect, it } from 'vitest'
import { MIN_FRAME_H, MIN_FRAME_W, HANDLES, type Frame } from './frame'
import { clampFrame, frameCenter, moveFrame, resizeFrame, rotatedBounds } from './frameGeometry'

const base: Frame = { x: 200, y: 100, w: 400, h: 200, rotation: 0 }

/* Stands in for the card's content area — what an element is aligned inside. */
const CARD = { w: 960, h: 540 }

const right = (f: Frame) => f.x + f.w
const bottom = (f: Frame) => f.y + f.h

describe('resizeFrame', () => {
  /*
    The rule the whole feature rests on: whichever handle is dragged, the
    opposite edge does not move. Checked for all eight rather than a
    representative few, because a sign error in one row of the ANCHOR table is
    invisible in the other seven.
  */
  it('anchors the opposite edge for every handle', () => {
    const cases: Record<string, (f: Frame) => number[]> = {
      // dragged handle -> the coordinates that must survive it
      e: (f) => [f.x, f.y, bottom(f)],
      w: (f) => [right(f), f.y, bottom(f)],
      s: (f) => [f.x, f.y, right(f)],
      n: (f) => [f.x, bottom(f), right(f)],
      se: (f) => [f.x, f.y],
      sw: (f) => [right(f), f.y],
      ne: (f) => [f.x, bottom(f)],
      nw: (f) => [right(f), bottom(f)],
    }

    for (const handle of HANDLES) {
      const next = resizeFrame(base, handle, 60, 40)
      expect(cases[handle](next), `handle ${handle}`).toEqual(cases[handle](base))
    }
  })

  it('grows width and leaves x alone when dragging the right edge out', () => {
    const next = resizeFrame(base, 'e', 100, 0)
    expect(next).toEqual({ x: 200, y: 100, w: 500, h: 200, rotation: 0 })
  })

  it('moves x and grows width when dragging the left edge out', () => {
    const next = resizeFrame(base, 'w', -100, 0)
    expect(next).toEqual({ x: 100, y: 100, w: 500, h: 200, rotation: 0 })
  })

  it('moves y and grows height when dragging the top edge up', () => {
    const next = resizeFrame(base, 'n', 0, -50)
    expect(next).toEqual({ x: 200, y: 50, w: 400, h: 250, rotation: 0 })
  })

  it('grows height and leaves y alone when dragging the bottom edge down', () => {
    const next = resizeFrame(base, 's', 0, 50)
    expect(next).toEqual({ x: 200, y: 100, w: 400, h: 250, rotation: 0 })
  })

  it('ignores the cross axis for edge handles', () => {
    expect(resizeFrame(base, 'e', 0, 999).h).toBe(base.h)
    expect(resizeFrame(base, 'n', 999, 0).w).toBe(base.w)
  })

  it('takes both axes for a corner handle', () => {
    const next = resizeFrame(base, 'se', 100, 50)
    expect(next).toEqual({ x: 200, y: 100, w: 500, h: 250, rotation: 0 })
  })

  /*
    Clamping has to hold the anchor too. Before the anchor was recomputed from
    the *clamped* size, dragging a handle past the minimum pinned the size but
    kept sliding the box along with the pointer.
  */
  it('stops at the minimum size without dragging the anchored edge along', () => {
    const next = resizeFrame(base, 'w', 10_000, 0)
    expect(next.w).toBe(MIN_FRAME_W)
    expect(right(next)).toBe(right(base))
  })

  it('clamps height at the minimum from the top handle and keeps the bottom edge', () => {
    const next = resizeFrame(base, 'n', 0, 10_000)
    expect(next.h).toBe(MIN_FRAME_H)
    expect(bottom(next)).toBe(bottom(base))
  })

  it('rounds off float drift so a long drag does not accumulate noise', () => {
    const next = resizeFrame(base, 'e', 0.123456, 0)
    expect(next.w).toBe(400.12)
  })

  describe('rotated', () => {
    const tilted: Frame = { ...base, rotation: 90 }

    /*
      At 90° the box's own width runs down the screen, so a *downward* drag is
      what grows it. Getting this wrong is the classic rotated-resize bug: the
      box shears away from the pointer instead of following it.
    */
    it('applies the drag along the element axis, not the screen axis', () => {
      expect(resizeFrame(tilted, 'e', 0, 100).w).toBe(500)
      expect(resizeFrame(tilted, 'e', 100, 0).w).toBe(400)
    })

    it('keeps the anchor corner fixed in world space', () => {
      const before = rotatedBounds(tilted)
      const next = resizeFrame(tilted, 'se', 0, 120)
      const after = rotatedBounds(next)
      // `se`'s anchor is the north-west corner; under a 90° turn that corner is
      // the top-right of the visible bounds.
      expect(after.right).toBeCloseTo(before.right, 6)
      expect(after.top).toBeCloseTo(before.top, 6)
    })

    it('leaves rotation untouched', () => {
      expect(resizeFrame(tilted, 'nw', 30, 30).rotation).toBe(90)
    })
  })
})

describe('rotatedBounds', () => {
  it('is the frame itself when unrotated', () => {
    expect(rotatedBounds(base)).toEqual({ left: 200, top: 100, right: 600, bottom: 300 })
  })

  it('swaps the axes at 90 degrees, about the centre', () => {
    const bounds = rotatedBounds({ ...base, rotation: 90 })
    const center = frameCenter(base)
    expect(bounds.right - bounds.left).toBeCloseTo(base.h, 6)
    expect(bounds.bottom - bounds.top).toBeCloseTo(base.w, 6)
    expect((bounds.left + bounds.right) / 2).toBeCloseTo(center.x, 6)
  })

  it('grows past the frame at 45 degrees', () => {
    const bounds = rotatedBounds({ ...base, rotation: 45 })
    expect(bounds.right - bounds.left).toBeGreaterThan(base.w)
  })
})

describe('clampFrame / moveFrame', () => {
  it('leaves an on-slide frame alone', () => {
    expect(clampFrame(base, CARD)).toEqual(base)
  })

  it('allows an element to hang off the edge', () => {
    const next = moveFrame(base, -150, 0, CARD)
    expect(next.x).toBe(50)
    expect(moveFrame(next, -100, 0, CARD).x).toBe(-50)
  })

  it('stops the centre leaving the slide, so it stays grabbable', () => {
    const next = moveFrame(base, -100_000, -100_000, CARD)
    expect(frameCenter(next)).toEqual({ x: 0, y: 0 })
  })

  it('keeps the size while clamping', () => {
    const next = moveFrame(base, 100_000, 100_000, CARD)
    expect(next.w).toBe(base.w)
    expect(next.h).toBe(base.h)
    expect(frameCenter(next)).toEqual({ x: CARD.w, y: CARD.h })
  })
})
