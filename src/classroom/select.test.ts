import { describe, expect, it } from 'vitest'
import { selectQuizzes } from './select'
import type { Posting, QuizSummary } from './types'

const quiz = (id: string, title: string, createdAt: string): QuizSummary => ({
  id,
  title,
  deckTitle: `${title} deck`,
  presentationId: null,
  createdAt,
  slideNumbers: [],
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
