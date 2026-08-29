import { MIN_FRAME_H, MIN_FRAME_W, type Frame, type Handle } from './frame'

/*
  The maths behind dragging a selection handle.

  Pure and DOM-free on purpose: this is the part that has to be *correct*, and
  correctness here is hard to see by eye — a resize that anchors the wrong edge
  looks almost right until you drag it far. Keeping it out of the component
  makes it directly unit-testable, which is the same bar `layoutEngine.ts` and
  `marks.ts` are held to.

  Every function takes and returns a whole `Frame` and mutates nothing: the
  store keeps previous frames alive inside undo snapshots, so editing in place
  would rewrite history along with the present.
*/

export interface Point {
  x: number
  y: number
}

const toRad = (deg: number) => (deg * Math.PI) / 180

/** Rotates a vector clockwise about the origin, in the same sense as CSS `rotate()`. */
function rotateVec(p: Point, deg: number): Point {
  if (deg === 0) return p
  const r = toRad(deg)
  const cos = Math.cos(r)
  const sin = Math.sin(r)
  return { x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos }
}

export function frameCenter(frame: Frame): Point {
  return { x: frame.x + frame.w / 2, y: frame.y + frame.h / 2 }
}

/*
  Rounded to a hundredth of a pixel.

  A frame is transient — it lives for one gesture and is folded back into a
  stored fraction (`engine/blockAdjust.ts` does its own rounding) — but a drag
  emits one per pointer event, and letting float noise compound across a long
  drag makes the anchored edge creep by a pixel or two.
*/
const round = (n: number) => Math.round(n * 100) / 100

function normalize(frame: Frame): Frame {
  return {
    x: round(frame.x),
    y: round(frame.y),
    w: round(frame.w),
    h: round(frame.h),
    rotation: round(frame.rotation),
  }
}

/** The box an element is being positioned inside: the card's own content area. */
export interface Container {
  w: number
  h: number
}

/*
  For each handle, the point that must not move while it is dragged, as signs of
  (w/2, h/2) from the centre — so `se`'s anchor is the north-west corner and
  `e`'s is the midpoint of the west edge.

  This table *is* the "opposite edge stays put" rule. Expressing it as the
  anchor rather than as per-handle x/y arithmetic is what makes rotation fall
  out for free: the anchor is pinned in world space, so a rotated box grows away
  from the corner you are not holding, exactly as it does unrotated.
*/
const ANCHOR: Record<Handle, Point> = {
  nw: { x: 1, y: 1 },
  n: { x: 0, y: 1 },
  ne: { x: -1, y: 1 },
  e: { x: -1, y: 0 },
  se: { x: -1, y: -1 },
  s: { x: 0, y: -1 },
  sw: { x: 1, y: -1 },
  w: { x: 1, y: 0 },
}

/** Which way each handle grows its box for a positive delta along that axis. */
const GROW: Record<Handle, Point> = {
  nw: { x: -1, y: -1 },
  n: { x: 0, y: -1 },
  ne: { x: 1, y: -1 },
  e: { x: 1, y: 0 },
  se: { x: 1, y: 1 },
  s: { x: 0, y: 1 },
  sw: { x: -1, y: 1 },
  w: { x: -1, y: 0 },
}

/** The world-space point this handle's drag holds fixed, for a given size. */
function anchorPoint(frame: Frame, handle: Handle, w: number, h: number): Point {
  const sign = ANCHOR[handle]
  const offset = rotateVec({ x: (sign.x * w) / 2, y: (sign.y * h) / 2 }, frame.rotation)
  const center = frameCenter(frame)
  return { x: center.x + offset.x, y: center.y + offset.y }
}

/**
 * Resizes `frame` by dragging `handle` a distance of (`dx`, `dy`) **slide
 * units** — not screen pixels. The caller divides the pointer delta by the
 * canvas scale; doing it here would make this function depend on the zoom.
 *
 * Three things happen, in order:
 *
 * 1. The drag is rotated *into the box's own frame*. A 45°-rotated element
 *    dragged rightwards must grow along its own width, not the screen's x axis
 *    — without this the box shears away from the pointer as soon as it is
 *    rotated.
 * 2. Width and height take the delta on the axes this handle owns, floored at
 *    the minimum grabbable size.
 * 3. The anchor — the opposite corner, or the midpoint of the opposite edge —
 *    is put back exactly where it was, and the frame's x/y follow from that.
 *
 * Step 3 is what the "resizing from the left moves the left edge and leaves the
 * right edge in place" rule reduces to, and it keeps holding when the size
 * clamps: the anchor is recomputed from the *clamped* size, so a handle dragged
 * past the minimum stops dead instead of dragging the whole element along with
 * it.
 */
