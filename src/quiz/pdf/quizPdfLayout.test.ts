import { describe, expect, it } from 'vitest'
import type { OwnerQuiz } from '@/quiz/rows'
import { buildQuizItems, paginate, wrapText } from './quizPdfLayout'

const measure = (s: string) => s.length * 10 // 10 units per character

function quiz(over: Partial<OwnerQuiz>): OwnerQuiz {
  return {
    id: 'q',
    code: 'ABCD23XY',
    title: 'Cells quiz',
    deckTitle: 'Cells',
    createdAt: '2026-09-24T00:00:00Z',
    config: { type: 'multiple_choice', choiceCount: 4 },
    questions: [],
    ...over,
  }
}

describe('wrapText', () => {
  it('wraps on spaces without exceeding the width', () => {
    const lines = wrapText('one two three four five', 90, measure)
    expect(lines).toEqual(['one two', 'three', 'four five']) // 'four five' is exactly 90 wide
    expect(lines.every((l) => measure(l) <= 90)).toBe(true)
  })

  it('breaks a single word that is too long', () => {
    const lines = wrapText('abcdefghijkl', 50, measure)
    expect(lines.every((l) => measure(l) <= 50)).toBe(true)
    expect(lines.join('')).toBe('abcdefghijkl')
  })

  it('returns one empty line for empty text', () => {
    expect(wrapText('', 100, measure)).toEqual([''])
  })
})

describe('paginate', () => {
  it('starts a new page when a line would overflow', () => {
    expect(paginate([{ height: 40 }, { height: 40 }, { height: 40 }], 100)).toEqual([0, 0, 1])
  })

  it('moves a keep-with-next line to the next page with the line it heads', () => {
    // 40 + 40 + 30 (the question) + 30 (its choice) = 140: the question and its
    // choice must land on the same page.
    const pages = paginate([{ height: 40 }, { height: 40 }, { height: 30, keepWithNext: true }, { height: 30 }], 100)
    expect(pages).toEqual([0, 0, 1, 1])
  })

  it('keeps a header with its follower when only the header would fit', () => {
    const pages = paginate([{ height: 60 }, { height: 30, keepWithNext: true }, { height: 30 }], 100)
    expect(pages).toEqual([0, 1, 1])
  })
})

describe('buildQuizItems', () => {
  it('lays out multiple choice with lettered choices and a key', () => {
    const { sheet, key } = buildQuizItems(
      quiz({
        questions: [
          { id: '1', slideNumber: 2, slideHeading: 'Cells', prompt: 'Which?', choices: ['a', 'b', 'c', 'd'], answer: 2 },
        ],
      }),
    )
    expect(sheet.map((i) => i.kind)).toContain('question')
    const choices = sheet.filter((i) => i.kind === 'choice').map((i) => i.text)
    expect(choices).toEqual(['A. a', 'B. b', 'C. c', 'D. d'])
    expect(key.some((i) => i.kind === 'keyLine' && i.text === '1. C')).toBe(true)
  })

  it('uses A–C for three choices', () => {
    const { sheet } = buildQuizItems(
      quiz({
        config: { type: 'multiple_choice', choiceCount: 3 },
        questions: [{ id: '1', slideNumber: 1, slideHeading: 'H', prompt: 'P', choices: ['x', 'y', 'z'], answer: 0 }],
      }),
    )
    expect(sheet.filter((i) => i.kind === 'choice').map((i) => i.text)).toEqual(['A. x', 'B. y', 'C. z'])
  })

  it('shows the word box only when the quiz has one, sorted, and puts accepted answers in the key', () => {
    const questions = [
      { id: '1', slideNumber: 1, slideHeading: 'H', prompt: 'The ___ is big.', choices: [], answer: { text: 'sun', accepted: ['the sun'] } },
      { id: '2', slideNumber: 1, slideHeading: 'H', prompt: 'A ___ is small.', choices: [], answer: { text: 'ant', accepted: [] } },
    ]
    const withBox = buildQuizItems(quiz({ config: { type: 'fill_blank', wordBox: true }, questions }))
    expect(withBox.sheet.find((i) => i.kind === 'wordBox')?.text).toBe('ant   ·   sun')
    expect(withBox.key.map((i) => i.text)).toContain('1. sun (also accepted: the sun)')
    const without = buildQuizItems(quiz({ config: { type: 'fill_blank', wordBox: false }, questions }))
    expect(without.sheet.some((i) => i.kind === 'wordBox')).toBe(false)
  })

  it('uses the chosen true/false notation on the answer line and in the key', () => {
    const questions = [{ id: '1', slideNumber: 1, slideHeading: 'H', prompt: 'S', choices: [], answer: true }]
    const word = buildQuizItems(quiz({ config: { type: 'true_false', notation: 'word' }, questions }))
    expect(word.sheet.find((i) => i.kind === 'answerLine')?.text).toBe('TRUE / FALSE')
    expect(word.key.map((i) => i.text)).toContain('1. TRUE')
    const letter = buildQuizItems(quiz({ config: { type: 'true_false', notation: 'letter' }, questions }))
    expect(letter.sheet.find((i) => i.kind === 'answerLine')?.text).toBe('T / F')
    expect(letter.key.map((i) => i.text)).toContain('1. T')
  })
})
