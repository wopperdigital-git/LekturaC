import { describe, expect, it } from 'vitest'
import { buildQuestions, seededShuffle } from './build'
import type { QuizResponse } from './schema'
import type { QuizConfig } from './types'

const CARDS = [
  { id: 'c1', heading: 'Intro' },
  { id: 'c2', heading: 'Cells' },
  { id: 'c3', heading: 'Energy' },
]
const MC4: QuizConfig = { type: 'multiple_choice', choiceCount: 4 }
const MC3: QuizConfig = { type: 'multiple_choice', choiceCount: 3 }
const FILL: QuizConfig = { type: 'fill_blank', wordBox: true }
const TF: QuizConfig = { type: 'true_false', notation: 'word' }

function run(response: QuizResponse, config: QuizConfig, count = 5) {
  return buildQuestions({ response, config, count, cards: CARDS, seed: 'seed' })
}

describe('seededShuffle', () => {
  it('is deterministic per seed and is a permutation', () => {
    const items = [1, 2, 3, 4, 5, 6]
    expect(seededShuffle(items, 'a')).toEqual(seededShuffle(items, 'a'))
    expect([...seededShuffle(items, 'a')].sort((a, b) => a - b)).toEqual(items)
    expect(items).toEqual([1, 2, 3, 4, 5, 6]) // input untouched
  })

  it('differs across seeds for at least one of several seeds', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8]
    const orders = new Set(['a', 'b', 'c', 'd', 'e'].map((s) => seededShuffle(items, s).join()))
    expect(orders.size).toBeGreaterThan(1)
  })
})

describe('buildQuestions — multiple choice', () => {
  it('keeps the correct choice correct after shuffling, for every answer position', () => {
    for (let answerIndex = 0; answerIndex < 4; answerIndex++) {
      const choices = ['alpha', 'beta', 'gamma', 'delta']
      const res = run({ questions: [{ slide: 2, prompt: 'Which?', choices, answerIndex }] }, MC4)
      expect(res.questions).toHaveLength(1)
      const q = res.questions[0]
      expect([...q.choices].sort()).toEqual([...choices].sort())
      expect(q.choices[q.answer as number]).toBe(choices[answerIndex])
    }
  })

  it('maps slide → cardId and heading, and trims the prompt', () => {
    const res = run({ questions: [{ slide: 2, prompt: '  Which?  ', choices: ['a', 'b', 'c'], answerIndex: 0 }] }, MC3)
    expect(res.questions[0]).toMatchObject({ slideNumber: 2, slideHeading: 'Cells', cardId: 'c2', prompt: 'Which?' })
  })

  it('drops wrong choice counts, out-of-range answers, duplicate choices and out-of-range slides', () => {
    const res = run(
      {
        questions: [
          { slide: 1, prompt: 'few', choices: ['a', 'b'], answerIndex: 0 },
          { slide: 1, prompt: 'bad index', choices: ['a', 'b', 'c', 'd'], answerIndex: 4 },
          { slide: 1, prompt: 'dupes', choices: ['a', 'A', 'c', 'd'], answerIndex: 0 },
          { slide: 9, prompt: 'no such slide', choices: ['a', 'b', 'c', 'd'], answerIndex: 0 },
          { slide: 0, prompt: 'slide zero', choices: ['a', 'b', 'c', 'd'], answerIndex: 0 },
          { slide: 3, prompt: 'good', choices: ['a', 'b', 'c', 'd'], answerIndex: 2 },
        ],
      },
      MC4,
    )
    expect(res.questions.map((q) => q.prompt)).toEqual(['good'])
    expect(res.shortfall).toBe(4)
  })
})

describe('buildQuestions — fill in the blank', () => {
  it('requires a blank marker and a non-empty answer, and cleans accepted alternates', () => {
    const res = run(
      {
        questions: [
          { slide: 2, prompt: 'The ___ makes energy.', answer: ' Mitochondria ', accepted: ['mitochondrion', 'Mitochondria', '', 'mito', 'a', 'b'] },
          { slide: 2, prompt: 'No blank here.', answer: 'x' },
          { slide: 2, prompt: 'Empty ____ answer.', answer: '   ' },
          { slide: 2, prompt: 'Boolean ___ answer.', answer: true },
        ],
      },
      FILL,
    )
    expect(res.questions).toHaveLength(1)
    const q = res.questions[0]
    expect(q.choices).toEqual([])
    expect(q.answer).toEqual({ text: 'Mitochondria', accepted: ['mitochondrion', 'mito', 'a'] })
  })
})

describe('buildQuestions — unscorable blanks', () => {
  it('drops a question whose answer has no letter or digit, and skips such alternates', () => {
    const res = run(
      {
        questions: [
          { slide: 2, prompt: 'Punctuation ___ only.', answer: '!!!' },
          { slide: 2, prompt: 'Alternate ___ noise.', answer: 'Yes', accepted: ['?!', 'yep', '...'] },
          { slide: 2, prompt: 'The capital of Japan is ___.', answer: '東京', accepted: ['とうきょう'] },
          { slide: 2, prompt: 'The year ___.', answer: '1999' },
        ],
      },
      FILL,
    )
    expect(res.questions.map((q) => q.answer)).toEqual([
      { text: 'Yes', accepted: ['yep'] },
      { text: '東京', accepted: ['とうきょう'] },
      { text: '1999', accepted: [] },
    ])
  })
})

describe('buildQuestions — true/false', () => {
  it('accepts booleans and true/false/T/F strings, drops anything else', () => {
    const res = run(
      {
        questions: [
          { slide: 1, prompt: 's1', answer: true },
          { slide: 1, prompt: 's2', answer: 'False' },
          { slide: 1, prompt: 's3', answer: 'T' },
          { slide: 1, prompt: 's4', answer: 'maybe' },
          { slide: 1, prompt: 's5' },
        ],
      },
      TF,
    )
    expect(res.questions.map((q) => q.answer)).toEqual([true, false, true])
    expect(res.questions.every((q) => q.choices.length === 0)).toBe(true)
  })
})

describe('buildQuestions — count', () => {
  it('trims to count and reports no shortfall', () => {
    const questions = Array.from({ length: 8 }, (_, i) => ({ slide: 1, prompt: `s${i}`, answer: true }))
    const res = run({ questions }, TF, 5)
    expect(res.questions).toHaveLength(5)
    expect(res.shortfall).toBe(0)
  })

  it('reports a shortfall when fewer valid questions than requested come back', () => {
    const res = run({ questions: [{ slide: 1, prompt: 'only', answer: false }] }, TF, 4)
    expect(res.questions).toHaveLength(1)
    expect(res.shortfall).toBe(3)
  })
})
