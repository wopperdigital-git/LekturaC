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

/** Pixels per line, for a wheel that reports in lines (`deltaMode` 1) rather than pixels. */
const LINE_PX = 16

/**
 * How far a wheel event should scroll the canvas sideways, in pixels.
 *
 * The canvas hides its horizontal scrollbar (`overflow-x: hidden`), and a hidden
 * overflow is still scrollable from script but no longer by the wheel — so this
 * does by hand what the browser would: a trackpad's sideways swipe (`deltaX`),
 * and Shift + wheel, which turns a vertical notch sideways.
 */
export function horizontalWheelDelta(wheel: {
  deltaX: number
  deltaY: number
  deltaMode: number
  shiftKey: boolean
}): number {
  const raw = wheel.deltaX !== 0 ? wheel.deltaX : wheel.shiftKey ? wheel.deltaY : 0
  return wheel.deltaMode === 1 ? raw * LINE_PX : raw
}
