import { useEffect, useState, type ReactNode } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { QuizPreview } from './QuizPreview'
import { CodeChip } from './CodeChip'
import { loadOwnerQuiz } from '@/quiz/api'
import type { DeckQuizSummary, OwnerQuiz } from '@/quiz/rows'
import { quizTypeLabel, summaryType } from '@/quiz/types'
import { describeError } from '@/store/presentationStore'

export type PreviewState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; quiz: OwnerQuiz }

/** What the preview shows for each load state. Pure, so it can be render-tested without a fetch. */
export function QuizPreviewBody({
  summary,
  state,
  isTeacher,
}: {
  summary: DeckQuizSummary
  state: PreviewState
  isTeacher: boolean
}) {
  const tests = summary.sections.length
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-app-muted">
          {summary.itemCount} questions · {tests} {tests === 1 ? 'test' : 'tests'} ·{' '}
          {quizTypeLabel(summaryType(summary.sections))} · {new Date(summary.createdAt).toLocaleDateString()}
        </p>
        {isTeacher && <CodeChip code={summary.code} />}
      </div>

      <div className="mt-3">
        {state.status === 'loading' && <p className="text-sm text-app-muted">Loading quiz…</p>}
        {state.status === 'error' && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            Couldn&apos;t load this quiz: {state.message}
          </p>
        )}
        {state.status === 'ready' && <QuizPreview quiz={state.quiz} />}
      </div>
    </div>
  )
}

/**
 * One saved quiz from this deck, with its answers, opened from the "Quizzes from
 * this deck" tab. Owner-only by data: it reads through `loadOwnerQuiz`. Shown
 * above the quiz modal; the quiz modal stands its own Escape/backdrop close
 * down while this is open, so only this one closes.
 */
export function QuizPreviewModal({
  summary,
  isTeacher,
  pdfBusy,
  onPdf,
  notices,
  onClose,
}: {
  summary: DeckQuizSummary
  isTeacher: boolean
  /** Which PDF is being built, if any (a quiz id, or 'result'). */
  pdfBusy: string | null
  onPdf: (quiz: OwnerQuiz) => void
  /** PDF notices/errors from the quiz modal, shown here while this is on top. */
  notices?: ReactNode
  onClose: () => void
}) {
  const [state, setState] = useState<PreviewState>({ status: 'loading' })

  useEffect(() => {
    let live = true
    loadOwnerQuiz(summary.id)
      .then((quiz) => {
        if (live) setState({ status: 'ready', quiz })
      })
      .catch((err: unknown) => {
        if (live) setState({ status: 'error', message: describeError(err) })
      })
    return () => {
      live = false
    }
  }, [summary.id])

  return (
    <Modal title={summary.title} maxWidth="max-w-2xl" onClose={onClose}>
      <QuizPreviewBody summary={summary} state={state} isTeacher={isTeacher} />
      {notices}
      <div className="mt-6 flex items-center justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
        <Button
          variant="primary"
          loading={pdfBusy === summary.id}
          disabled={state.status !== 'ready' || pdfBusy !== null}
          onClick={() => {
            if (state.status === 'ready') onPdf(state.quiz)
          }}
        >
          Download PDF
        </Button>
      </div>
    </Modal>
  )
}
