import { describe, expect, it } from 'vitest'
import { questionJson, sectionJson } from './api'
import type { QuizQuestionDraft } from './types'

/*
  The exact keys `create_quiz` reads (supabase/migrations/0012_quizzes.sql), read from each section's
  `questions` by 0016_quiz_sections.sql. A
  renamed key here would be accepted by the client and refused (or silently
  dropped) by the database, so the contract is pinned.
*/
describe('questionJson', () => {
  it('emits exactly the keys create_quiz reads, carrying the values across', () => {
    const q: QuizQuestionDraft = {
      slideNumber: 3,
      slideHeading: 'Energy',
      cardId: 'card-1',
      prompt: 'The ___ makes ATP.',
      choices: [],
      answer: { text: 'mitochondrion', accepted: ['mito'] },
    }
    const json = questionJson(q)
    expect(Object.keys(json).sort()).toEqual(
      ['answer', 'card_id', 'choices', 'prompt', 'slide_heading', 'slide_number'],
    )
    expect(json).toEqual({
      slide_number: 3,
      slide_heading: 'Energy',
      card_id: 'card-1',
      prompt: 'The ___ makes ATP.',
      choices: [],
      answer: { text: 'mitochondrion', accepted: ['mito'] },
    })
  })
})

/* The exact keys 0016's create_quiz reads from each element of p_sections. */
describe('sectionJson', () => {
  it('emits title, instructions, type, settings and the questions', () => {
    const json = sectionJson({
      section: { title: 'Part A', instructions: 'Pick one.', config: { type: 'multiple_choice', choiceCount: 3 } },
      questions: [
        { slideNumber: 1, slideHeading: 'H', cardId: null, prompt: 'P', choices: ['a', 'b', 'c'], answer: 1 },
      ],
    })
    expect(Object.keys(json).sort()).toEqual(['instructions', 'questions', 'settings', 'title', 'type'])
    expect(json).toMatchObject({
      title: 'Part A',
      instructions: 'Pick one.',
      type: 'multiple_choice',
      settings: { choiceCount: 3 },
    })
    expect(json.questions[0]).toEqual({
      slide_number: 1, slide_heading: 'H', card_id: null, prompt: 'P', choices: ['a', 'b', 'c'], answer: 1,
    })
  })
})
