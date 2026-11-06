import { describe, expect, it } from 'vitest'
import { lessonModesFrom, takeLessonFromJson } from './rows'

const video = {
  path: 'u/p.mp4',
  contentType: 'video/mp4',
  durationSeconds: 18,
  generatedAt: '2026-11-01T00:00:00Z',
  slides: [{ cardId: 'c1', startSeconds: 0, durationSeconds: 18 }],
}

function payload(over: Record<string, unknown> = {}) {
  return {
    id: 'q',
    title: 'Cells',
    quiz_type: 'mixed',
    settings: {
      sections: [
        { title: 'A', instructions: 'Pick.', type: 'multiple_choice', choiceCount: 3 },
        { title: 'B', instructions: '', type: 'fill_blank', wordBox: true },
      ],
    },
    class_name: 'Bio',
    questions: [
      { id: 'y', order_index: 1, section_index: 1, question_type: 'fill_blank', card_id: null, slide_number: 3, prompt: 'The ___.', choices: [] },
      { id: 'x', order_index: 0, section_index: 0, question_type: 'multiple_choice', card_id: 'c1', slide_number: 2, prompt: 'P', choices: ['a', 'b', 'c'] },
    ],
    word_boxes: { '1': ['sun', 'moon'] },
    video,
    answers: [{ question_id: 'x', correct: true }, { question_id: 'y', correct: false }],
    watched_until: 12.5,
    score: null,
    ...over,
  }
}

describe('takeLessonFromJson', () => {
  it('maps a full payload, ordering questions and carrying card ids', () => {
    const lesson = takeLessonFromJson(payload())
    expect(lesson.quizId).toBe('q')
    expect(lesson.title).toBe('Cells')
    expect(lesson.className).toBe('Bio')
    expect(lesson.sections.map((s) => s.title)).toEqual(['A', 'B'])
    expect(lesson.questions).toEqual([
      { id: 'x', slideNumber: 2, prompt: 'P', choices: ['a', 'b', 'c'], sectionIndex: 0, type: 'multiple_choice', orderIndex: 0, cardId: 'c1' },
      { id: 'y', slideNumber: 3, prompt: 'The ___.', choices: [], sectionIndex: 1, type: 'fill_blank', orderIndex: 1, cardId: null },
    ])
    expect(lesson.wordBoxes).toEqual({ 1: ['sun', 'moon'] })
    expect(lesson.video?.path).toBe('u/p.mp4')
    expect(lesson.video?.slides).toHaveLength(1)
    expect(lesson.watchedUntil).toBe(12.5)
    expect(lesson.finishedScore).toBeNull()
    expect('answer' in lesson.questions[0]).toBe(false)
  })

  it('reads answers into a question id to correct map', () => {
    const lesson = takeLessonFromJson(payload())
    expect(lesson.answered).toEqual(new Map([['x', true], ['y', false]]))
  })

  it('reads an invalid or missing video as null', () => {
    expect(takeLessonFromJson(payload({ video: { path: '' } })).video).toBeNull()
    expect(takeLessonFromJson(payload({ video: null })).video).toBeNull()
    expect(takeLessonFromJson(payload({ video: undefined })).video).toBeNull()
  })

  it('coerces numerics that arrive as strings', () => {
    const lesson = takeLessonFromJson(payload({ score: '0.5', watched_until: '7.25' }))
    expect(lesson.finishedScore).toBe(0.5)
    expect(lesson.watchedUntil).toBe(7.25)
  })

  it('treats a non-finite watched_until as 0 and a non-finite score as none', () => {
    const lesson = takeLessonFromJson(payload({ score: 'abc', watched_until: 'nope' }))
    expect(lesson.watchedUntil).toBe(0)
    expect(lesson.finishedScore).toBeNull()
    expect(takeLessonFromJson(payload({ score: 0 })).finishedScore).toBe(0)
  })

  it('ignores malformed answers and tolerates a missing list', () => {
    const lesson = takeLessonFromJson(
      payload({ answers: [{ question_id: 'x', correct: true }, { question_id: 5, correct: true }, null, { question_id: 'y' }] }),
    )
    expect(lesson.answered).toEqual(new Map([['x', true]]))
    expect(takeLessonFromJson(payload({ answers: undefined })).answered.size).toBe(0)
  })
})

describe('lessonModesFrom', () => {
  it('is empty on an error (a project without 0018)', () => {
    expect(lessonModesFrom({ data: null, error: { message: 'column "mode" does not exist' } }).size).toBe(0)
  })

  it('is empty with no rows', () => {
    expect(lessonModesFrom({ data: null, error: null }).size).toBe(0)
  })

  it('keys each posting by quiz and class', () => {
    const set = lessonModesFrom({
      data: [{ quiz_id: 'q1', class_id: 'c1' }, { quiz_id: 'q2', class_id: 'c1' }],
      error: null,
    })
    expect([...set].sort()).toEqual(['q1|c1', 'q2|c1'])
  })
})
