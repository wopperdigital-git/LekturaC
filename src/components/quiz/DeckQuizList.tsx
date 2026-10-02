import { Button } from '@/components/ui/Button'
import { CodeChip } from './CodeChip'
import type { DeckQuizSummary } from '@/quiz/rows'
import { quizTypeLabel, summaryType } from '@/quiz/types'

/**
 * The quizzes already made from this deck: open one to preview it, copy its
 * code (Teachers), or download its PDF. The whole row opens the preview; its
 * title is the real button (so it is reachable by keyboard), and the code chip
 * PDF and Delete buttons stop their presses so they never open it as well.
 */
export function DeckQuizList({
  quizzes,
  loadError,
  isTeacher,
  pdfBusy,
  busy,
  onPdf,
  onOpen,
  onDelete,
}: {
  /** `null` while loading. */
  quizzes: DeckQuizSummary[] | null
  loadError: boolean
  isTeacher: boolean
  pdfBusy: string | null
  busy: boolean
  onPdf: (quizId: string) => void
  onOpen: (quiz: DeckQuizSummary) => void
  onDelete: (quiz: DeckQuizSummary) => void
}) {
  if (loadError) return <p className="text-sm text-app-muted">The quizzes from this deck couldn&apos;t be loaded.</p>
  if (quizzes === null) return <p className="text-sm text-app-muted">Loading…</p>
  if (quizzes.length === 0) {
    return <p className="text-sm text-app-muted">No quizzes from this deck yet. Make one on the Create new quiz tab.</p>
  }
  return (
    <ul className="space-y-2">
      {quizzes.map((q) => (
        <li
          key={q.id}
          onClick={() => onOpen(q)}
          className="flex cursor-pointer flex-wrap items-center justify-between gap-2 rounded-app border border-app-border px-3 py-2 text-sm transition-colors hover:border-app-accent/40 hover:bg-app-surface/50"
        >
          <div className="min-w-0">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onOpen(q)
              }}
              aria-label={`Open preview of ${q.title}`}
              className="block max-w-full cursor-pointer truncate rounded-app-sm text-left font-medium text-app-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent"
            >
              {q.title}
            </button>
            <p className="text-xs text-app-muted">
              {q.itemCount} questions · {q.sections.length} {q.sections.length === 1 ? 'test' : 'tests'} ·{' '}
              {quizTypeLabel(summaryType(q.sections))} · {new Date(q.createdAt).toLocaleDateString()}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isTeacher && <CodeChip code={q.code} />}
            <Button
              variant="secondary"
              className="!px-2 !py-1 text-xs"
              loading={pdfBusy === q.id}
              disabled={pdfBusy !== null || busy}
              onClick={(e) => {
                e.stopPropagation()
                onPdf(q.id)
              }}
            >
              PDF
            </Button>
            <Button
              variant="ghost"
              className="!px-2 !py-1 text-xs text-red-600 dark:text-red-400"
              disabled={busy}
              aria-label={`Delete ${q.title}`}
              onClick={(e) => {
                e.stopPropagation()
                onDelete(q)
              }}
            >
              Delete
            </Button>
          </div>
        </li>
      ))}
    </ul>
  )
}
