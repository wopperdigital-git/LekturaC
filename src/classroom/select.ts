import { matchesQuery } from './format'
import type { Posting, QuizSummary } from './types'

export type QuizSort = 'newest' | 'oldest'

/** Search + class filter + sort for the Quizzes list, in one pass. `classId === ''` is all classes. */
export function selectQuizzes(
  quizzes: readonly QuizSummary[],
  postings: readonly Posting[],
  options: { query: string; classId: string; sort: QuizSort },
): QuizSummary[] {
  const inClass = options.classId
    ? new Set(postings.filter((p) => p.classId === options.classId).map((p) => p.quizId))
    : null
  const direction = options.sort === 'newest' ? -1 : 1
  return quizzes
    .filter((q) => (!inClass || inClass.has(q.id)) && matchesQuery(options.query, q.title, q.deckTitle))
    .sort((a, b) => direction * (Date.parse(a.createdAt) - Date.parse(b.createdAt)))
}
