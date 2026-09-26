import { z } from 'zod'

/*
  The drawing layer: ink laid over a slide.

  This is the one free-positioned thing in the app. Text keeps flowing under the
  layout engine; ink sits above it, where the pointer put it. It lives on
  `card.overlay`, separate from `blocks`, so nothing that reads a block's index
  (`textRef`, `adjusts`, `inline`) can ever see it.

  Coordinates are fractions of the card's content width — for x *and* y, the same
  unit as `card.adjusts` — so a drawing scales with the card at every width and
  zoom. A card's height is content-driven, so ink keeps its distance from the top
  edge if an edit changes the height.

  Pure and DOM-free so the rules (bounds, hit-testing, what an eraser removes)
  are testable without a browser.
*/

/** Bounds, so one card's row stays small whatever a user scribbles. */
export const MAX_STROKES_PER_CARD = 300
export const MAX_POINTS_PER_STROKE = 1500

/** Capture keeps a point only if it is at least this far (a fraction of width) from the last kept one. */
const MIN_POINT_SPACING = 0.004

export type PenTool = 'pen' | 'marker'
export type BrushSize = 'dot' | 'small' | 'big'

/** Line width by size, as a fraction of the content width (about 3 / 6 / 14 px at a normal width). */
export const BRUSH_WIDTHS: Record<BrushSize, number> = { dot: 0.003, small: 0.007, big: 0.016 }

/** A marker is a wider, see-through pen. */
export const MARKER_WIDTH_FACTOR = 2.5
export const MARKER_OPACITY = 0.4

export function brushWidth(tool: PenTool, size: BrushSize): number {
  return BRUSH_WIDTHS[size] * (tool === 'marker' ? MARKER_WIDTH_FACTOR : 1)
}

/** 'accent' and 'foreground' follow the deck's theme; anything else is a fixed `#rrggbb`. */
const colorSchema = z.string().regex(/^(accent|foreground|#[0-9a-fA-F]{6})$/)

const finite = z.number().refine(Number.isFinite)

const strokeSchema = z.object({
  id: z.string().min(1),
  kind: z.literal('stroke'),
  tool: z.enum(['pen', 'marker']),
  color: colorSchema,
  width: finite.refine((n) => n > 0 && n <= 0.2),
  points: z
    .array(z.tuple([finite, finite]))
    .min(1)
    // A hand-edited or corrupt row must not be trusted to be small.
    .transform((points) => points.slice(0, MAX_POINTS_PER_STROKE)),
})

export type Stroke = z.infer<typeof strokeSchema>

/** The six basic shapes, in the order the popover shows them. */
export const SHAPE_KINDS = ['rectangle', 'rounded', 'ellipse', 'triangle', 'diamond', 'arrow'] as const
export type ShapeKind = (typeof SHAPE_KINDS)[number]

/** Outline width of a new shape, as a fraction of the content width (about 4 px at a normal width). */
export const SHAPE_OUTLINE_WIDTH = 0.004
/** A filled shape draws its colour at this opacity inside the outline, so text underneath stays readable. */
export const SHAPE_FILL_OPACITY = 0.35

const shapeSchema = z.object({
  id: z.string().min(1),
  kind: z.literal('shape'),
  shape: z.enum(SHAPE_KINDS),
  color: colorSchema,
  width: finite.refine((n) => n > 0 && n <= 0.05),
  fill: z.boolean(),
  // Position is in the same fractions as strokes and may run a little past the
  // card (ink over the padding); size must be positive and sane.
  x: finite.refine((n) => Math.abs(n) <= 10),
  y: finite.refine((n) => Math.abs(n) <= 10),
  w: finite.refine((n) => n > 0 && n <= 3),
  h: finite.refine((n) => n > 0 && n <= 3),
})

export type Shape = z.infer<typeof shapeSchema>

/** Everything the overlay can hold: hand-drawn strokes and placed shapes. */
export type OverlayItem = Stroke | Shape

const itemSchema = z.discriminatedUnion('kind', [strokeSchema, shapeSchema])

export const overlaySchema = z.array(itemSchema)

/**
 * Parses a `cards.overlay` value from Supabase.
 *
 * Tolerant per *item*, the same way `parseAdjusts` is per entry: one malformed
 * stroke or shape is dropped rather than costing the card its other ink. The column
 * defaults to `[]`, so an empty list (and a missing column) reads back as `undefined`:
 * "has the column" is not "was drawn on", or every old deck would look inked.
 */
export function parseOverlay(raw: unknown): OverlayItem[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const out: OverlayItem[] = []
  for (const item of raw) {
    if (out.length >= MAX_STROKES_PER_CARD) break
    const parsed = itemSchema.safeParse(item)
    if (parsed.success) out.push(parsed.data)
  }
  return out.length > 0 ? out : undefined
}

const round4 = (n: number) => Math.round(n * 1e4) / 1e4

/**
 * Thins a captured pointer path: drops points that are too close to the last one
 * kept, always keeps both ends (so a stroke ends where the pen came up), rounds
 * to four decimals, and never returns more than `MAX_POINTS_PER_STROKE`.
 */
export function decimate(points: readonly [number, number][]): [number, number][] {
  if (points.length === 0) return []
  const kept: [number, number][] = [points[0]]
  for (let i = 1; i < points.length - 1; i++) {
    const last = kept[kept.length - 1]
    if (Math.hypot(points[i][0] - last[0], points[i][1] - last[1]) >= MIN_POINT_SPACING) kept.push(points[i])
  }
  if (points.length > 1) kept.push(points[points.length - 1])

  let out = kept
  if (out.length > MAX_POINTS_PER_STROKE) {
    // Evenly subsampled, ends kept.
    const step = (out.length - 1) / (MAX_POINTS_PER_STROKE - 1)
    out = Array.from({ length: MAX_POINTS_PER_STROKE }, (_, i) => kept[Math.round(i * step)])
  }
  return out.map(([x, y]) => [round4(x), round4(y)] as [number, number])
}

/** Distance from `p` to the segment `a`–`b` (or to `a` when they coincide). */
function distanceToSegment(p: [number, number], a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const lengthSq = dx * dx + dy * dy
  if (lengthSq === 0) return Math.hypot(p[0] - a[0], p[1] - a[1])
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lengthSq))
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))
}

