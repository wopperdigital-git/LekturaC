import { describe, expect, it } from 'vitest'
import {
  BULLET_INDENT_IN,
  DEFAULT_LINE_SPACING,
  FLOOR_PT,
  INSET_X_IN,
  INSET_Y_IN,
  SIZE_LADDER,
  TEXT_MARGIN_PT,
  WIDTH_HEADROOM,
  estimateMeasurer,
  fitText,
  preferredSize,
  spacingPt,
  textHeight,
  wrapLines,
  type FitSizing,
  type FontSpec,
  type TextMeasurer,
} from './textFit'

/*
  The fake measurer the design doc and task brief both specify: every
  character is exactly 0.1in at 10pt, scaling linearly with size. It never
  touches bold/italic, which is deliberate — that keeps the wrap/height tests
  focused on width and size rather than re-testing estimateMeasurer's own
  weighting.
*/
const fakeMeasure: TextMeasurer = (text, font) => text.length * 0.1 * (font.sizePt / 10)

function font(sizePt: number, bold = false): FontSpec {
  return { face: 'Test', sizePt, bold, italic: false }
}

describe('wrapLines', () => {
  it('fits on one line when the text is short enough', () => {
    expect(wrapLines('hello world', 2, font(10), fakeMeasure)).toEqual(['hello world'])
  })

  it('wraps at the word boundary', () => {
    // "aa"=0.22in, "aa bb"=0.55in, "aa bb cc"=0.88in headroom-adjusted widths;
    // a 0.6in line holds "aa bb" but not "aa bb cc".
    expect(wrapLines('aa bb cc', 0.6, font(10), fakeMeasure)).toEqual(['aa bb', 'cc'])
  })

  it('honours explicit line breaks', () => {
    expect(wrapLines('line one\nline two', 5, font(10), fakeMeasure)).toEqual([
      'line one',
      'line two',
    ])
  })

  it('breaks a word longer than the line by characters', () => {
    // At widthIn=0.35 with headroom, 3 characters (0.33in) fit and a 4th (0.44in) does not.
    expect(wrapLines('abcdefghij', 0.35, font(10), fakeMeasure)).toEqual([
      'abc',
      'def',
      'ghi',
      'j',
    ])
  })

  it('applies WIDTH_HEADROOM: a string exactly the line width without headroom still wraps', () => {
    // "aaaaa bbbbb" measures exactly 1.1in with no headroom; the 1.1x headroom
    // pushes it to 1.21in, over a 1.1in line, so it must still wrap.
    expect(wrapLines('aaaaa bbbbb', 1.1, font(10), fakeMeasure)).toEqual(['aaaaa', 'bbbbb'])
  })

  it('produces an empty string as one line for empty text', () => {
    expect(wrapLines('', 5, font(10), fakeMeasure)).toEqual([''])
  })
})

