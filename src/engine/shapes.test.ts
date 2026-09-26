import { describe, expect, it } from 'vitest'
import { SHAPE_KINDS, SHAPE_OUTLINE_WIDTH, parseOverlay } from './overlay'
import { DEFAULT_SHAPE_SETTINGS, SHAPE_LABELS, newShape, shapeFrame, shapeWithFrame } from './shapes'

describe('shape settings', () => {
  it('starts as an outline rectangle', () => {
    expect(DEFAULT_SHAPE_SETTINGS).toEqual({ shape: 'rectangle', fill: false })
  })

  it('names all six shapes', () => {
    for (const kind of SHAPE_KINDS) expect(SHAPE_LABELS[kind]).toBeTruthy()
    expect(Object.keys(SHAPE_LABELS)).toHaveLength(6)
  })
})

describe('newShape', () => {
  const rect = { x: 0.1, y: 0.2, w: 0.3, h: 0.15 }

  it('takes its kind and fill from the settings and its colour from the ink', () => {
    const shape = newShape('id-1', { shape: 'diamond', fill: true }, '#ef4444', rect)
    expect(shape).toMatchObject({ id: 'id-1', kind: 'shape', shape: 'diamond', fill: true, color: '#ef4444', ...rect })
    expect(shape.width).toBe(SHAPE_OUTLINE_WIDTH)
  })

  // What is drawn has to survive being stored and read back, or it would vanish on reload.
  it('produces a shape the stored format accepts, for every kind and colour', () => {
    for (const kind of SHAPE_KINDS) {
      for (const color of ['accent', 'foreground', '#22c55e']) {
        const shape = newShape('a', { shape: kind, fill: false }, color, rect)
        expect(parseOverlay([shape]), `${kind} ${color}`).toEqual([shape])
      }
    }
  })
})

describe('shapeFrame / shapeWithFrame', () => {
  const shape = newShape('a', DEFAULT_SHAPE_SETTINGS, 'accent', { x: 0.1, y: 0.2, w: 0.3, h: 0.15 })

  it('turns fractions of the content width into a pixel frame, y in the same unit as x', () => {
    expect(shapeFrame(shape, 1000)).toEqual({ x: 100, y: 200, w: 300, h: 150, rotation: 0 })
  })

  it('round-trips a frame through fractions without drift', () => {
    const frame = shapeFrame(shape, 900)
    const back = shapeWithFrame(shape, frame, 900)
    expect(back.x).toBeCloseTo(shape.x, 4)
    expect(back.y).toBeCloseTo(shape.y, 4)
    expect(back.w).toBeCloseTo(shape.w, 4)
    expect(back.h).toBeCloseTo(shape.h, 4)
  })

  it('stores the same fractions whatever width the frame was measured at', () => {
    const moved = { x: 250, y: 100, w: 400, h: 200, rotation: 0 }
    const at1000 = shapeWithFrame(shape, moved, 1000)
    const at500 = shapeWithFrame(shape, { x: 125, y: 50, w: 200, h: 100, rotation: 0 }, 500)
    expect(at500).toEqual(at1000)
  })

  it('keeps everything about the shape but its rectangle', () => {
    const filled = { ...shape, fill: true, shape: 'arrow' as const, color: '#ef4444' }
    const next = shapeWithFrame(filled, { x: 50, y: 50, w: 100, h: 100, rotation: 0 }, 1000)
    expect(next).toMatchObject({ id: 'a', kind: 'shape', shape: 'arrow', fill: true, color: '#ef4444' })
  })

  it('rounds to five decimals so a deck row stays readable', () => {
    const next = shapeWithFrame(shape, { x: 1 / 3, y: 2 / 3, w: 100, h: 100, rotation: 0 }, 1000)
    expect(String(next.x).length).toBeLessThanOrEqual(9)
  })

  it('ignores rotation: shapes do not rotate in this version', () => {
    const next = shapeWithFrame(shape, { x: 100, y: 200, w: 300, h: 150, rotation: 45 }, 1000)
    expect(next).toEqual(shapeWithFrame(shape, { x: 100, y: 200, w: 300, h: 150, rotation: 0 }, 1000))
  })
})
