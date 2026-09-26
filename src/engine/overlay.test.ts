import { describe, expect, it } from 'vitest'
import {
  MAX_POINTS_PER_STROKE,
  MAX_STROKES_PER_CARD,
  appendItem,
  brushWidth,
  canAppendItem,
  contentFraction,
  decimate,
  eraseItems,
  overlayChanged,
  parseOverlay,
  strokePath,
  inkHit,
  type Stroke,
} from './overlay'

const stroke = (id: string, points: [number, number][], extra: Partial<Stroke> = {}): Stroke => ({
  id,
  kind: 'stroke',
  tool: 'pen',
  color: 'accent',
  width: 0.007,
  points,
  ...extra,
})

describe('parseOverlay', () => {
  it('reads a stored overlay back unchanged', () => {
    const overlay = [stroke('a', [[0.1, 0.1], [0.2, 0.2]])]
    expect(parseOverlay(JSON.parse(JSON.stringify(overlay)))).toEqual(overlay)
  })

  // The column defaults to '[]', so every untouched card reads back as empty. Treating
  // that as "has ink" would make every old deck look drawn on.
  it('maps an empty or missing value to no overlay', () => {
    expect(parseOverlay([])).toBeUndefined()
    expect(parseOverlay(undefined)).toBeUndefined()
    expect(parseOverlay(null)).toBeUndefined()
    expect(parseOverlay({})).toBeUndefined()
  })

  it('drops a malformed stroke without losing the others on the card', () => {
    const good = stroke('good', [[0.1, 0.1]])
    const parsed = parseOverlay([good, { id: 'bad', kind: 'stroke' }, 'nonsense', null])
    expect(parsed).toEqual([good])
  })

  it('drops a stroke with a non-finite or empty point list', () => {
    expect(parseOverlay([stroke('a', [])])).toBeUndefined()
    expect(parseOverlay([{ ...stroke('a', [[0, 0]]), points: [[Number.NaN, 0]] }])).toBeUndefined()
    expect(parseOverlay([{ ...stroke('a', [[0, 0]]), color: 'not a colour' }])).toBeUndefined()
  })

  it('accepts theme colour names and #rrggbb', () => {
    const items = [
      stroke('a', [[0, 0]], { color: 'accent' }),
      stroke('b', [[0, 0]], { color: 'foreground' }),
      stroke('c', [[0, 0]], { color: '#ef4444' }),
    ]
    expect(parseOverlay(items)).toEqual(items)
  })

  it('caps an oversized stroke instead of trusting the row', () => {
    const many: [number, number][] = Array.from({ length: MAX_POINTS_PER_STROKE + 50 }, (_, i) => [i / 5000, 0.5])
    const parsed = parseOverlay([stroke('a', many)])
    expect((parsed?.[0] as Stroke | undefined)?.points).toHaveLength(MAX_POINTS_PER_STROKE)
  })

  it('caps the number of strokes on a card', () => {
    const items = Array.from({ length: MAX_STROKES_PER_CARD + 5 }, (_, i) => stroke(`s${i}`, [[0.1, 0.1]]))
    expect(parseOverlay(items)).toHaveLength(MAX_STROKES_PER_CARD)
  })
})

describe('decimate', () => {
  it('drops points closer than the minimum spacing but always keeps both ends', () => {
    const points: [number, number][] = [
      [0, 0],
      [0.0001, 0],
      [0.0002, 0],
      [0.5, 0],
      [0.5001, 0],
    ]
    const out = decimate(points)
    expect(out[0]).toEqual([0, 0])
    expect(out[out.length - 1]).toEqual([0.5001, 0])
    expect(out.length).toBeLessThan(points.length)
  })

  it('keeps a single point (a dot)', () => {
    expect(decimate([[0.3, 0.3]])).toEqual([[0.3, 0.3]])
  })

  it('rounds to four decimals so a deck row stays readable', () => {
    expect(decimate([[0.123456789, 0.987654321]])).toEqual([[0.1235, 0.9877]])
  })

  it('never returns more than the per-stroke cap', () => {
    const points: [number, number][] = Array.from({ length: MAX_POINTS_PER_STROKE * 3 }, (_, i) => [i * 0.01, 0])
    expect(decimate(points).length).toBeLessThanOrEqual(MAX_POINTS_PER_STROKE)
  })
})

