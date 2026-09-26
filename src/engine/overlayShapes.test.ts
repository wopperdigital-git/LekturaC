import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SHAPE_SIZE,
  MIN_SHAPE_SIZE,
  SHAPE_KINDS,
  canAppendItem,
  eraseItems,
  inkHit,
  MAX_STROKES_PER_CARD,
  normalizeShapeRect,
  parseOverlay,
  replaceItem,
  shapePolygon,
  type Shape,
  type Stroke,
} from './overlay'

const shape = (id: string, extra: Partial<Shape> = {}): Shape => ({
  id,
  kind: 'shape',
  shape: 'rectangle',
  color: 'accent',
  width: 0.004,
  fill: false,
  x: 0.2,
  y: 0.2,
  w: 0.4,
  h: 0.2,
  ...extra,
})

const stroke = (id: string): Stroke => ({
  id,
  kind: 'stroke',
  tool: 'pen',
  color: 'accent',
  width: 0.007,
  points: [[0.1, 0.1], [0.2, 0.2]],
})

describe('the six shapes', () => {
  it('are rectangle, rounded rectangle, ellipse, triangle, diamond and arrow', () => {
    expect([...SHAPE_KINDS]).toEqual(['rectangle', 'rounded', 'ellipse', 'triangle', 'diamond', 'arrow'])
  })
})

describe('parseOverlay with shapes', () => {
  it('reads shapes and strokes together, in order, unchanged', () => {
    const items = [stroke('a'), shape('b', { shape: 'ellipse', fill: true }), shape('c', { color: '#ef4444' })]
    expect(parseOverlay(JSON.parse(JSON.stringify(items)))).toEqual(items)
  })

  it('accepts every shape kind', () => {
    const items = SHAPE_KINDS.map((kind, i) => shape(`s${i}`, { shape: kind }))
    expect(parseOverlay(items)).toHaveLength(SHAPE_KINDS.length)
  })

  it('drops a malformed shape and keeps the rest', () => {
    const good = shape('good')
    const parsed = parseOverlay([
      good,
      { ...shape('bad1'), shape: 'hexagon' },
      { ...shape('bad2'), w: 0 },
      { ...shape('bad3'), w: -1 },
      { ...shape('bad4'), h: Number.NaN },
      { ...shape('bad5'), color: 'purple' },
      { ...shape('bad6'), fill: 'yes' },
      { ...shape('bad7'), kind: 'blob' },
    ])
    expect(parsed).toEqual([good])
  })

  it('counts shapes and strokes together against the per-card limit', () => {
    const items = Array.from({ length: MAX_STROKES_PER_CARD + 3 }, (_, i) =>
      i % 2 ? shape(`s${i}`) : stroke(`s${i}`),
    )
    expect(parseOverlay(items)).toHaveLength(MAX_STROKES_PER_CARD)
    expect(canAppendItem(items.slice(0, MAX_STROKES_PER_CARD))).toBe(false)
    expect(canAppendItem(items.slice(0, MAX_STROKES_PER_CARD - 1))).toBe(true)
  })
})

describe('shapePolygon', () => {
  const box = { x: 0, y: 0, w: 1, h: 1 }

  it('is the four corners for a rectangle and a rounded rectangle', () => {
    for (const kind of ['rectangle', 'rounded'] as const) {
      expect(shapePolygon(shape('a', { ...box, shape: kind }))).toEqual([[0, 0], [1, 0], [1, 1], [0, 1]])
    }
  })

  it('is a triangle pointing up and a diamond touching the middle of each side', () => {
    expect(shapePolygon(shape('a', { ...box, shape: 'triangle' }))).toEqual([[0.5, 0], [1, 1], [0, 1]])
    expect(shapePolygon(shape('a', { ...box, shape: 'diamond' }))).toEqual([[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]])
  })

  it('is a right-pointing arrow whose tip is the middle of the right edge', () => {
    const arrow = shapePolygon(shape('a', { ...box, shape: 'arrow' }))
    expect(arrow).toContainEqual([1, 0.5])
    expect(arrow.every(([x, y]) => x >= 0 && x <= 1 && y >= 0 && y <= 1)).toBe(true)
  })

  it('samples an ellipse on its own outline', () => {
    const pts = shapePolygon(shape('a', { x: 0, y: 0, w: 2, h: 1, shape: 'ellipse' }))
    expect(pts.length).toBeGreaterThanOrEqual(16)
    for (const [x, y] of pts) expect(((x - 1) / 1) ** 2 + ((y - 0.5) / 0.5) ** 2).toBeCloseTo(1, 6)
  })

  it('scales into the shape’s own rectangle', () => {
    const pts = shapePolygon(shape('a', { x: 0.2, y: 0.3, w: 0.4, h: 0.2, shape: 'rectangle' }))
    expect(pts[0]).toEqual([0.2, 0.3])
    expect(pts[2][0]).toBeCloseTo(0.6, 10)
    expect(pts[2][1]).toBeCloseTo(0.5, 10)
  })
})

