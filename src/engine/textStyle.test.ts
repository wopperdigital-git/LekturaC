import { describe, expect, it } from 'vitest'
import {
  COLOR_CHOICES,
  EMPTY_TEXT_STYLE,
  HEX_COLOR,
  clampFontScale,
  mergeTextStyle,
  parseTextStyle,
  MAX_FONT_SCALE,
  MIN_FONT_SCALE,
} from './textStyle'

describe('mergeTextStyle', () => {
  it('merges per field rather than replacing wholesale', () => {
    // The bug this guards: a card that sets only `align` must keep inheriting
    // the deck's font and bold. A `card ?? deck` would drop both.
    const merged = mergeTextStyle({ fontFamily: 'Georgia', bold: true }, { align: 'center' })
    expect(merged).toEqual({ fontFamily: 'Georgia', bold: true, align: 'center' })
  })

  it('lets the card override a field the deck also set', () => {
    const merged = mergeTextStyle({ fontFamily: 'Georgia' }, { fontFamily: 'Verdana' })
    expect(merged.fontFamily).toBe('Verdana')
  })

  it('treats a missing card style as no override', () => {
    expect(mergeTextStyle({ bold: true }, undefined)).toEqual({ bold: true })
  })

  it('does not mutate either input', () => {
    const deck = { bold: true }
    const card = { italic: true }
    mergeTextStyle(deck, card)
    expect(deck).toEqual({ bold: true })
    expect(card).toEqual({ italic: true })
  })
})

describe('parseTextStyle', () => {
  it('reads a well-formed value', () => {
    expect(parseTextStyle({ bold: true, align: 'right' })).toEqual({ bold: true, align: 'right' })
  })

  it('falls back to empty rather than throwing on junk', () => {
    // Rows predate the column and can be hand-edited in the dashboard; a bad
    // value must not take the whole deck-load down with it.
    expect(parseTextStyle({ align: 'sideways' })).toEqual(EMPTY_TEXT_STYLE)
    expect(parseTextStyle('nonsense')).toEqual(EMPTY_TEXT_STYLE)
    expect(parseTextStyle(null)).toEqual(EMPTY_TEXT_STYLE)
    expect(parseTextStyle(undefined)).toEqual(EMPTY_TEXT_STYLE)
  })

  it('rejects a scale outside the toolbar range', () => {
    expect(parseTextStyle({ fontScale: 12 })).toEqual(EMPTY_TEXT_STYLE)
  })
})

describe('clampFontScale', () => {
  it('clamps to both ends of the range', () => {
    expect(clampFontScale(9)).toBe(MAX_FONT_SCALE)
    expect(clampFontScale(0.1)).toBe(MIN_FONT_SCALE)
  })

  it('rounds off the float drift that repeated stepping accumulates', () => {
    // 0.1 steps in binary floating point give 1.0000000000000002 and friends,
    // which would then fail the schema's range check on the way to the database.
    expect(clampFontScale(0.7 + 0.1 + 0.1)).toBe(0.9)
    expect(clampFontScale(1.1 + 0.1)).toBe(1.2)
  })
})

describe('colour and underline', () => {
  it('accepts a six-digit hex colour and underline', () => {
    expect(parseTextStyle({ color: '#3b82f6', underline: true })).toEqual({ color: '#3b82f6', underline: true })
  })

  it('drops a style whose colour is not a six-digit hex, rather than storing something a renderer would misread', () => {
    for (const color of ['blue', '#fff', 'rgb(0,0,0)', '3b82f6', '#3b82f6ff', '']) {
      expect(parseTextStyle({ color })).toEqual({})
    }
  })

  it('lets a card override just the colour while inheriting the rest', () => {
    expect(mergeTextStyle({ fontFamily: 'Georgia', color: '#111827' }, { color: '#ef4444' })).toEqual({
      fontFamily: 'Georgia',
      color: '#ef4444',
    })
  })

  it('offers only swatches the schema itself would accept', () => {
    for (const { value } of COLOR_CHOICES) expect(HEX_COLOR.test(value)).toBe(true)
  })
})
