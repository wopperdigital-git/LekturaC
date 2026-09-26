import { MIN_FRAME_H, MIN_FRAME_W, type Frame, type Handle } from './frame'
import { rotatedBounds } from './frameGeometry'

/*
  The editor's graph-paper grid, as arithmetic.

  The grid lives in the same space as a `Frame`: the card's content box, whose
  origin is the top-left of `SlideBody`. Sharing that origin is the whole point —
  a snapped edge has to land on a line the overlay actually draws.

  Its unit is a fraction of the content width, like a stored nudge, so a card
  keeps the same grid (and the same snapped arrangement) at every card width and
  canvas zoom.

  Pure and DOM-free for the same reason `frameGeometry.ts` is.
*/

/** How many cells span the content width. */
export const GRID_DIVISIONS = 40

/** Every this-many-th line is drawn heavier, as on graph paper. */
export const GRID_MAJOR_EVERY = 5

/** Below this a cell is too small to snap to or draw; stands in for a card not measured yet (width 0). */
const MIN_CELL_PX = 4

export function gridCell(contentWidth: number): number {
  return Math.max(MIN_CELL_PX, contentWidth / GRID_DIVISIONS)
}

/** The nearest grid line to `value`, on either axis. */
export function snapToGrid(value: number, cell: number): number {
  return Math.round(value / cell) * cell
}

const round = (n: number) => Math.round(n * 100) / 100

/**
 * Moves `frame` so its visible top-left corner sits on a grid line. For a
 * rotated element that corner is the bounding box's, not the unrotated
 * rectangle's, since the bounding box is what the user sees against the grid.
 */
export function snapMove(frame: Frame, cell: number): Frame {
  const bounds = rotatedBounds(frame)
  return {
    ...frame,
    x: round(frame.x + snapToGrid(bounds.left, cell) - bounds.left),
    y: round(frame.y + snapToGrid(bounds.top, cell) - bounds.top),
  }
}

/**
 * Snaps the edges a resize handle is dragging, and only those: the anchored
 * side stays exactly where `resizeFrame` pinned it.
 *
 * A rotated element is left alone. Its edges are not axis-aligned, so a grid line
 * would have to cut through a tilted box and fight the anchor `resizeFrame` holds
 * in world space. An axis that would snap below the minimum size keeps its
 * unsnapped value rather than shrinking the element past being grabbable.
 */
export function snapResize(frame: Frame, handle: Handle, cell: number): Frame {
  if (frame.rotation !== 0) return frame

  let { x, y, w, h } = frame
  const right = x + w
  const bottom = y + h

  if (handle.includes('e')) {
    const snapped = snapToGrid(right, cell) - x
    if (snapped >= MIN_FRAME_W) w = snapped
  } else if (handle.includes('w')) {
    const left = snapToGrid(x, cell)
    if (right - left >= MIN_FRAME_W) {
      x = left
      w = right - left
    }
  }

  if (handle.includes('s')) {
    const snapped = snapToGrid(bottom, cell) - y
    if (snapped >= MIN_FRAME_H) h = snapped
  } else if (handle.includes('n')) {
    const top = snapToGrid(y, cell)
    if (bottom - top >= MIN_FRAME_H) {
      y = top
      h = bottom - top
    }
  }

  return { ...frame, x: round(x), y: round(y), w: round(w), h: round(h) }
}
