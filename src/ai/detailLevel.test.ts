import { describe, expect, it } from 'vitest'
import { DENSITY, DETAILED_PAIRED_PARAGRAPH_WORDS, densitySection } from './detailLevel'

describe('DENSITY', () => {
  /*
    The prompt and the validator read the same table, but a level can still
    contradict itself: if its fullest list plus the paragraph it asks to pair
    with it passes maxVisibleWords, a model following the prompt is flagged
    BODY_TOO_DENSE and trimmed back by repair.
  */
  it("fits the detailed level's fullest list and its paired paragraph under its ceiling", () => {
    const d = DENSITY.detailed
    expect(d.bulletItems[1] * d.bulletWords + DETAILED_PAIRED_PARAGRAPH_WORDS).toBeLessThanOrEqual(d.maxVisibleWords)
  })

  it("fits every level's fullest list under its own ceiling", () => {
    for (const d of Object.values(DENSITY)) {
      expect(d.bulletItems[1] * d.bulletWords).toBeLessThanOrEqual(d.maxVisibleWords)
    }
  })

  it('keeps every floor below its target range', () => {
    for (const d of Object.values(DENSITY)) {
      if (d.minVisibleWords !== null) expect(d.minVisibleWords).toBeLessThan(d.visibleWords[0])
    }
  })

  it('does not push a detailed deck toward the most slides (Groq cannot afford it)', () => {
    expect(densitySection('detailed')).not.toMatch(/upper end/)
  })

  it('tells the model which slides may be short, as BODY_TOO_THIN allows', () => {
    expect(densitySection('detailed')).toMatch(/call to action or a story's insight or closing line may be shorter/)
  })
})