/** Whether `p` is inside the closed polygon (even-odd rule). */
function insidePolygon(p: [number, number], polygon: readonly [number, number][]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]
    const [xj, yj] = polygon[j]
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/**
 * A shape as a closed polygon, in the same fractions as the shape itself: the
 * outline used for hit-testing (rendering uses the native SVG primitives). A
 * rounded rectangle is tested as a plain one; an ellipse is sampled.
 */
export function shapePolygon(shape: Shape): [number, number][] {
  const at = (u: number, v: number): [number, number] => [shape.x + u * shape.w, shape.y + v * shape.h]
  switch (shape.shape) {
    case 'rectangle':
    case 'rounded':
      return [at(0, 0), at(1, 0), at(1, 1), at(0, 1)]
    case 'triangle':
      return [at(0.5, 0), at(1, 1), at(0, 1)]
    case 'diamond':
      return [at(0.5, 0), at(1, 0.5), at(0.5, 1), at(0, 0.5)]
    case 'arrow':
      return [at(0, 0.3), at(0.6, 0.3), at(0.6, 0), at(1, 0.5), at(0.6, 1), at(0.6, 0.7), at(0, 0.7)]
    case 'ellipse':
      return Array.from({ length: 32 }, (_, i) => {
        const angle = (i / 32) * Math.PI * 2
        return at(0.5 + 0.5 * Math.cos(angle), 0.5 + 0.5 * Math.sin(angle))
      })
  }
}

/** Distance from `p` to the nearest edge of a closed polygon. */
function distanceToPolygonEdge(p: [number, number], polygon: readonly [number, number][]): number {
  let best = Infinity
  for (let i = 0; i < polygon.length; i++) {
    best = Math.min(best, distanceToSegment(p, polygon[i], polygon[(i + 1) % polygon.length]))
  }
  return best
}

/**
 * The ids of the items within `radius` of `point`, in overlay order.
 *
 * A stroke is measured to its *segments* (a long straight stroke has two
 * vertices; testing only those would miss its whole middle) and allows for its
 * own half-width, so a fat marker line is as easy to hit as it looks. A shape is
 * hit on its outline, and anywhere inside it when it is filled — so an empty
 * rectangle never swallows the eraser (or a press) meant for what is inside it.
 */
export function inkHit(
  overlay: readonly OverlayItem[] | undefined,
  point: [number, number],
  radius: number,
): string[] {
  if (!overlay) return []
  const hit: string[] = []
  for (const item of overlay) {
    const reach = radius + item.width / 2
    let near = false
    if (item.kind === 'shape') {
      const polygon = shapePolygon(item)
      near = (item.fill && insidePolygon(point, polygon)) || distanceToPolygonEdge(point, polygon) <= reach
    } else {
      const pts = item.points
      near = pts.length === 1 && Math.hypot(point[0] - pts[0][0], point[1] - pts[0][1]) <= reach
      for (let i = 1; i < pts.length && !near; i++) {
        near = distanceToSegment(point, pts[i - 1], pts[i]) <= reach
      }
    }
    if (near) hit.push(item.id)
  }
  return hit
}

