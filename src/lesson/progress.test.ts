import { describe, expect, it } from 'vitest'

import { hardestCheckpoints, studentProgress, type LessonAnswerRow } from './progress'

const row = (studentId: string, questionId: string, correct: boolean): LessonAnswerRow => ({
  studentId,
  questionId,
  correct,
})

describe('studentProgress', () => {
  it('reports not started, in progress and finished, in input order', () => {
    const result = studentProgress(
      ['c', 'a', 'b'],
      [row('a', 'q1', true), row('a', 'q2', false), row('c', 'q1', true)],
      [{ studentId: 'b', score: 80 }],
      4,
    )
    expect(result).toEqual([
      { studentId: 'c', status: 'in_progress', answered: 1, total: 4, score: null },
      { studentId: 'a', status: 'in_progress', answered: 2, total: 4, score: null },
      { studentId: 'b', status: 'finished', answered: 0, total: 4, score: 80 },
    ])
  })

  it('reports a student with no answers or attempt as not started', () => {
    expect(studentProgress(['a'], [], [], 3)).toEqual([
      { studentId: 'a', status: 'not_started', answered: 0, total: 3, score: null },
    ])
  })

  it('lets a finished attempt override the answer count', () => {
    const [p] = studentProgress(['a'], [row('a', 'q1', true)], [{ studentId: 'a', score: 100 }], 5)
    expect(p).toMatchObject({ status: 'finished', answered: 1, score: 100 })
  })

  it('ignores answers and attempts of students not listed', () => {
    expect(studentProgress(['a'], [row('x', 'q1', true)], [{ studentId: 'x', score: 50 }], 2)).toEqual([
      { studentId: 'a', status: 'not_started', answered: 0, total: 2, score: null },
    ])
  })
})

describe('hardestCheckpoints', () => {
  const questions = [
    { id: 'q1', prompt: 'One', slideNumber: 1 },
    { id: 'q2', prompt: 'Two', slideNumber: 2 },
    { id: 'q3', prompt: 'Three', slideNumber: 3 },
    { id: 'q4', prompt: 'Four', slideNumber: 4 },
  ]

  it('orders by miss rate descending, ties by slide number ascending', () => {
    const answers = [
      row('a', 'q3', false),
      row('b', 'q3', false),
      row('a', 'q2', false),
      row('b', 'q2', true),
      row('a', 'q1', false),
      row('b', 'q1', true),
    ]
    expect(hardestCheckpoints(answers, questions).map((h) => h.questionId)).toEqual(['q3', 'q1', 'q2'])
  })

  it('excludes questions nobody answered and counts misses', () => {
    const answers = [row('a', 'q2', false), row('b', 'q2', true), row('c', 'q2', false)]
    const result = hardestCheckpoints(answers, questions)
    expect(result).toEqual([
      { questionId: 'q2', prompt: 'Two', slideNumber: 2, answered: 3, missed: 2, missRate: 2 / 3 },
    ])
  })

  it('returns an empty list with no answers', () => {
    expect(hardestCheckpoints([], questions)).toEqual([])
  })
})
