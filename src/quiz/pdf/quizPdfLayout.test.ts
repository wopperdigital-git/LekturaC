import { describe, expect, it } from 'vitest'
import type { OwnerQuestion, OwnerQuiz } from '@/quiz/rows'
import { defaultInstructions, type QuizConfig } from '@/quiz/types'
import { buildQuizItems, paginate, wrapText } from './quizPdfLayout'

const measure = (s: string) => s.length * 10 // 10 units per character

function quiz(over: Partial<OwnerQuiz> & { config?: QuizConfig }): OwnerQuiz {
  const { config = { type: 'multiple_choice', choiceCount: 4 }, ...rest } = over
  return {
    id: 'q',
    code: 'ABCD23XY',
    title: 'Cells quiz',
    deckTitle: 'Cells',
    createdAt: '2026-09-24T00:00:00Z',
    sections: [{ title: 'Test 1', instructions: defaultInstructions(config), config }],
    questions: [],
    ...rest,
  }
}

/** A question in section 0 whose type defaults to the first section's. */
function question(over: Partial<OwnerQuestion>): OwnerQuestion {
  return { id: '1', sectionIndex: 0, type: 'multiple_choice', slideNumber: 1, slideHeading: 'H', prompt: 'P', choices: [], answer: 0, ...over }
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
          question({ id: '1', slideNumber: 2, slideHeading: 'Cells', prompt: 'Which?', choices: ['a', 'b', 'c', 'd'], answer: 2, type: 'multiple_choice' }),
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
        questions: [question({ id: '1', prompt: 'P', choices: ['x', 'y', 'z'], answer: 0, type: 'multiple_choice' })],
      }),
    )
    expect(sheet.filter((i) => i.kind === 'choice').map((i) => i.text)).toEqual(['A. x', 'B. y', 'C. z'])
  })

  it('shows the word box only when the quiz has one, sorted, and puts accepted answers in the key', () => {
    const questions = [
      question({ id: '1', prompt: 'The ___ is big.', answer: { text: 'sun', accepted: ['the sun'] }, type: 'fill_blank' }),
      question({ id: '2', prompt: 'A ___ is small.', answer: { text: 'ant', accepted: [] }, type: 'fill_blank' }),
    ]
    const withBox = buildQuizItems(quiz({ config: { type: 'fill_blank', wordBox: true }, questions }))
    expect(withBox.sheet.find((i) => i.kind === 'wordBox')?.text).toBe('ant   ·   sun')
    expect(withBox.key.map((i) => i.text)).toContain('1. sun (also accepted: the sun)')
    const without = buildQuizItems(quiz({ config: { type: 'fill_blank', wordBox: false }, questions }))
    expect(without.sheet.some((i) => i.kind === 'wordBox')).toBe(false)
  })

  it('uses the chosen true/false notation on the answer line and in the key', () => {
    const questions = [question({ id: '1', prompt: 'S', answer: true, type: 'true_false' })]
    const word = buildQuizItems(quiz({ config: { type: 'true_false', notation: 'word' }, questions }))
    expect(word.sheet.find((i) => i.kind === 'answerLine')?.text).toBe('TRUE / FALSE')
    expect(word.key.map((i) => i.text)).toContain('1. TRUE')
    const letter = buildQuizItems(quiz({ config: { type: 'true_false', notation: 'letter' }, questions }))
    expect(letter.sheet.find((i) => i.kind === 'answerLine')?.text).toBe('T / F')
    expect(letter.key.map((i) => i.text)).toContain('1. T')
  })

  /* A trailing spacer could land on a fresh page and leave an empty sheet before the key. */
  it('never ends the sheet with a spacer, and separates questions with exactly one', () => {
    const questions = [1, 2, 3].map((n) =>
      question({ id: String(n), prompt: `P${n}`, answer: true, type: 'true_false' }),
    )
    const { sheet } = buildQuizItems(quiz({ config: { type: 'true_false', notation: 'word' }, questions }))
    expect(sheet[sheet.length - 1].kind).not.toBe('blank')
    expect(sheet.filter((i) => i.kind === 'blank')).toHaveLength(questions.length - 1)
  })
})

describe('buildQuizItems — several tests', () => {
  const mixed = quiz({
    sections: [
      { title: 'Part A', instructions: 'Pick one.', config: { type: 'multiple_choice', choiceCount: 3 } },
      { title: 'Part B', instructions: '', config: { type: 'fill_blank', wordBox: true } },
      { title: 'Part C', instructions: 'T or F.', config: { type: 'true_false', notation: 'letter' } },
    ],
    questions: [
      question({ id: 'a1', prompt: 'Which?', choices: ['x', 'y', 'z'], answer: 1 }),
      question({ id: 'a2', prompt: 'Which else?', choices: ['x', 'y', 'z'], answer: 0 }),
      question({ id: 'b1', sectionIndex: 1, type: 'fill_blank', prompt: 'The ___ glows.', answer: { text: 'sun', accepted: [] } }),
      question({ id: 'c1', sectionIndex: 2, type: 'true_false', prompt: 'Water is wet.', answer: true }),
    ],
  })

  it('heads each test with its title and instructions and restarts numbering', () => {
    const { sheet } = buildQuizItems(mixed)
    expect(sheet.filter((i) => i.kind === 'heading').map((i) => i.text)).toEqual(['Part A', 'Part B', 'Part C'])
    expect(sheet.filter((i) => i.kind === 'instruction').map((i) => i.text)).toEqual(['Pick one.', 'T or F.'])
    expect(sheet.filter((i) => i.kind === 'question').map((i) => i.text)).toEqual([
      '1. Which?', '2. Which else?', '1. The ___ glows.', '1. Water is wet.',
    ])
    expect(sheet.filter((i) => i.kind === 'wordBox').map((i) => i.text)).toEqual(['sun'])
    expect(sheet.filter((i) => i.kind === 'answerLine').map((i) => i.text)).toEqual(['T / F'])
  })

  it('groups the key by test with numbering restarting', () => {
    const { key } = buildQuizItems(mixed)
    expect(key.filter((i) => i.kind === 'heading' || i.kind === 'keyLine').map((i) => i.text)).toEqual([
      'Part A', '1. B', '2. A', 'Part B', '1. sun', 'Part C', '1. T',
    ])
  })

  it('never ends the sheet on a spacer', () => {
    const { sheet } = buildQuizItems(mixed)
    expect(sheet[sheet.length - 1].kind).not.toBe('blank')
  })
})