/**
 * The overlay without the named items. `undefined` once nothing is left (an
 * empty overlay is never stored), and the *same array* when nothing matched, so
 * callers can tell nothing happened.
 */
export function eraseItems(
  overlay: OverlayItem[] | undefined,
  ids: readonly string[],
): OverlayItem[] | undefined {
  if (!overlay) return undefined
  const gone = new Set(ids)
  const next = overlay.filter((item) => !gone.has(item.id))
  if (next.length === overlay.length) return overlay
  return next.length > 0 ? next : undefined
}

/** The overlay with the item of the same id swapped for `item`; the same array when there is no such item. */
export function replaceItem(
  overlay: OverlayItem[] | undefined,
  item: OverlayItem,
): OverlayItem[] | undefined {
  if (!overlay || !overlay.some((existing) => existing.id === item.id)) return overlay
  return overlay.map((existing) => (existing.id === item.id ? item : existing))
}

export function canAppendItem(overlay: readonly OverlayItem[] | undefined): boolean {
  return (overlay?.length ?? 0) < MAX_STROKES_PER_CARD
}

export function appendItem(overlay: readonly OverlayItem[] | undefined, item: OverlayItem): OverlayItem[] {
  return [...(overlay ?? []), item]
}

/**
 * A screen position as fractions of the content width, given the content box's
 * on-screen rect. Both axes divide by the *width*, the unit ink is stored in.
 * Zoom is a CSS transform, which scales the rect and the pointer's distance from
 * its corner together, so this needs no zoom value and is the same at every zoom.
 */
export function contentFraction(
  client: { x: number; y: number },
  rect: { left: number; top: number; width: number },
): [number, number] {
  return [(client.x - rect.left) / rect.width, (client.y - rect.top) / rect.width]
}

/** The smallest a drawn shape can be, and what a plain click (no drag) drops, as fractions of the content width. */
export const MIN_SHAPE_SIZE = 0.02
export const DEFAULT_SHAPE_SIZE = { w: 0.2, h: 0.12 }
/** A drag shorter than this on both axes is a click. */
const CLICK_DRAG = 0.01

/**
 * The box a rubber-band drag from `a` to `b` describes, whichever corner it
 * started from. A click (no real drag) gives a default-sized box centred on the
 * point; otherwise each side is held to the minimum size.
 */
export function normalizeShapeRect(
  a: [number, number],
  b: [number, number],
): { x: number; y: number; w: number; h: number } {
  const dx = Math.abs(b[0] - a[0])
  const dy = Math.abs(b[1] - a[1])
  if (dx < CLICK_DRAG && dy < CLICK_DRAG) {
    return {
      x: a[0] - DEFAULT_SHAPE_SIZE.w / 2,
      y: a[1] - DEFAULT_SHAPE_SIZE.h / 2,
      w: DEFAULT_SHAPE_SIZE.w,
      h: DEFAULT_SHAPE_SIZE.h,
    }
  }
  return {
    x: Math.min(a[0], b[0]),
    y: Math.min(a[1], b[1]),
    w: Math.max(dx, MIN_SHAPE_SIZE),
    h: Math.max(dy, MIN_SHAPE_SIZE),
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * SVG path data for a stroke, in pixels, for a content box `width` wide. A
 * one-point stroke is a zero-length segment, which the round line cap draws as a dot.
 */
export function strokePath(stroke: Stroke, width: number): string {
  const at = ([x, y]: [number, number]) => `${round2(x * width)} ${round2(y * width)}`
  if (stroke.points.length === 1) return `M${at(stroke.points[0])} L${at(stroke.points[0])}`
  return stroke.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${at(p)}`).join(' ')
}

/** The CSS colour for a stroke's stored colour. */
export function inkColor(color: string): string {
  if (color === 'accent') return 'var(--slide-accent)'
  if (color === 'foreground') return 'var(--slide-foreground)'
  return color
}

/** Whether two overlays differ, by their items' identity (undo restores the same objects). */
export function overlayChanged(
  a: readonly OverlayItem[] | undefined,
  b: readonly OverlayItem[] | undefined,
): boolean {
  if (a === b) return false
  const left = a ?? []
  const right = b ?? []
  if (left.length !== right.length) return true
  return left.some((item, i) => item !== right[i])
}