export function resizeFrame(frame: Frame, handle: Handle, dx: number, dy: number): Frame {
  const local = rotateVec({ x: dx, y: dy }, -frame.rotation)
  const grow = GROW[handle]

  const w = Math.max(MIN_FRAME_W, frame.w + grow.x * local.x)
  const h = Math.max(MIN_FRAME_H, frame.h + grow.y * local.y)

  const held = anchorPoint(frame, handle, frame.w, frame.h)
  const sign = ANCHOR[handle]
  const offset = rotateVec({ x: (sign.x * w) / 2, y: (sign.y * h) / 2 }, frame.rotation)

  return normalize({
    x: held.x - offset.x - w / 2,
    y: held.y - offset.y - h / 2,
    w,
    h,
    rotation: frame.rotation,
  })
}

/**
 * The axis-aligned box a rotated frame actually occupies on screen.
 *
 * Alignment and the off-slide guard both work on what the user can see, which
 * for a rotated element is its bounding box and not its unrotated rectangle —
 * "align right" on a tilted title should put its rightmost corner on the
 * margin.
 */
export function rotatedBounds(frame: Frame): {
  left: number
  top: number
  right: number
  bottom: number
} {
  const center = frameCenter(frame)
  const corners = [
    { x: -1, y: -1 },
    { x: 1, y: -1 },
    { x: 1, y: 1 },
    { x: -1, y: 1 },
  ].map((sign) =>
    rotateVec({ x: (sign.x * frame.w) / 2, y: (sign.y * frame.h) / 2 }, frame.rotation),
  )
  const xs = corners.map((p) => center.x + p.x)
  const ys = corners.map((p) => center.y + p.y)
  return {
    left: Math.min(...xs),
    top: Math.min(...ys),
    right: Math.max(...xs),
    bottom: Math.max(...ys),
  }
}

/*
  Keeps a frame's centre inside the card.

  Deliberately weak: PowerPoint and Figma both let an element hang off the edge,
  and forbidding that would make it impossible to bleed one past the margin. All
  this rules out is dragging an element *entirely* off its card, where — the
  slide surface being `overflow-hidden` — there would be nothing left to click
  and no way to get it back.

  Move applies it; resize does not. Clamping a resize would move the anchor the
  user is holding fixed, which is worse than letting a big element overhang.
*/
export function clampFrame(frame: Frame, container: Container): Frame {
  const center = frameCenter(frame)
  const cx = Math.min(container.w, Math.max(0, center.x))
  const cy = Math.min(container.h, Math.max(0, center.y))
  return normalize({ ...frame, x: frame.x + (cx - center.x), y: frame.y + (cy - center.y) })
}

/** Moves `frame` by a pixel delta, keeping it reachable inside its card. */
export function moveFrame(frame: Frame, dx: number, dy: number, container: Container): Frame {
  return clampFrame({ ...frame, x: frame.x + dx, y: frame.y + dy }, container)
}

/**
 * Where each handle sits, as a fraction of the frame: (0,0) is its top-left
 * corner and (1,1) its bottom-right.
 *
 * Shared by the overlay that draws the handles and by the tests, so a handle
 * can't be drawn in one corner while its maths anchors another.
 */
export const HANDLE_POSITION: Record<Handle, Point> = {
  nw: { x: 0, y: 0 },
  n: { x: 0.5, y: 0 },
  ne: { x: 1, y: 0 },
  e: { x: 1, y: 0.5 },
  se: { x: 1, y: 1 },
  s: { x: 0.5, y: 1 },
  sw: { x: 0, y: 1 },
  w: { x: 0, y: 0.5 },
}

/** The CSS cursor for each handle, ignoring rotation. */
export const HANDLE_CURSOR: Record<Handle, string> = {
  nw: 'nwse-resize',
  n: 'ns-resize',
  ne: 'nesw-resize',
  e: 'ew-resize',
  se: 'nwse-resize',
  s: 'ns-resize',
  sw: 'nesw-resize',
  w: 'ew-resize',
}