describe('textHeight', () => {
  it('computes one line at 18pt with spacing 1.2 from the documented formula', () => {
    const sizing: FitSizing = { preferredPt: 18, minPt: 12, face: 'Test' }
    const height = textHeight([{ text: 'hi' }], 5, sizing, 18, fakeMeasure)
    const expected = ((18 * DEFAULT_LINE_SPACING) / 72) * 1.1 + INSET_Y_IN
    expect(height).toBeCloseTo(expected, 6)
    expect(height).toBeCloseTo(0.48, 4)
  })

  it('returns INSET_Y_IN for an empty paragraph list', () => {
    const sizing: FitSizing = { preferredPt: 18, minPt: 12, face: 'Test' }
    expect(textHeight([], 5, sizing, 18, fakeMeasure)).toBe(INSET_Y_IN)
  })

  it('narrows the usable width with an indent, which can add lines and height', () => {
    const sizing: FitSizing = { preferredPt: 10, minPt: 10, face: 'Test' }
    // boxWidthIn(1.5) - INSET_X_IN(0.15) = 1.35in usable, comfortably fitting
    // "aaaaa bbbbb" (1.1in raw x 1.1 headroom = 1.21in) on one line.
    const flush = textHeight([{ text: 'aaaaa bbbbb' }], 1.5, sizing, 10, fakeMeasure)
    // The same box with a 0.4in indent narrows usable width to 0.95in, which
    // only fits one word per line, so the paragraph wraps to two lines.
    const indented = textHeight(
      [{ text: 'aaaaa bbbbb', indentIn: 0.4 }],
      1.5,
      sizing,
      10,
      fakeMeasure,
    )
    expect(indented).toBeGreaterThan(flush)
    expect(indented).toBeCloseTo(0.51667, 4)
    expect(flush).toBeCloseTo(0.33333, 4)
  })

  it("lets a paragraph's own bold override the sizing default for its measurement", () => {
    const sizing: FitSizing = { preferredPt: 10, minPt: 10, face: 'Test', bold: false }
    const regular = textHeight([{ text: 'aaaaa bbbbb' }], 1.41, sizing, 10, fakeMeasure)
    const bold = textHeight([{ text: 'aaaaa bbbbb', bold: true }], 1.41, sizing, 10, fakeMeasure)
    // The fake measurer ignores bold, so the heights are equal here; this
    // test exists to confirm the call does not throw and wires the field
    // through — genuine width difference is estimateMeasurer's job below.
    expect(bold).toBe(regular)
  })
})

describe('fitText', () => {
  const wideBox = { widthIn: 100, maxHeightIn: 100 }

  it('returns preferredPt when it already fits', () => {
    const sizing: FitSizing = { preferredPt: 18, minPt: 12, face: 'Test' }
    const result = fitText([{ text: 'hi' }], wideBox, sizing, fakeMeasure)
    expect(result.sizePt).toBe(18)
  })

  it('steps down to the first size that fits', () => {
    const sizing: FitSizing = { preferredPt: 30, minPt: 20, face: 'Test' }
    const result = fitText([{ text: 'hi' }], { widthIn: 100, maxHeightIn: 0.6 }, sizing, fakeMeasure)
    expect(result.sizePt).toBe(24)
    expect(result.heightIn).toBeCloseTo(0.59, 4)
  })

  it('goes below minPt when nothing fits at minPt', () => {
    const sizing: FitSizing = { preferredPt: 30, minPt: 25, face: 'Test' }
    const result = fitText([{ text: 'hi' }], { widthIn: 100, maxHeightIn: 0.48 }, sizing, fakeMeasure)
    expect(result.sizePt).toBe(17)
    expect(result.sizePt).toBeLessThan(sizing.minPt)
    expect(result.heightIn).toBeCloseTo(0.46167, 4)
  })

  it('never goes below FLOOR_PT, returning it with its real over-budget height', () => {
    const sizing: FitSizing = { preferredPt: 30, minPt: 20, face: 'Test' }
    const result = fitText([{ text: 'hi' }], { widthIn: 100, maxHeightIn: 0.1 }, sizing, fakeMeasure)
    expect(result.sizePt).toBe(FLOOR_PT)
    expect(result.heightIn).toBeGreaterThan(0.1)
    expect(result.heightIn).toBeCloseTo(0.33333, 4)
  })

  /*
    Review I2: the floor is `Math.min(FLOOR_PT, preferredPt)`, not `FLOOR_PT`
    alone — a caller asking for something smaller than `FLOOR_PT` (an
    adjusted-card box-proportional size, say 7pt) must never come back larger
    than what it asked for, whether or not the text fits.
  */
  it('never enlarges: a preferredPt below FLOOR_PT in a roomy box returns itself', () => {
    const sizing: FitSizing = { preferredPt: 7, minPt: 12, face: 'Test' }
    const result = fitText([{ text: 'hi' }], wideBox, sizing, fakeMeasure)
    expect(result.sizePt).toBe(7)
  })

  it('never enlarges: a preferredPt below FLOOR_PT in a too-small box still returns itself, with its real over-budget height', () => {
    const sizing: FitSizing = { preferredPt: 7, minPt: 12, face: 'Test' }
    const result = fitText([{ text: 'hi' }], { widthIn: 100, maxHeightIn: 0.01 }, sizing, fakeMeasure)
    expect(result.sizePt).toBe(7)
    expect(result.heightIn).toBeGreaterThan(0.01)
  })
})