describe('inkHit with shapes', () => {
  // An outline-only shape is hit on its outline, so an empty rectangle never
  // swallows the eraser (or a press) meant for what is inside it.
  it('hits an outline-only shape on its edge but not in its empty middle', () => {
    const rect = shape('r', { x: 0.2, y: 0.2, w: 0.4, h: 0.2, fill: false })
    expect(inkHit([rect], [0.4, 0.2], 0.01)).toEqual(['r'])
    expect(inkHit([rect], [0.4, 0.3], 0.01)).toEqual([])
  })

  it('hits a filled shape anywhere inside it', () => {
    const rect = shape('r', { x: 0.2, y: 0.2, w: 0.4, h: 0.2, fill: true })
    expect(inkHit([rect], [0.4, 0.3], 0.001)).toEqual(['r'])
    expect(inkHit([rect], [0.9, 0.9], 0.001)).toEqual([])
  })

  it('respects the shape, not its bounding box (the corner of a triangle is empty)', () => {
    const tri = shape('t', { shape: 'triangle', x: 0, y: 0, w: 1, h: 1, fill: true })
    expect(inkHit([tri], [0.5, 0.6], 0.001)).toEqual(['t'])
    expect(inkHit([tri], [0.05, 0.1], 0.001)).toEqual([])
  })

  it('still hits strokes, and returns each hit id once, in order', () => {
    const items = [stroke('s'), shape('r', { x: 0, y: 0, w: 0.3, h: 0.3, fill: true })]
    expect(inkHit(items, [0.15, 0.15], 0.01)).toEqual(['s', 'r'])
  })
})

describe('eraseItems with shapes', () => {
  it('removes a shape like a stroke and keeps the rest', () => {
    const items = [stroke('a'), shape('b'), stroke('c')]
    expect(eraseItems(items, ['b'])?.map((i) => i.id)).toEqual(['a', 'c'])
  })
})

describe('normalizeShapeRect', () => {
  it('is the same box whichever corner the drag starts from', () => {
    const a = normalizeShapeRect([0.2, 0.2], [0.6, 0.5])
    expect([a.x, a.y, a.w, a.h].map((n) => Math.round(n * 1e6) / 1e6)).toEqual([0.2, 0.2, 0.4, 0.3])
    for (const [p, q] of [
      [[0.6, 0.5], [0.2, 0.2]],
      [[0.6, 0.2], [0.2, 0.5]],
      [[0.2, 0.5], [0.6, 0.2]],
    ] as [[number, number], [number, number]][]) {
      const b = normalizeShapeRect(p, q)
      expect(b.x).toBeCloseTo(a.x, 10)
      expect(b.y).toBeCloseTo(a.y, 10)
      expect(b.w).toBeCloseTo(a.w, 10)
      expect(b.h).toBeCloseTo(a.h, 10)
    }
  })

  it('drops a default-sized shape, centred on the point, for a click with no drag', () => {
    const r = normalizeShapeRect([0.5, 0.3], [0.5, 0.3])
    expect(r.w).toBe(DEFAULT_SHAPE_SIZE.w)
    expect(r.h).toBe(DEFAULT_SHAPE_SIZE.h)
    expect(r.x + r.w / 2).toBeCloseTo(0.5, 10)
    expect(r.y + r.h / 2).toBeCloseTo(0.3, 10)
  })

  it('never returns a shape smaller than the minimum in either direction', () => {
    const r = normalizeShapeRect([0.1, 0.1], [0.4, 0.105])
    expect(r.h).toBeGreaterThanOrEqual(MIN_SHAPE_SIZE)
    expect(r.w).toBeGreaterThanOrEqual(MIN_SHAPE_SIZE)
  })
})

describe('replaceItem', () => {
  it('swaps the item with the same id and leaves the others in place', () => {
    const items = [stroke('a'), shape('b'), stroke('c')]
    const moved = shape('b', { x: 0.5 })
    expect(replaceItem(items, moved)?.map((i) => i.id)).toEqual(['a', 'b', 'c'])
    expect(replaceItem(items, moved)?.[1]).toBe(moved)
    expect(items[1]).not.toBe(moved)
  })

  it('returns the same array when there is nothing to replace', () => {
    const items = [stroke('a')]
    expect(replaceItem(items, shape('zzz'))).toBe(items)
    expect(replaceItem(undefined, shape('zzz'))).toBeUndefined()
  })
})
