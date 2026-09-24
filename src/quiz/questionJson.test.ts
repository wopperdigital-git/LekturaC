import { describe, expect, it } from 'vitest'
import { questionJson } from './api'
import type { QuizQuestionDraft } from './types'

/*
  The exact keys `create_quiz` reads (supabase/migrations/0012_quizzes.sql). A
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
