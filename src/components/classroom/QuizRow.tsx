import { Link } from 'react-router-dom'
import { formatDate } from '@/classroom/format'
import { formatSlideRange } from '@/classroom/slideRange'
import type { ClassRoom, QuizSummary } from '@/classroom/types'
import { ClassChip } from './ClassChip'

/** Which slides a quiz came from, where it is posted, and when it was generated. */
export function QuizRow({ quiz, postedIn }: { quiz: QuizSummary; postedIn: ClassRoom[] }) {
  const slides = formatSlideRange(quiz.slideNumbers)

  return (
    <div className="flex flex-col gap-2 rounded-app-sm border border-app-border px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-app-foreground">{quiz.title}</p>
        <p className="truncate text-xs text-app-muted">
          From{' '}
          {quiz.presentationId ? (
            <Link to={`/deck/${quiz.presentationId}`} className="font-medium text-app-accent-text hover:underline">
              {quiz.deckTitle}
            </Link>
          ) : (
            <>
              <span className="font-medium text-app-foreground">{quiz.deckTitle}</span> (deck deleted)
            </>
          )}
          {slides && ` · ${slides}`}
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {postedIn.length === 0 ? (
          <span className="text-xs text-app-muted">Not posted</span>
        ) : (
          postedIn.map((c) => <ClassChip key={c.id} name={c.name} />)
        )}
      </div>
      <p className="shrink-0 text-xs text-app-muted">Generated {formatDate(quiz.createdAt)}</p>
    </div>
  )
}
