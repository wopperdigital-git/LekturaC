import { matchesQuery } from './format'
import type { Attempt, Posting, QuizSummary, StudentQuiz } from './types'

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

/** One quiz in a student's class page: what was posted, when, and how they did on it there. */
export interface StudentQuizItem {
  quiz: StudentQuiz
  postedAt: string
  /** The student's attempt for THIS class, or `null` while it is still open. */
  attempt: Attempt | null
}

/**
 * The quizzes posted to one class, newest posting first.
 *
 * A posting whose quiz the student cannot read is skipped rather than shown as
 * a blank row. The attempt is matched on the class as well as the quiz: an
 * attempt belongs to a (quiz, class) pair, so a quiz answered for one of the
 * student's other classes is still open here.
 */
export function studentClassQuizzes(
  classId: string,
  quizzes: readonly StudentQuiz[],
  postings: readonly Posting[],
  attempts: readonly Attempt[],
  query = '',
): StudentQuizItem[] {
  const byId = new Map(quizzes.map((q) => [q.id, q]))
  const items: StudentQuizItem[] = []
  for (const posting of postings) {
    if (posting.classId !== classId) continue
    const quiz = byId.get(posting.quizId)
    if (!quiz || !matchesQuery(query, quiz.title)) continue
    const attempt = attempts.find((a) => a.quizId === quiz.id && a.classId === classId) ?? null
    items.push({ quiz, postedAt: posting.postedAt, attempt })
  }
  return items.sort((a, b) => Date.parse(b.postedAt) - Date.parse(a.postedAt))
}
