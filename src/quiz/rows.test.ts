import { describe, expect, it } from 'vitest'
import { deckQuizFromRow, groupBySection, ownerQuizFromRows, takeQuizFromJson } from './rows'

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
      sections: [
        {
          title: 'Test 1',
          instructions: 'Fill in each blank using a word from the word box.',
          config: { type: 'fill_blank', wordBox: true },
        },
      ],
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
  it('orders questions and keeps the answers (legacy quiz, rows without section columns)', () => {
    const quiz = ownerQuizFromRows(
      { id: 'q', code: 'C', title: 'T', deck_title: 'D', created_at: 'x', quiz_type: 'true_false', settings: { notation: 'letter' } },
      [
        { id: 'b', order_index: 1, slide_number: 2, slide_heading: 'H2', prompt: 'P2', choices: [], answer: false },
        { id: 'a', order_index: 0, slide_number: 1, slide_heading: 'H1', prompt: 'P1', choices: [], answer: true },
      ],
    )
    expect(quiz.sections.map((s) => s.config)).toEqual([{ type: 'true_false', notation: 'letter' }])
    expect(quiz.questions.map((q) => q.id)).toEqual(['a', 'b'])
    expect(quiz.questions[0]).toMatchObject({ answer: true, sectionIndex: 0, type: 'true_false' })
  })

  it('reads sections and each question’s section and type, clamping a bad section index', () => {
    const quiz = ownerQuizFromRows(
      {
        id: 'q', code: 'C', title: 'T', deck_title: 'D', created_at: 'x', quiz_type: 'mixed',
        settings: { sections: [
          { title: 'A', instructions: '', type: 'multiple_choice', choiceCount: 3 },
          { title: 'B', instructions: 'Say T or F.', type: 'true_false', notation: 'letter' },
        ] },
      },
      [
        { id: 'x', order_index: 0, section_index: 0, question_type: 'multiple_choice', slide_number: 1, slide_heading: 'H', prompt: 'P', choices: ['a', 'b', 'c'], answer: 2 },
        { id: 'y', order_index: 1, section_index: 1, question_type: 'true_false', slide_number: 1, slide_heading: 'H', prompt: 'P', choices: [], answer: false },
        { id: 'z', order_index: 2, section_index: 7, question_type: 'essay', slide_number: 1, slide_heading: 'H', prompt: 'P', choices: [], answer: true },
      ],
    )
    expect(quiz.sections.map((s) => s.title)).toEqual(['A', 'B'])
    expect(quiz.questions.map((q) => [q.sectionIndex, q.type])).toEqual([
      [0, 'multiple_choice'],
      [1, 'true_false'],
      [1, 'true_false'],
    ])
  })
})

describe('groupBySection', () => {
  it('groups questions in order under each section, keeping empty sections out', () => {
    const sections = [
      { title: 'A', instructions: '', config: { type: 'true_false' as const, notation: 'word' as const } },
      { title: 'B', instructions: '', config: { type: 'true_false' as const, notation: 'word' as const } },
      { title: 'C', instructions: '', config: { type: 'true_false' as const, notation: 'word' as const } },
    ]
    const groups = groupBySection(sections, [
      { id: '1', sectionIndex: 0 },
      { id: '2', sectionIndex: 2 },
      { id: '3', sectionIndex: 0 },
    ])
    expect(groups.map((g) => [g.index, g.section.title, g.questions.map((q) => q.id)])).toEqual([
      [0, 'A', ['1', '3']],
      [2, 'C', ['2']],
    ])
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
