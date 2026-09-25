import { Link } from 'react-router-dom'
import { formatDate, formatPercent } from '@/classroom/format'
import type { StudentQuizItem } from '@/classroom/select'
import { QUIZ_TYPE_LABELS } from '@/quiz/types'

/**
 * One quiz posted to a class, as its student sees it: open ones link to the
 * quiz, answered ones show the score. There is no retake (the server allows one
 * attempt per class), so an answered quiz offers nothing to press.
 */
export function StudentQuizRow({ item }: { item: StudentQuizItem }) {
  const { quiz, postedAt, attempt } = item

  return (
    <div className="flex flex-col gap-2 rounded-app-sm border border-app-border px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-app-foreground">{quiz.title}</p>
        <p className="truncate text-xs text-app-muted">
          {QUIZ_TYPE_LABELS[quiz.quizType]} · Posted {formatDate(postedAt)}
        </p>
      </div>
      {attempt ? (
        <span className="shrink-0 rounded-full bg-app-accent/15 px-3 py-1 text-xs font-medium text-app-accent-text">
          Submitted · {formatPercent(attempt.score)}
        </span>
      ) : (
        <Link
          to={`/quiz/${quiz.code}`}
          className="inline-flex shrink-0 items-center justify-center rounded-app-sm bg-app-accent px-4 py-2 text-sm font-medium text-app-accent-foreground shadow-sm transition-[filter] duration-150 hover:brightness-110 active:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent"
        >
          Take quiz
        </Link>
      )}
    </div>
  )
}
