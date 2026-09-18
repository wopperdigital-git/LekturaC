import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SLIDE_COUNT,
  MAX_SLIDES,
  parseSlideCount,
  slideCountProblem,
} from './slideCount'

describe('bounds', () => {
  it('defaults inside the range it allows', () => {
    // The default is what an untouched field submits, so it has to be a value
    // the field would accept — otherwise the flow opens on an invalid answer.
    expect(slideCountProblem(String(DEFAULT_SLIDE_COUNT))).toBeNull()
    expect(DEFAULT_SLIDE_COUNT).toBeLessThanOrEqual(MAX_SLIDES)
  })
})

describe('slideCountProblem', () => {
  it('accepts the whole permitted range', () => {
    for (let n = 1; n <= MAX_SLIDES; n++) {
      expect(slideCountProblem(String(n))).toBeNull()
    }
  })

  it('refuses more than the ceiling', () => {
    expect(slideCountProblem(String(MAX_SLIDES + 1))).toMatch(/10/)
    expect(slideCountProblem('30')).not.toBeNull()
  })

  it('refuses zero and negatives', () => {
    expect(slideCountProblem('0')).not.toBeNull()
    expect(slideCountProblem('-3')).not.toBeNull()
  })

  it('refuses what is not a whole number', () => {
    expect(slideCountProblem('')).not.toBeNull()
    expect(slideCountProblem('   ')).not.toBeNull()
    expect(slideCountProblem('abc')).not.toBeNull()
    expect(slideCountProblem('5.5')).not.toBeNull()
    // `parseInt` stops at the first non-digit, so these must not read as 5
    expect(slideCountProblem('5x')).not.toBeNull()
    expect(slideCountProblem('5 slides')).not.toBeNull()
  })

  it('tolerates surrounding whitespace on an otherwise good number', () => {
    expect(slideCountProblem(' 7 ')).toBeNull()
  })
})

describe('parseSlideCount', () => {
  it('returns the number when the field is usable', () => {
    expect(parseSlideCount('7')).toBe(7)
    expect(parseSlideCount(' 7 ')).toBe(7)
  })

  it('returns null for anything slideCountProblem rejects', () => {
    for (const raw of ['', 'abc', '0', '5.5', '5x', String(MAX_SLIDES + 1)]) {
      expect(parseSlideCount(raw)).toBeNull()
    }
  })
})