describe('inkHit', () => {
  const line = stroke('line', [[0, 0], [1, 0]])

  // A long straight stroke has only two vertices; testing vertices alone would
  // miss the whole middle of it.
  it('hits along a segment, not just at its vertices', () => {
    expect(inkHit([line], [0.5, 0.01], 0.02)).toEqual(['line'])
  })

  it('misses when the pointer is outside the radius', () => {
    expect(inkHit([line], [0.5, 0.1], 0.02)).toEqual([])
  })

  it('hits a one-point stroke (a dot) within the radius', () => {
    const dot = stroke('dot', [[0.5, 0.5]])
    expect(inkHit([dot], [0.51, 0.5], 0.02)).toEqual(['dot'])
    expect(inkHit([dot], [0.6, 0.5], 0.02)).toEqual([])
  })

  it('does not hit beyond the ends of a segment', () => {
    expect(inkHit([line], [1.1, 0], 0.02)).toEqual([])
  })

  it("counts the stroke's own half-width, so a thick marker is easy to hit", () => {
    const thick = stroke('thick', [[0, 0], [1, 0]], { width: 0.1 })
    expect(inkHit([thick], [0.5, 0.04], 0.001)).toEqual(['thick'])
  })
})

describe('eraseItems', () => {
  const items = [stroke('a', [[0, 0]]), stroke('b', [[0.1, 0.1]]), stroke('c', [[0.2, 0.2]])]

  it('removes only the named strokes and keeps the rest in order', () => {
    expect(eraseItems(items, ['b'])?.map((s) => s.id)).toEqual(['a', 'c'])
  })

  it('returns undefined once nothing is left, so an empty overlay is never stored', () => {
    expect(eraseItems(items, ['a', 'b', 'c'])).toBeUndefined()
    expect(eraseItems(undefined, ['a'])).toBeUndefined()
  })

  it('returns the same array when nothing matched', () => {
    expect(eraseItems(items, ['zzz'])).toBe(items)
  })
})

describe('appendItem / canAppendItem', () => {
  it('appends without mutating the original', () => {
    const before = [stroke('a', [[0, 0]])]
    const after = appendItem(before, stroke('b', [[1, 1]]))
    expect(after.map((s) => s.id)).toEqual(['a', 'b'])
    expect(before).toHaveLength(1)
  })

  it('starts an overlay from nothing', () => {
    expect(appendItem(undefined, stroke('a', [[0, 0]]))).toHaveLength(1)
  })

  it('refuses a stroke past the per-card limit', () => {
    const full = Array.from({ length: MAX_STROKES_PER_CARD }, (_, i) => stroke(`s${i}`, [[0, 0]]))
    expect(canAppendItem(full)).toBe(false)
    expect(canAppendItem(full.slice(1))).toBe(true)
    expect(canAppendItem(undefined)).toBe(true)
  })
})

describe('strokePath', () => {
  it('draws a one-point stroke as a zero-length segment (a dot, with round caps)', () => {
    expect(strokePath(stroke('a', [[0.5, 0.25]]), 1000)).toBe('M500 250 L500 250')
  })

  it('scales fractions of the content width into pixels for x and y alike', () => {
    expect(strokePath(stroke('a', [[0.1, 0.2], [0.3, 0.4]]), 1000)).toBe('M100 200 L300 400')
  })
})

describe('brushWidth', () => {
  it('orders dot < small < big', () => {
    expect(brushWidth('pen', 'dot')).toBeLessThan(brushWidth('pen', 'small'))
    expect(brushWidth('pen', 'small')).toBeLessThan(brushWidth('pen', 'big'))
  })

  it('draws a marker wider than a pen of the same size', () => {
    expect(brushWidth('marker', 'small')).toBeGreaterThan(brushWidth('pen', 'small'))
  })
})

describe('overlayChanged', () => {
  const a = [stroke('a', [[0, 0]])]

  it('is false for the same overlay and for two empty ones', () => {
    expect(overlayChanged(a, a)).toBe(false)
    expect(overlayChanged(undefined, undefined)).toBe(false)
  })

  it('is true when ink was added, removed or replaced', () => {
    expect(overlayChanged(undefined, a)).toBe(true)
    expect(overlayChanged(a, undefined)).toBe(true)
    expect(overlayChanged(a, [stroke('b', [[0, 0]])])).toBe(true)
  })
})

describe('contentFraction', () => {
  it('turns a screen position into fractions of the content width, for x and y alike', () => {
    const rect = { left: 100, top: 50, width: 800 }
    expect(contentFraction({ x: 500, y: 250 }, rect)).toEqual([0.5, 0.25])
  })

  // The canvas zoom is a CSS transform: the rect and the pointer's distance from
  // its corner scale together, so the same spot on the card gives the same fraction.
  it('gives the same fraction at every zoom', () => {
    const at = (zoom: number) =>
      contentFraction({ x: 100 + 300 * zoom, y: 50 + 120 * zoom }, { left: 100, top: 50, width: 800 * zoom })
    for (const zoom of [0.5, 0.9, 1, 1.5, 2]) {
      const [x, y] = at(zoom)
      expect(x).toBeCloseTo(300 / 800, 10)
      expect(y).toBeCloseTo(120 / 800, 10)
    }
  })

  it('goes negative or past 1 over the card padding, where ink may start', () => {
    const [x, y] = contentFraction({ x: 80, y: 30 }, { left: 100, top: 50, width: 800 })
    expect(x).toBeLessThan(0)
    expect(y).toBeLessThan(0)
  })
})
