/*
  A rectangle on a slide, in CSS pixels, while it is being dragged.

  Transient by design and never persisted: what a card stores is a
  `BlockAdjust` — a delta from wherever the layout engine put the element,
  measured as a fraction of the card's width (see `engine/blockAdjust.ts`). A
  frame is what that turns into for the duration of one gesture, because resize
  maths wants a concrete rectangle and not a delta.

  The flow is: measure the element's rect off the DOM, run `resizeFrame` on it,
  then fold the difference back into the stored adjustment. Keeping the maths in
  pixel space is what lets `frameGeometry.ts` stay a pure, testable module with
  no opinion about cards, fractions or responsiveness.
*/

export interface Frame {
  x: number
  y: number
  w: number
  h: number
  /** Clockwise degrees about the frame's own centre. */
  rotation: number
}

/*
  A element smaller than this cannot be grabbed: the resize handles are ~9
  pixels and would overlap each other, leaving no way to make it bigger again.
  Enforced in `resizeFrame` rather than in a schema, so an element whose own
  content is genuinely smaller still renders.
*/
export const MIN_FRAME_W = 48
export const MIN_FRAME_H = 24

/**
 * The eight resize handles, named by compass point.
 *
 * Compass names rather than `topLeft`/`middleRight` because the maths in
 * `frameGeometry.ts` reads off them directly — `n` is the edge whose y shrinks,
 * `e` the edge whose x grows — and because they map one-to-one onto the CSS
 * resize cursors (`nwse-resize` and friends).
 */
export const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const

export type Handle = (typeof HANDLES)[number]
