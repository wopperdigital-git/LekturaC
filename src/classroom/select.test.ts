import { describe, expect, it } from 'vitest'
import { selectQuizzes, studentClassQuizzes } from './select'
import type { Attempt, Posting, QuizSummary, StudentQuiz } from './types'

const quiz = (id: string, title: string, createdAt: string): QuizSummary => ({
  id,
  title,
  deckTitle: `${title} deck`,
  presentationId: null,
  createdAt,
  slideNumbers: [],
  code: `CODE-${id}`,
  quizType: 'multiple_choice',
})

const quizzes = [
  quiz('q1', 'Cells', '2026-09-01T00:00:00+00:00'),
  quiz('q2', 'Atoms', '2026-09-05T00:00:00+00:00'),
  quiz('q3', 'Plants', '2026-09-03T00:00:00+00:00'),
]
const postings: Posting[] = [{ quizId: 'q3', classId: 'A', postedAt: '2026-09-04T00:00:00+00:00' }]

describe('selectQuizzes', () => {
  it('sorts newest first by default order option', () => {
    expect(selectQuizzes(quizzes, postings, { query: '', classId: '', sort: 'newest' }).map((q) => q.id)).toEqual([
      'q2',
      'q3',
      'q1',
    ])
  })

  it('sorts oldest first', () => {
    expect(selectQuizzes(quizzes, postings, { query: '', classId: '', sort: 'oldest' }).map((q) => q.id)).toEqual([
      'q1',
      'q3',
      'q2',
    ])
  })

  it('keeps only quizzes posted to the chosen class', () => {
    expect(selectQuizzes(quizzes, postings, { query: '', classId: 'A', sort: 'newest' }).map((q) => q.id)).toEqual(['q3'])
  })

  it('searches the title and the deck title', () => {
    expect(selectQuizzes(quizzes, postings, { query: 'atoms DECK', classId: '', sort: 'newest' }).map((q) => q.id)).toEqual(['q2'])
  })

  it('does not reorder the array it was given', () => {
    const input = [...quizzes]
    selectQuizzes(input, postings, { query: '', classId: '', sort: 'newest' })
    expect(input.map((q) => q.id)).toEqual(['q1', 'q2', 'q3'])
  })
})

describe('studentClassQuizzes', () => {
  const sq = (id: string, title: string): StudentQuiz => ({
    id,
    title,
    code: `CODE-${id}`,
    quizType: 'multiple_choice',
    createdAt: '2026-09-01T00:00:00+00:00',
  })
  const visible = [sq('q1', 'Cells'), sq('q2', 'Atoms'), sq('q3', 'Plants')]
  const posted: Posting[] = [
    { quizId: 'q1', classId: 'A', postedAt: '2026-09-02T00:00:00+00:00' },
    { quizId: 'q2', classId: 'A', postedAt: '2026-09-05T00:00:00+00:00' },
    { quizId: 'q3', classId: 'B', postedAt: '2026-09-06T00:00:00+00:00' },
    // A posting whose quiz the student cannot read (deleted, or not visible) is skipped.
    { quizId: 'gone', classId: 'A', postedAt: '2026-09-07T00:00:00+00:00' },
  ]
  const attempt = (quizId: string, classId: string, score: number): Attempt => ({
    quizId,
    classId,
    studentId: 's1',
    score,
    submittedAt: '2026-09-08T00:00:00+00:00',
  })

  it('lists only quizzes posted to this class, newest posting first, skipping unreadable quizzes', () => {
    const items = studentClassQuizzes('A', visible, posted, [])
    expect(items.map((i) => i.quiz.id)).toEqual(['q2', 'q1'])
    expect(items[0].postedAt).toBe('2026-09-05T00:00:00+00:00')
  })

  it('attaches the attempt for this class, and only this class', () => {
    const attempts = [attempt('q1', 'A', 0.8), attempt('q2', 'B', 1)]
    const items = studentClassQuizzes('A', visible, posted, attempts)
    expect(items.find((i) => i.quiz.id === 'q1')?.attempt?.score).toBe(0.8)
    // q2 was answered for a different class, so it is still open here.
    expect(items.find((i) => i.quiz.id === 'q2')?.attempt).toBeNull()
  })

  it('filters by title, ignoring case, and returns nothing for an unknown class', () => {
    expect(studentClassQuizzes('A', visible, posted, [], 'ATO').map((i) => i.quiz.id)).toEqual(['q2'])
    expect(studentClassQuizzes('nope', visible, posted, [])).toEqual([])
  })
})
