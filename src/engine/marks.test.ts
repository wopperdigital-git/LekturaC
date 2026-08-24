import { describe, expect, it } from 'vitest'
import {
  applyMark,
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
    expect(textSegments('hello', [])).toEqual([{ text: 'hello', bold: false, italic: false }])
  })

  it('splits at mark boundaries', () => {
    expect(textSegments('abcdef', [bold(2, 4)])).toEqual([
      { text: 'ab', bold: false, italic: false },
      { text: 'cd', bold: true, italic: false },
      { text: 'ef', bold: false, italic: false },
    ])
  })

  it('represents overlapping types in one segment', () => {
    expect(textSegments('abcd', [bold(0, 4), italic(2, 4)])).toEqual([
      { text: 'ab', bold: true, italic: false },
      { text: 'cd', bold: true, italic: true },
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
