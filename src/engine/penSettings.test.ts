import { describe, expect, it } from 'vitest'
import { ERASER_RADIUS, INK_COLORS, DEFAULT_PEN_SETTINGS, eraserRadius, isFixedInkColor } from './penSettings'
import { parseOverlay } from './overlay'

describe('pen settings', () => {
  it('starts as a small pen, in the theme accent, writing onto the slide', () => {
    expect(DEFAULT_PEN_SETTINGS).toEqual({ tool: 'pen', size: 'small', color: 'accent', keep: 'slide' })
  })

  it('offers the theme colours first, then fixed ones', () => {
    expect(INK_COLORS.slice(0, 2).map((c) => c.value)).toEqual(['accent', 'foreground'])
    expect(INK_COLORS.length).toBeGreaterThan(2)
  })

  // A colour the picker offers must be one a stored stroke is allowed to carry,
  // or the stroke would be dropped when the deck is read back.
  it('offers only colours the stored format accepts', () => {
    for (const { value } of INK_COLORS) {
      const parsed = parseOverlay([
        { id: 'a', kind: 'stroke', tool: 'pen', color: value, width: 0.007, points: [[0, 0]] },
      ])
      expect(parsed, value).toHaveLength(1)
    }
  })

  it('grows the eraser with the chosen size', () => {
    expect(eraserRadius('dot')).toBeLessThan(eraserRadius('small'))
    expect(eraserRadius('small')).toBeLessThan(eraserRadius('big'))
    expect(ERASER_RADIUS.dot).toBeGreaterThan(0)
  })

  it('tells a fixed colour from a theme one', () => {
    expect(isFixedInkColor('#ef4444')).toBe(true)
    expect(isFixedInkColor('accent')).toBe(false)
  })
})
