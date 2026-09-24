import { describe, expect, it } from 'vitest'
import { deckQuizFromRow, ownerQuizFromRows, takeQuizFromJson } from './rows'

describe('deckQuizFromRow', () => {
  it('maps a quizzes row with a question count', () => {
    expect(
      deckQuizFromRow({
        id: 'q1',
        code: 'ABCD23XY',
        title: 'Cells quiz',
        created_at: '2026-09-24T00:00:00Z',
        quiz_type: 'fill_blank',
        settings: { wordBox: true },
        quiz_questions: [{ count: 5 }],
      }),
    ).toEqual({
      id: 'q1',
      code: 'ABCD23XY',
      title: 'Cells quiz',
      createdAt: '2026-09-24T00:00:00Z',
      config: { type: 'fill_blank', wordBox: true },
      itemCount: 5,
    })
  })

  it('defaults the count to 0 when the aggregate is missing', () => {
    expect(
      deckQuizFromRow({ id: 'q', code: 'C', title: 'T', created_at: 'x', quiz_type: 'true_false', settings: {} }).itemCount,
    ).toBe(0)
  })
})

describe('ownerQuizFromRows', () => {
  it('orders questions and keeps the answers', () => {
    const quiz = ownerQuizFromRows(
      { id: 'q', code: 'C', title: 'T', deck_title: 'D', created_at: 'x', quiz_type: 'true_false', settings: { notation: 'letter' } },
      [
        { id: 'b', order_index: 1, slide_number: 2, slide_heading: 'H2', prompt: 'P2', choices: [], answer: false },
        { id: 'a', order_index: 0, slide_number: 1, slide_heading: 'H1', prompt: 'P1', choices: [], answer: true },
      ],
    )
    expect(quiz.config).toEqual({ type: 'true_false', notation: 'letter' })
    expect(quiz.questions.map((q) => q.id)).toEqual(['a', 'b'])
    expect(quiz.questions[0].answer).toBe(true)
  })
})

describe('takeQuizFromJson', () => {
  it('maps the RPC payload and never expects an answer', () => {
    const quiz = takeQuizFromJson({
      id: 'q',
      title: 'T',
      deck_title: 'D',
      quiz_type: 'multiple_choice',
      settings: { choiceCount: 3 },
      classes: [{ id: 'c', name: 'Bio', attempted: false }],
      questions: [{ id: 'x', order_index: 0, slide_number: 2, prompt: 'P', choices: ['a', 'b', 'c'] }],
      word_box: null,
    })
    expect(quiz.config).toEqual({ type: 'multiple_choice', choiceCount: 3 })
    expect(quiz.questions[0]).toEqual({ id: 'x', slideNumber: 2, prompt: 'P', choices: ['a', 'b', 'c'] })
    expect(quiz.wordBox).toBeNull()
    expect('answer' in quiz.questions[0]).toBe(false)
  })
})
