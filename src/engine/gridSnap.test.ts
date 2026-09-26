import { describe, expect, it } from 'vitest'
import { HANDLES, MIN_FRAME_H, MIN_FRAME_W, type Frame } from './frame'
import { resizeFrame, rotatedBounds } from './frameGeometry'
import { GRID_DIVISIONS, gridCell, snapMove, snapResize, snapToGrid } from './gridSnap'

const CELL = 20
// Frames are rounded to a hundredth of a pixel (as in frameGeometry), so "on a line" means within that.
const on = (n: number) => Math.abs(n - Math.round(n / CELL) * CELL) <= 0.01

describe('gridCell', () => {
  it('is a fixed fraction of the content width, so the grid scales with the card', () => {
    expect(gridCell(GRID_DIVISIONS * 20)).toBe(20)
    expect(gridCell(GRID_DIVISIONS * 40)).toBe(40)
  })

  it('never returns a cell too small to snap to (an unmeasured card is width 0)', () => {
    expect(gridCell(0)).toBeGreaterThan(0)
  })
})

describe('snapToGrid', () => {
  it('rounds to the nearest line', () => {
    expect(snapToGrid(29, CELL)).toBe(20)
    expect(snapToGrid(31, CELL)).toBe(40)
    expect(snapToGrid(-11, CELL)).toBe(-20)
  })
})

describe('snapMove', () => {
  const frame: Frame = { x: 133, y: 47, w: 300, h: 90, rotation: 0 }

  it("puts the element's top-left corner on a grid line and keeps its size", () => {
    const next = snapMove(frame, CELL)
    expect(on(next.x)).toBe(true)
    expect(on(next.y)).toBe(true)
    expect([next.w, next.h, next.rotation]).toEqual([300, 90, 0])
  })

  it('snaps the visible bounds of a rotated element, not its unrotated rectangle', () => {
    const tilted = snapMove({ ...frame, rotation: 30 }, CELL)
    const bounds = rotatedBounds(tilted)
    expect(on(bounds.left)).toBe(true)
    expect(on(bounds.top)).toBe(true)
    expect(tilted.rotation).toBe(30)
  })

  it('is idempotent', () => {
    const once = snapMove(frame, CELL)
    expect(snapMove(once, CELL)).toEqual(once)
  })
})

describe('snapResize', () => {
  const start: Frame = { x: 200, y: 100, w: 400, h: 200, rotation: 0 }

  it('snaps only the edges the handle is dragging and leaves the others where they were', () => {
    const dragged = resizeFrame(start, 'se', 33, 27)
    const next = snapResize(dragged, 'se', CELL)
    expect(next.x).toBe(start.x)
    expect(next.y).toBe(start.y)
    expect(on(next.x + next.w)).toBe(true)
    expect(on(next.y + next.h)).toBe(true)
  })

  it('keeps the anchored edge fixed for every handle', () => {
    const odd: Frame = { x: 203, y: 107, w: 401, h: 203, rotation: 0 }
    for (const handle of HANDLES) {
      const dragged = resizeFrame(odd, handle, 37, 29)
      const next = snapResize(dragged, handle, CELL)
      if (handle.includes('e')) expect(next.x, handle).toBe(odd.x)
      if (handle.includes('w')) expect(next.x + next.w, handle).toBeCloseTo(odd.x + odd.w, 5)
      if (handle.includes('s')) expect(next.y, handle).toBe(odd.y)
      if (handle.includes('n')) expect(next.y + next.h, handle).toBeCloseTo(odd.y + odd.h, 5)
    }
  })

  it('leaves a rotated resize alone', () => {
    const tilted = resizeFrame({ ...start, rotation: 20 }, 'se', 33, 27)
    expect(snapResize(tilted, 'se', CELL)).toEqual(tilted)
  })

  it('never snaps an element below its minimum size', () => {
    const tiny: Frame = { x: 200, y: 100, w: MIN_FRAME_W, h: MIN_FRAME_H, rotation: 0 }
    const dragged = resizeFrame(tiny, 'se', -500, -500)
    const next = snapResize(dragged, 'se', 100)
    expect(next.w).toBeGreaterThanOrEqual(MIN_FRAME_W)
    expect(next.h).toBeGreaterThanOrEqual(MIN_FRAME_H)
  })
})
