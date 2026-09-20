import { describe, expect, it } from 'vitest'
import {
  MAX_RUN_SCALE,
  MIN_RUN_SCALE,
  applyMark,
  applyValueMark,
  clampRunScale,
  markSchema,
  markValueAt,
  hasMarkThroughout,
  normalizeMarks,
  shiftMarks,
  textSegments,
  type Mark,
} from './marks'

const bold = (start: number, end: number): Mark => ({ type: 'bold', start, end })
const italic = (start: number, end: number): Mark => ({ type: 'italic', start, end })

describe('normalizeMarks', () => {
  it('merges overlapping and touching runs of the same type', () => {
    expect(normalizeMarks([bold(0, 3), bold(3, 7)])).toEqual([bold(0, 7)])
    expect(normalizeMarks([bold(0, 5), bold(2, 9)])).toEqual([bold(0, 9)])
  })

  it('keeps different types separate even when they overlap', () => {
    const out = normalizeMarks([bold(0, 5), italic(2, 8)])
    expect(out).toHaveLength(2)
    expect(out).toEqual(expect.arrayContaining([bold(0, 5), italic(2, 8)]))
  })

  it('drops empty and inverted ranges', () => {
    expect(normalizeMarks([bold(4, 4), bold(9, 2)])).toEqual([])
  })

  it('leaves a gap between runs that do not touch', () => {
    expect(normalizeMarks([bold(0, 3), bold(5, 8)])).toEqual([bold(0, 3), bold(5, 8)])
  })
})

describe('hasMarkThroughout', () => {
  it('is true only when every character in the range carries the mark', () => {
    expect(hasMarkThroughout([bold(0, 10)], { start: 2, end: 8 }, 'bold')).toBe(true)
    expect(hasMarkThroughout([bold(0, 5)], { start: 2, end: 8 }, 'bold')).toBe(false)
  })

  it('sees through fragmentation when the runs actually join up', () => {
    expect(hasMarkThroughout([bold(0, 4), bold(4, 9)], { start: 1, end: 8 }, 'bold')).toBe(true)
  })

  it('is false across a hole', () => {
    expect(hasMarkThroughout([bold(0, 3), bold(5, 9)], { start: 0, end: 9 }, 'bold')).toBe(false)
  })

  it('is false for an empty selection', () => {
    expect(hasMarkThroughout([bold(0, 10)], { start: 4, end: 4 }, 'bold')).toBe(false)
  })
})

describe('applyMark', () => {
  it('marks a plain range', () => {
    expect(applyMark([], { start: 2, end: 6 }, 'bold', true)).toEqual([bold(2, 6)])
  })

  it('clears only the selected part, keeping the rest', () => {
    // The classic failure: unbolding the middle of a bold run drops the whole run.
    expect(applyMark([bold(0, 10)], { start: 4, end: 6 }, 'bold', false)).toEqual([
      bold(0, 4),
      bold(6, 10),
    ])
  })

  it('extends rather than fragmenting when the range abuts an existing run', () => {
    expect(applyMark([bold(0, 4)], { start: 4, end: 9 }, 'bold', true)).toEqual([bold(0, 9)])
  })

  it('does not disturb marks of another type', () => {
    const out = applyMark([italic(0, 10)], { start: 2, end: 5 }, 'bold', true)
    expect(out).toEqual(expect.arrayContaining([italic(0, 10), bold(2, 5)]))
  })

  it('is a no-op for an empty selection', () => {
    expect(applyMark([bold(0, 5)], { start: 3, end: 3 }, 'bold', true)).toEqual([bold(0, 5)])
  })
})

describe('shiftMarks', () => {
  it('leaves marks before the edit alone', () => {
    expect(shiftMarks([bold(0, 4)], 6, 0, 3)).toEqual([bold(0, 4)])
  })

  it('shifts marks after an insertion', () => {
    expect(shiftMarks([bold(6, 9)], 2, 0, 3)).toEqual([bold(9, 12)])
  })

  it('shifts marks back after a deletion', () => {
    expect(shiftMarks([bold(6, 9)], 2, 3, 0)).toEqual([bold(3, 6)])
  })

  it('clips a mark that spans the removed text', () => {
    expect(shiftMarks([bold(2, 10)], 4, 3, 0)).toEqual([bold(2, 7)])
  })

  it('drops a mark whose text was entirely deleted', () => {
    expect(shiftMarks([bold(4, 7)], 3, 6, 0)).toEqual([])
  })

  it('leaves text typed at a mark boundary outside the mark', () => {
    // Typing after a bold word must not silently continue in bold.
    expect(shiftMarks([bold(0, 4)], 4, 0, 3)).toEqual([bold(0, 4)])
  })
})

