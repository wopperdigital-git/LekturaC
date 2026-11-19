import { describe, expect, it } from 'vitest'
import {
  CODE_MAX_LINE_CHARS,
  CODE_MAX_LINES,
  DENSITY,
  DETAILED_PAIRED_PARAGRAPH_WORDS,
  MAX_POINT_RUN,
  densitySection,
} from './detailLevel'

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

describe('point runs', () => {
  /*
    A point's label and meaning are counted together (visibleLines), so one
    point costs what one bullet costs, and a full run must fit the level's
    ceiling the way a full list does (the detailed level with its paired
    paragraph), or the prompt asks for a slide repair would trim.
  */
  it("fits every level's fullest point run under its ceiling", () => {
    for (const [level, d] of Object.entries(DENSITY)) {
      const paired = level === 'detailed' ? DETAILED_PAIRED_PARAGRAPH_WORDS : 0
      expect(Math.min(d.bulletItems[1], MAX_POINT_RUN) * d.bulletWords + paired).toBeLessThanOrEqual(d.maxVisibleWords)
    }
  })
})

describe('densitySection structured block sizes', () => {
  for (const level of ['simplified', 'balanced', 'detailed'] as const) {
    it(`gives the ${level} level its point, callout and code numbers from the table`, () => {
      const d = DENSITY[level]
      const section = densitySection(level)
      const run = Math.min(d.bulletItems[1], MAX_POINT_RUN)
      expect(section).toContain(`A run of "point" blocks holds at most ${run} points`)
      expect(section).toContain(`label and meaning together ${d.bulletWords} words or fewer, the label 1-3 words`)
      expect(section).toContain(`A "callout" is one sentence of ${d.bulletWords + 6} words or fewer`)
      expect(section).toContain(`A "code" block is ${CODE_MAX_LINES} lines or fewer, each ${CODE_MAX_LINE_CHARS} characters or fewer`)
    })
  }

  it('has no long dash', () => {
    for (const level of ['simplified', 'balanced', 'detailed'] as const) {
      expect(densitySection(level)).not.toMatch(/[—–]/)
    }
  })
})

describe('structured block limits', () => {
  it('pins the point-run and code size limits the validators and prompts share', () => {
    expect(MAX_POINT_RUN).toBe(6)
    expect(CODE_MAX_LINES).toBe(12)
    expect(CODE_MAX_LINE_CHARS).toBe(60)
  })
})
