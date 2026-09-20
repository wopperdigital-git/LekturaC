/*
  Panning the canvas: dragging the view around by grabbing it.

  Pure and DOM-free so the arithmetic is testable. The gesture itself — which
  keys and buttons start it, what it swallows — lives in `useCanvasPan`.
*/

/** How far the pointer must travel before a press counts as a drag rather than a click. */
export const PAN_THRESHOLD_PX = 3

export interface Point {
  x: number
  y: number
}

/**
 * The scroll position for a pan in progress.
 *
 * Grabbing the canvas moves the *content* with the pointer, so the view moves
 * the opposite way: dragging left scrolls right. Computed from where the press
 * started and the scroll position it started at — never from the previous
 * position — so a dropped or coalesced pointer event cannot leave the content
 * drifting away from the cursor.
 */
export function panScroll(startScroll: Point, startPointer: Point, pointer: Point): Point {
  return {
    x: startScroll.x - (pointer.x - startPointer.x),
    y: startScroll.y - (pointer.y - startPointer.y),
  }
}

/** Whether the pointer has moved far enough from where it went down to be a drag. */
export function hasPanned(startPointer: Point, pointer: Point): boolean {
  return Math.hypot(pointer.x - startPointer.x, pointer.y - startPointer.y) > PAN_THRESHOLD_PX
}