describe('preferredSize', () => {
  it('caps a heading at its ladder cap', () => {
    expect(preferredSize('heading', 1.875, undefined)).toBe(30)
  })

  it('passes a body size through unchanged when inside its band', () => {
    // pointSize(0.7, undefined) = round(0.7 * 18) = 13, inside the [10, 14] band.
    expect(preferredSize('body', 0.7, undefined)).toBe(13)
  })

  it('raises a small scaled body size up to its ladder minimum', () => {
    expect(preferredSize('body', 1, 0.5)).toBe(10)
  })

  it('caps a title at its ladder cap', () => {
    expect(preferredSize('title', 2.5, 1)).toBe(30)
  })

  it('matches the documented ladder', () => {
    // Ruling 3 (2026-09-19 density brief): the title slide's heading is now
    // the same cap as `heading` — bold weight and `renderTitle`'s centred
    // group layout are what still distinguish it, not size.
    expect(SIZE_LADDER.title).toEqual({ cap: 30, min: 24 })
    expect(SIZE_LADDER.heading).toEqual({ cap: 30, min: 20 })
    expect(SIZE_LADDER.subheading).toEqual({ cap: 18, min: 14 })
    expect(SIZE_LADDER.body).toEqual({ cap: 14, min: 10 })
    expect(SIZE_LADDER.statSingle).toEqual({ cap: 54, min: 28 })
    expect(SIZE_LADDER.statGrid).toEqual({ cap: 40, min: 24 })
  })
})

describe('estimateMeasurer', () => {
  it('is deterministic', () => {
    const a = estimateMeasurer('hello world', font(18))
    const b = estimateMeasurer('hello world', font(18))
    expect(a).toBe(b)
  })

  it('measures bold text wider than regular text', () => {
    const regular = estimateMeasurer('hello', font(18, false))
    const bold = estimateMeasurer('hello', font(18, true))
    expect(bold).toBeGreaterThan(regular)
  })

  it('scales width linearly with size', () => {
    const at10 = estimateMeasurer('hello world', font(10))
    const at20 = estimateMeasurer('hello world', font(20))
    expect(at20).toBeCloseTo(at10 * 2, 10)
  })

  it('weighs uppercase letters and digits wider than lowercase', () => {
    const lower = estimateMeasurer('a', font(18))
    const upper = estimateMeasurer('A', font(18))
    const digit = estimateMeasurer('0', font(18))
    expect(upper).toBeGreaterThan(lower)
    expect(digit).toBeGreaterThan(lower)
  })
})

describe('insets', () => {
  it('is a scalar 5.4pt margin applied to all four sides', () => {
    expect(TEXT_MARGIN_PT).toBe(5.4)
  })

  it('derives INSET_X_IN and INSET_Y_IN from TEXT_MARGIN_PT (0.15in each, both axes equal for a scalar margin)', () => {
    expect(INSET_X_IN).toBeCloseTo(0.15, 6)
    expect(INSET_Y_IN).toBeCloseTo(0.15, 6)
  })
})

describe('constants', () => {
  it('matches the documented values', () => {
    expect(WIDTH_HEADROOM).toBe(1.1)
    expect(FLOOR_PT).toBe(10)
    expect(DEFAULT_LINE_SPACING).toBe(1.2)
  })
})

describe('spacingPt', () => {
  it('is sizePt times the spacing multiple, in points', () => {
    expect(spacingPt(20, 1.2)).toBe(24)
    expect(spacingPt(18, 1.55)).toBeCloseTo(27.9, 6)
  })
})

describe('BULLET_INDENT_IN', () => {
  it('matches pptxgenjs\'s DEF_BULLET_MARGIN of 27pt', () => {
    expect(BULLET_INDENT_IN).toBeCloseTo(27 / 72, 10)
    expect(BULLET_INDENT_IN).toBeCloseTo(0.375, 6)
  })
})