describe('textSegments', () => {
  it('returns one plain segment when there are no marks', () => {
    expect(textSegments('hello', [])).toEqual([{ text: 'hello', bold: false, italic: false, underline: false }])
  })

  it('splits at mark boundaries', () => {
    expect(textSegments('abcdef', [bold(2, 4)])).toEqual([
      { text: 'ab', bold: false, italic: false, underline: false },
      { text: 'cd', bold: true, italic: false, underline: false },
      { text: 'ef', bold: false, italic: false, underline: false },
    ])
  })

  it('represents overlapping types in one segment', () => {
    expect(textSegments('abcd', [bold(0, 4), italic(2, 4)])).toEqual([
      { text: 'ab', bold: true, italic: false, underline: false },
      { text: 'cd', bold: true, italic: true, underline: false },
    ])
  })

  it('reassembles to exactly the original text', () => {
    const text = 'The quick brown fox'
    const marks = [bold(4, 9), italic(10, 15), bold(16, 19)]
    expect(textSegments(text, marks).map((s) => s.text).join('')).toBe(text)
  })

  it('survives marks left pointing past the end of shortened text', () => {
    // Guards the drift case: a stale mark must not throw or emit phantom text.
    expect(textSegments('abc', [bold(1, 99)]).map((s) => s.text).join('')).toBe('abc')
  })
})

describe('underline', () => {
  it('is a mark like bold and italic: it toggles over a range and can be cleared', () => {
    const on = applyMark([], { start: 0, end: 4 }, 'underline', true)
    expect(on).toEqual([{ type: 'underline', start: 0, end: 4 }])
    expect(hasMarkThroughout(on, { start: 0, end: 4 }, 'underline')).toBe(true)
    expect(applyMark(on, { start: 0, end: 4 }, 'underline', false)).toEqual([])
  })

  it('is independent of the other marks over the same characters', () => {
    const marks = applyMark(applyMark([], { start: 0, end: 4 }, 'bold', true), { start: 2, end: 6 }, 'underline', true)
    expect(hasMarkThroughout(marks, { start: 0, end: 4 }, 'underline')).toBe(false)
    expect(hasMarkThroughout(marks, { start: 2, end: 6 }, 'underline')).toBe(true)
    expect(hasMarkThroughout(marks, { start: 0, end: 4 }, 'bold')).toBe(true)
  })

  it('shows up in the segments a renderer draws, alongside the others', () => {
    const marks = [
      { type: 'bold' as const, start: 0, end: 4 },
      { type: 'underline' as const, start: 2, end: 6 },
    ]
    expect(textSegments('abcdef', marks)).toEqual([
      { text: 'ab', bold: true, italic: false, underline: false },
      { text: 'cd', bold: true, italic: false, underline: true },
      { text: 'ef', bold: false, italic: false, underline: true },
    ])
  })

  it('moves with the text like any other mark', () => {
    const shifted = shiftMarks([{ type: 'underline', start: 4, end: 8 }], 0, 0, 3)
    expect(shifted).toEqual([{ type: 'underline', start: 7, end: 11 }])
  })
})

