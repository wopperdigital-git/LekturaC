import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatDate } from '@/classroom/format'
import { formatSlideRange } from '@/classroom/slideRange'
import type { ClassRoom, QuizSummary } from '@/classroom/types'
import { postQuiz, unpostQuiz } from '@/quiz/api'
import { describeError } from '@/store/presentationStore'
import { ClassChip } from './ClassChip'

const SMALL_BUTTON =
  'cursor-pointer rounded-app-sm border border-app-border bg-app-surface px-2 py-1 text-xs text-app-foreground transition-colors hover:bg-app-border/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent disabled:cursor-not-allowed disabled:opacity-60'

type Copied = 'code' | 'link' | null
type CopyState = Copied | 'failed-code' | 'failed-link'

/**
 * Which slides a quiz came from, its share code, where it is posted, and when it
 * was generated. The teacher can post it to a class or unpost it from here;
 * `onChanged` reloads the page's data (no optimistic update).
 */
export function QuizRow({
  quiz,
  postedIn,
  allClasses,
  onChanged,
}: {
  quiz: QuizSummary
  postedIn: ClassRoom[]
  allClasses: ClassRoom[]
  onChanged: () => void
}) {
  const slides = formatSlideRange(quiz.slideNumbers)
  const [copied, setCopied] = useState<CopyState>(null)
  const [selectedClassId, setSelectedClassId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(null), 1500)
    return () => clearTimeout(timer)
  }, [copied])

  const postedIds = new Set(postedIn.map((c) => c.id))
  const available = allClasses.filter((c) => !postedIds.has(c.id))

  async function copy(kind: 'code' | 'link') {
    const text = kind === 'code' ? quiz.code : `${window.location.origin}/quiz/${quiz.code}`
    try {
      await navigator.clipboard.writeText(text)
      setCopied(kind)
    } catch {
      // Blocked clipboard: say so briefly — the code is still visible.
      setCopied(kind === 'code' ? 'failed-code' : 'failed-link')
    }
  }

  async function change(action: () => Promise<void>) {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await action()
      onChanged()
    } catch (err) {
      setError(describeError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-app-sm border border-app-border px-4 py-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
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
        <div className="flex flex-wrap items-center gap-1.5">
          {postedIn.length === 0 ? (
            <span className="text-xs text-app-muted">Not posted</span>
          ) : (
            postedIn.map((c) => (
              <span key={c.id} className="inline-flex items-center gap-1">
                <ClassChip name={c.name} />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void change(() => unpostQuiz(quiz.id, c.id))}
                  aria-label={`Unpost from ${c.name}`}
                  title={`Unpost from ${c.name}`}
                  className="flex size-5 cursor-pointer items-center justify-center rounded-full text-xs leading-none text-app-muted transition-colors hover:bg-app-border/40 hover:text-app-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span aria-hidden="true">×</span>
                </button>
              </span>
            ))
          )}
        </div>
        <p className="shrink-0 text-xs text-app-muted">Generated {formatDate(quiz.createdAt)}</p>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <span className="rounded-app-sm border border-app-border bg-app-surface px-2.5 py-1 font-mono text-xs tracking-[0.2em] text-app-foreground">
            {quiz.code}
          </span>
          <button type="button" onClick={() => void copy('code')} className={SMALL_BUTTON}>
            {copied === 'code' ? 'Copied' : copied === 'failed-code' ? 'Copy failed' : 'Copy code'}
          </button>
          <button type="button" onClick={() => void copy('link')} className={SMALL_BUTTON}>
            {copied === 'link' ? 'Copied' : copied === 'failed-link' ? 'Copy failed' : 'Copy link'}
          </button>
          <span className="sr-only" aria-live="polite">
            {copied === 'code' || copied === 'link' ? 'Copied' : copied ? 'Copy failed' : ''}
          </span>
        </div>

        {available.length > 0 ? (
          <div className="flex items-center gap-1.5">
            <select
              value={selectedClassId}
              disabled={busy}
              onChange={(e) => setSelectedClassId(e.target.value)}
              aria-label={`Class to post ${quiz.title} to`}
              className="rounded-app-sm border border-app-border bg-app-background px-2.5 py-1 text-xs text-app-foreground outline-none focus:border-app-accent focus:ring-2 focus:ring-app-accent/25 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="">Post to class…</option>
              {available.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={busy || !selectedClassId || !available.some((c) => c.id === selectedClassId)}
              onClick={() =>
                void change(async () => {
                  await postQuiz(quiz.id, selectedClassId)
                  setSelectedClassId('')
                })
              }
              className={SMALL_BUTTON}
            >
              Post
            </button>
          </div>
        ) : (
          <span className="text-xs text-app-muted">
            {allClasses.length === 0 ? 'Create a class to post this quiz.' : 'Posted to every class.'}
          </span>
        )}
      </div>

      {error && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  )
}
