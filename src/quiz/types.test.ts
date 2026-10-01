import { describe, expect, it } from 'vitest'
import {
  defaultInstructions,
  defaultSectionTitle,
  fromDbSections,
  parseTypeSummary,
  quizTypeLabel,
  summaryType,
  type QuizConfig,
} from './types'

const MC4: QuizConfig = { type: 'multiple_choice', choiceCount: 4 }
const FILL_BOX: QuizConfig = { type: 'fill_blank', wordBox: true }
const TF_LETTER: QuizConfig = { type: 'true_false', notation: 'letter' }

describe('defaultSectionTitle', () => {
  it('numbers tests from 1', () => {
    expect(defaultSectionTitle(0)).toBe('Test 1')
    expect(defaultSectionTitle(2)).toBe('Test 3')
  })
})

describe('defaultInstructions', () => {
  it('has one sentence per type and sub-option', () => {
    expect(defaultInstructions(MC4)).toBe('Choose the best answer for each question.')
    expect(defaultInstructions(FILL_BOX)).toBe('Fill in each blank using a word from the word box.')
    expect(defaultInstructions({ type: 'fill_blank', wordBox: false })).toBe(
      'Fill in each blank with the missing word or words.',
    )
    expect(defaultInstructions(TF_LETTER)).toBe('Write T if the statement is true or F if it is false.')
    expect(defaultInstructions({ type: 'true_false', notation: 'word' })).toBe(
      'Write TRUE if the statement is true or FALSE if it is false.',
    )
  })
})

describe('summaryType / quizTypeLabel / parseTypeSummary', () => {
  it('is the shared type, or mixed', () => {
    expect(summaryType([{ config: MC4 }, { config: { type: 'multiple_choice', choiceCount: 3 } }])).toBe(
      'multiple_choice',
    )
    expect(summaryType([{ config: MC4 }, { config: TF_LETTER }])).toBe('mixed')
  })

  it('labels mixed quizzes', () => {
    expect(quizTypeLabel('mixed')).toBe('Mixed')
    expect(quizTypeLabel('fill_blank')).toBe('Fill in the blank')
  })

  it('parses the stored quiz_type, defaulting unknown values to multiple choice', () => {
    expect(parseTypeSummary('mixed')).toBe('mixed')
    expect(parseTypeSummary('true_false')).toBe('true_false')
    expect(parseTypeSummary('essay')).toBe('multiple_choice')
  })
})

describe('fromDbSections', () => {
  it('reads stored sections in order', () => {
    const sections = fromDbSections('mixed', {
      sections: [
        { title: 'Part A', instructions: 'Pick one.', type: 'multiple_choice', choiceCount: 3 },
        { title: 'Part B', instructions: '', type: 'true_false', notation: 'letter' },
      ],
    })
    expect(sections).toEqual([
      { title: 'Part A', instructions: 'Pick one.', config: { type: 'multiple_choice', choiceCount: 3 } },
      { title: 'Part B', instructions: '', config: TF_LETTER },
    ])
  })

  it('reads a legacy quiz (no sections) as one default test', () => {
    expect(fromDbSections('fill_blank', { wordBox: true })).toEqual([
      { title: 'Test 1', instructions: defaultInstructions(FILL_BOX), config: FILL_BOX },
    ])
  })

  it('falls back per field on malformed entries and never throws', () => {
    const sections = fromDbSections('mixed', { sections: [42, { title: '   ', type: 'essay' }] })
    expect(sections).toEqual([
      { title: 'Test 1', instructions: defaultInstructions(MC4), config: MC4 },
      { title: 'Test 2', instructions: defaultInstructions(MC4), config: MC4 },
    ])
  })

  it('treats an empty or non-array sections value as legacy', () => {
    expect(fromDbSections('true_false', { sections: [] })[0].config).toEqual({ type: 'true_false', notation: 'word' })
    expect(fromDbSections('true_false', null)).toHaveLength(1)
  })

  it('keeps at most three sections', () => {
    const many = Array.from({ length: 5 }, () => ({ title: 'T', type: 'true_false' }))
    expect(fromDbSections('true_false', { sections: many })).toHaveLength(3)
  })
})