describe('value marks', () => {
  const red = (start: number, end: number): Mark => ({ type: 'color', start, end, value: '#ef4444' })
  const blue = (start: number, end: number): Mark => ({ type: 'color', start, end, value: '#3b82f6' })

  describe('applyValueMark', () => {
    it('sets a value over a range', () => {
      expect(applyValueMark([], { start: 2, end: 5 }, 'color', '#ef4444')).toEqual([red(2, 5)])
    })

    it('replaces whatever value the range held rather than merging into it', () => {
      const marks = applyValueMark([blue(0, 8)], { start: 2, end: 5 }, 'color', '#ef4444')
      // The middle turns red; either side keeps its blue, clipped to the new edges.
      expect(marks).toEqual([blue(0, 2), red(2, 5), blue(5, 8)])
    })

    it('clears the value over a range with null, keeping what lies outside it', () => {
      expect(applyValueMark([red(0, 8)], { start: 2, end: 5 }, 'color', null)).toEqual([red(0, 2), red(5, 8)])
      expect(applyValueMark([red(2, 5)], { start: 0, end: 9 }, 'color', null)).toEqual([])
    })

    it('leaves the other types alone', () => {
      const marks = applyValueMark([bold(0, 4)], { start: 0, end: 4 }, 'color', '#ef4444')
      expect(marks).toContainEqual(bold(0, 4))
      expect(marks).toContainEqual(red(0, 4))
    })

    it('does nothing for an empty range', () => {
      expect(applyValueMark([red(0, 3)], { start: 4, end: 4 }, 'color', '#3b82f6')).toEqual([red(0, 3)])
    })
  })

  describe('normalizeMarks with values', () => {
    it('merges touching ranges of the same value', () => {
      expect(normalizeMarks([red(0, 3), red(3, 6)])).toEqual([red(0, 6)])
    })

    it('keeps touching ranges of different values apart — the value is part of the identity', () => {
      expect(normalizeMarks([red(0, 3), blue(3, 6)])).toEqual([red(0, 3), blue(3, 6)])
    })
  })

  describe('markValueAt', () => {
    it('reads the value at the selection’s first character', () => {
      expect(markValueAt([red(2, 6)], { start: 3, end: 8 }, 'color')).toBe('#ef4444')
    })

    it('is null where the first character has none, even if later ones do', () => {
      expect(markValueAt([red(5, 8)], { start: 2, end: 8 }, 'color')).toBeNull()
    })

    it('is null for a different type', () => {
      expect(markValueAt([red(0, 8)], { start: 1, end: 3 }, 'fontFamily')).toBeNull()
    })
  })

  describe('textSegments with values', () => {
    it('carries a value only on the segment it covers', () => {
      const marks: Mark[] = [
        { type: 'color', start: 2, end: 4, value: '#ef4444' },
        { type: 'fontScale', start: 2, end: 4, value: 1.5 },
        { type: 'fontFamily', start: 3, end: 6, value: 'Georgia' },
      ]
      const segments = textSegments('abcdef', marks)
      expect(segments[0]).toEqual({ text: 'ab', bold: false, italic: false, underline: false })
      expect(segments[1]).toMatchObject({ text: 'c', color: '#ef4444', fontScale: 1.5 })
      expect(segments[1].fontFamily).toBeUndefined()
      expect(segments[2]).toMatchObject({ text: 'd', color: '#ef4444', fontScale: 1.5, fontFamily: 'Georgia' })
      expect(segments[3]).toMatchObject({ text: 'ef', fontFamily: 'Georgia' })
      expect(segments[3].color).toBeUndefined()
    })

    it('lets a value mark and a flag mark share the same characters', () => {
      const marks: Mark[] = [bold(0, 3), { type: 'color', start: 0, end: 3, value: '#22c55e' }]
      expect(textSegments('abc', marks)).toEqual([
        { text: 'abc', bold: true, italic: false, underline: false, color: '#22c55e' },
      ])
    })
  })

  it('keeps its value when the text before it changes', () => {
    expect(shiftMarks([red(4, 8)], 0, 0, 3)).toEqual([red(7, 11)])
  })

  it('still parses a mark stored before value marks existed', () => {
    expect(markSchema.safeParse({ type: 'bold', start: 0, end: 3 }).success).toBe(true)
    expect(markSchema.safeParse({ type: 'color', start: 0, end: 3, value: '#ef4444' }).success).toBe(true)
  })

  it('holds a run’s size to its own, wider range', () => {
    expect(clampRunScale(9)).toBe(MAX_RUN_SCALE)
    expect(clampRunScale(0)).toBe(MIN_RUN_SCALE)
    expect(clampRunScale(1.2 + 0.1)).toBe(1.3)
  })
})
