import { describe, expect, it } from 'vitest'
import { quizResponseSchema } from './schema'
import { MAX_QUIZ_ITEMS, clampItemCount, fromDbConfig, toDbConfig } from './types'

describe('quizResponseSchema', () => {
  it('accepts each of the three reply shapes', () => {
    const parsed = quizResponseSchema.safeParse({
      questions: [
        { slide: 2, prompt: 'Q?', choices: ['a', 'b', 'c'], answerIndex: 1 },
        { slide: 3, prompt: 'The ___ is big.', answer: 'sun', accepted: ['the sun'] },
        { slide: 4, prompt: 'Water is wet.', answer: true },
      ],
    })
    expect(parsed.success).toBe(true)
  })

  it('is lenient about per-question shape (build.ts drops bad ones)', () => {
    expect(quizResponseSchema.safeParse({ questions: [{ slide: 1, prompt: 'x' }] }).success).toBe(true)
  })

  it('rejects a reply with no questions array or an empty one', () => {
    expect(quizResponseSchema.safeParse({}).success).toBe(false)
    expect(quizResponseSchema.safeParse({ questions: [] }).success).toBe(false)
  })

  it('rejects a question with no slide or prompt', () => {
    expect(quizResponseSchema.safeParse({ questions: [{ prompt: 'x' }] }).success).toBe(false)
    expect(quizResponseSchema.safeParse({ questions: [{ slide: 1 }] }).success).toBe(false)
  })
})

describe('clampItemCount', () => {
  it('clamps to 1..20 and floors fractions', () => {
    expect(clampItemCount(0)).toBe(1)
    expect(clampItemCount(-5)).toBe(1)
    expect(clampItemCount(7.9)).toBe(7)
    expect(clampItemCount(999)).toBe(MAX_QUIZ_ITEMS)
    expect(clampItemCount(Number.NaN)).toBe(1)
  })
})

describe('db config mapping', () => {
  it('round-trips every config', () => {
    const configs = [
      { type: 'multiple_choice', choiceCount: 3 },
      { type: 'multiple_choice', choiceCount: 4 },
      { type: 'fill_blank', wordBox: true },
      { type: 'fill_blank', wordBox: false },
      { type: 'true_false', notation: 'word' },
      { type: 'true_false', notation: 'letter' },
    ] as const
    for (const config of configs) {
      const { quiz_type, settings } = toDbConfig(config)
      expect(fromDbConfig(quiz_type, settings)).toEqual(config)
    }
  })

  it('falls back to defaults for missing or junk settings', () => {
    expect(fromDbConfig('multiple_choice', {})).toEqual({ type: 'multiple_choice', choiceCount: 4 })
    expect(fromDbConfig('fill_blank', null)).toEqual({ type: 'fill_blank', wordBox: false })
    expect(fromDbConfig('true_false', 'x')).toEqual({ type: 'true_false', notation: 'word' })
    expect(fromDbConfig('nonsense', {})).toEqual({ type: 'multiple_choice', choiceCount: 4 })
  })
})
