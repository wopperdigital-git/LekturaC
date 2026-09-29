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
  const quizTypeLabel = QUIZ_TYPE_LABELS[quiz.quizType] ?? 'Multiple choice'

  const scorePercent = attempt ? Math.round(attempt.score * 100) : 0
  const isHigh = scorePercent >= 80
  const isMid = scorePercent >= 60

  return (
    <div
      className={`group relative rounded-app border bg-app-background p-4 sm:p-5 transition-colors ${
        attempt ? 'border-app-border' : 'border-app-border hover:border-app-accent/40'
      }`}
    >
      <div className="flex flex-col gap-3.5 sm:flex-row sm:items-center sm:justify-between">
        {/* Left: Icon, Title, Metadata */}
        <div className="flex items-start gap-3.5 min-w-0 flex-1">
          <div
            aria-hidden="true"
            className={`grid size-10 shrink-0 place-items-center rounded-xl border shadow-2xs ${
              attempt
                ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'border-app-accent/25 bg-app-accent/10 text-app-accent'
            }`}
          >
            {attempt ? (
              <svg className="size-5" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                  clipRule="evenodd"
                />
              </svg>
            ) : (
              <svg
                className="size-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-base font-semibold tracking-tight text-app-foreground">
                {quiz.title}
              </h3>
              {attempt ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                  <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                  <span>Submitted</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                  <span className="size-1.5 rounded-full bg-amber-500" aria-hidden="true" />
                  <span>Pending</span>
                </span>
              )}
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-app-muted">
              <span className="inline-flex items-center gap-1 font-medium text-app-foreground/80">
                <svg className="size-2.5 text-app-muted" viewBox="0 0 16 16" fill="currentColor">
                  <circle cx="8" cy="8" r="3" />
                </svg>
                {quizTypeLabel}
              </span>
              <span>·</span>
              <span className="inline-flex items-center gap-1">
                <svg className="size-3 text-app-muted" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
                  <rect x="2" y="3" width="12" height="11" rx="1.5" />
                  <path d="M5 1.5v3M11 1.5v3M2 6.5h12" />
                </svg>
                Posted {formatDate(postedAt)}
              </span>
              {attempt && (
                <>
                  <span>·</span>
                  <span>Submitted {formatDate(attempt.submittedAt)}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right: Action or Score Capsule */}
        <div className="flex shrink-0 items-center sm:self-center">
          {attempt ? (
            <div
              className={`flex items-center gap-2 rounded-app-sm border px-3.5 py-2 font-mono text-sm font-bold shadow-2xs ${
                isHigh
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : isMid
                    ? 'border-app-accent/30 bg-app-accent/10 text-app-accent-text'
                    : 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400'
              }`}
            >
              <svg className="size-4 shrink-0" viewBox="0 0 16 16" fill="currentColor">
                <path d="M3 13.5h10M4 11V7a4 4 0 118 0v4M6.5 11h3" />
              </svg>
              <span>{formatPercent(attempt.score)}</span>
            </div>
          ) : (
            <Link
              to={`/quiz/${quiz.code}`}
              className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-app-sm bg-app-accent px-4 py-2 text-sm font-semibold text-app-accent-foreground shadow-sm transition-all duration-150 hover:brightness-110 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent"
            >
              <span>Take quiz</span>
              <svg className="size-3.5 transition-transform duration-150 group-hover:translate-x-0.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M6 12l4-4-4-4" />
              </svg>
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
