import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatDate } from '@/classroom/format'
import { formatSlideRange } from '@/classroom/slideRange'
import type { ClassRoom, QuizSummary } from '@/classroom/types'
import { postQuiz, unpostQuiz } from '@/quiz/api'
import { describeError } from '@/store/presentationStore'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { DeleteQuizConfirm } from '@/components/quiz/DeleteQuizConfirm'

type Copied = 'code' | 'link' | null
type CopyState = Copied | 'failed-code' | 'failed-link'

/**
 * Executive Assessment Card.
 * Displays quiz source slides, voucher share codes, assigned classrooms,
 * and allows instant class posting, link copying and deleting.
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
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(null), 1800)
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

  const postOptions = available.map((c) => ({
    value: c.id,
    label: c.name,
    icon: (
      <svg className="size-3.5 shrink-0 text-app-muted" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
        <path d="M8 1.5l6.5 3.5L8 8.5 1.5 5 8 1.5z" />
        <path d="M3.5 7.5v4c0 1.2 2 2.5 4.5 2.5s4.5-1.3 4.5-2.5v-4L8 10 3.5 7.5z" opacity="0.75" />
      </svg>
    ),
  }))

  return (
    <div className="group/quiz relative rounded-app border border-app-border bg-app-background shadow-xs transition-all duration-200 hover:border-app-accent/30 hover:shadow-sm">
      {/* Main Card Body */}
      <div className="flex flex-col gap-3.5 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          {/* Quiz Header & Attribution */}
          <div className="flex items-start gap-3.5 min-w-0 flex-1">
            <div
              aria-hidden="true"
              className="grid size-11 shrink-0 place-items-center rounded-xl border border-app-accent/20 bg-app-accent/10 text-app-accent shadow-2xs"
            >
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
            </div>

            <div className="min-w-0 flex-1">
              <h3 className="truncate text-base font-semibold tracking-tight text-app-foreground">
                {quiz.title}
              </h3>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-app-muted">
                <span>From</span>
                {quiz.presentationId ? (
                  <Link
                    to={`/deck/${quiz.presentationId}`}
                    className="inline-flex items-center gap-1 font-medium text-app-accent-text hover:underline"
                  >
                    <span>{quiz.deckTitle}</span>
                  </Link>
                ) : (
                  <span className="font-medium text-app-foreground">
                    {quiz.deckTitle} <span className="text-app-muted/80">(deck deleted)</span>
                  </span>
                )}
                {slides && (
                  <span className="inline-flex items-center rounded-full border border-app-border bg-app-surface/60 px-2 py-0.5 font-mono text-[11px] font-medium text-app-muted">
                    Slides {slides}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Right Status Badge & Creation Date */}
          <div className="flex flex-col items-start gap-1 sm:items-end shrink-0">
            {postedIn.length === 0 ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                <span className="size-1.5 rounded-full bg-amber-500" aria-hidden="true" />
                <span>Draft · Not posted</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                <span>Active in {postedIn.length} {postedIn.length === 1 ? 'class' : 'classes'}</span>
              </span>
            )}
            <span className="text-[11px] text-app-muted">
              Generated {formatDate(quiz.createdAt)}
            </span>
          </div>
        </div>

        {/* Assigned Classrooms Strip */}
        {postedIn.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-app-muted mr-1">
              Classrooms:
            </span>
            {postedIn.map((c) => (
              <span
                key={c.id}
                className="group/chip inline-flex items-center gap-1.5 rounded-full border border-app-accent/25 bg-app-accent/8 py-0.5 pr-1 pl-2.5 text-[11px] font-medium text-app-accent-text"
              >
                <svg className="size-3 shrink-0" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                  <path d="M8 1.5l6.5 3.5L8 8.5 1.5 5 8 1.5z" />
                  <path d="M3.5 7.5v4c0 1.2 2 2.5 4.5 2.5s4.5-1.3 4.5-2.5v-4L8 10 3.5 7.5z" opacity="0.75" />
                </svg>
                <span className="max-w-[12rem] truncate">{c.name}</span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void change(() => unpostQuiz(quiz.id, c.id))}
                  aria-label={`Unpost from ${c.name}`}
                  title={`Unpost from ${c.name}`}
                  className="grid size-4 cursor-pointer place-items-center rounded-full text-app-accent-text/60 transition-colors hover:bg-app-accent/20 hover:text-app-accent-text focus-visible:outline-2 focus-visible:outline-app-accent disabled:cursor-not-allowed"
                >
                  <svg
                    className="size-2.5"
                    viewBox="0 0 10 10"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    <path d="M2 2l6 6M8 2l-6 6" />
                  </svg>
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Tactile Action & Distribution Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-b-[calc(var(--app-radius)-1px)] border-t border-app-border/70 bg-app-surface/30 px-4 py-3 sm:px-5">
        {/* Left: Code Voucher & Share Links */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Monospace Code Voucher */}
          <div className="flex items-center gap-1.5 rounded-app-sm border border-app-border bg-app-surface/80 px-2.5 py-1 shadow-2xs">
            <svg
              className="size-3.5 text-app-accent"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              aria-hidden="true"
            >
              <rect x="3" y="2" width="10" height="12" rx="1.5" />
              <path d="M5.5 6l1 1 2-2M5.5 10.5l1 1 2-2M10 6.2h.5M10 10.7h.5" />
            </svg>
            <span className="font-mono text-xs font-bold tracking-[0.22em] text-app-foreground uppercase">
              {quiz.code}
            </span>
          </div>

          {/* Copy Code Button */}
          <button
            type="button"
            onClick={() => void copy('code')}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-app-sm border border-app-border bg-app-surface px-2.5 py-1 text-xs font-medium text-app-foreground transition-all hover:bg-app-border/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent"
            title="Copy quiz code for students"
          >
            {copied === 'code' ? (
              <>
                <svg className="size-3 text-emerald-600 dark:text-emerald-400" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M2 6l3 3 5-5" />
                </svg>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">Code copied</span>
              </>
            ) : (
              <>
                <svg className="size-3 text-app-muted" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
                  <rect x="5" y="5" width="9" height="9" rx="1.5" />
                  <path d="M3 11V3a1.5 1.5 0 011.5-1.5h8" />
                </svg>
                <span>Copy code</span>
              </>
            )}
          </button>

          {/* Copy Direct Link Button */}
          <button
            type="button"
            onClick={() => void copy('link')}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-app-sm border border-app-border bg-app-surface px-2.5 py-1 text-xs font-medium text-app-foreground transition-all hover:bg-app-border/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent"
            title="Copy direct quiz URL"
          >
            {copied === 'link' ? (
              <>
                <svg className="size-3 text-emerald-600 dark:text-emerald-400" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M2 6l3 3 5-5" />
                </svg>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">Link copied</span>
              </>
            ) : (
              <>
                <svg className="size-3 text-app-muted" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
                  <path d="M6.5 9.5l3-3M7 5l1.5-1.5a3 3 0 114.2 4.2L11.2 9M9 11l-1.5 1.5a3 3 0 11-4.2-4.2L4.8 7" />
                </svg>
                <span>Copy link</span>
              </>
            )}
          </button>
        </div>

        {/* Right: Custom Select Post to Class, then Delete */}
        <div className="flex flex-wrap items-center gap-2">
          {available.length > 0 ? (
            <div className="flex items-center gap-2">
              <Select
                value={selectedClassId}
                onChange={(v) => setSelectedClassId(v)}
                options={postOptions}
                placeholder="Post to class…"
                ariaLabel={`Class to post ${quiz.title} to`}
                disabled={busy}
                size="sm"
                align="right"
                className="w-48"
              />
              <Button
                type="button"
                disabled={busy || !selectedClassId || !available.some((c) => c.id === selectedClassId)}
                onClick={() =>
                  void change(async () => {
                    await postQuiz(quiz.id, selectedClassId)
                    setSelectedClassId('')
                  })
                }
                loading={busy}
                variant="primary"
                className="gap-1.5 px-3 py-1 text-xs font-semibold"
              >
                <span>Post</span>
                <span aria-hidden="true">→</span>
              </Button>
            </div>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs text-app-muted">
              <svg className="size-3.5 text-emerald-600 dark:text-emerald-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="8" cy="8" r="6" />
                <path d="M5.5 8l2 2 3.5-3.5" />
              </svg>
              <span>{allClasses.length === 0 ? 'Create a class to assign this quiz' : 'Posted to every classroom'}</span>
            </span>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirmingDelete(true)}
            aria-label={`Delete ${quiz.title}`}
            title="Delete quiz"
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-app-sm px-2.5 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-500/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent disabled:cursor-not-allowed disabled:opacity-50 dark:text-red-400"
          >
            <svg className="size-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
              <path d="M2.5 4h11M6.5 4V2.5h3V4M4 4l.7 9.5h6.6L12 4" />
            </svg>
            <span>Delete</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="border-t border-red-500/20 bg-red-500/5 px-4 py-2 text-xs font-medium text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {confirmingDelete && (
        <DeleteQuizConfirm
          quiz={quiz}
          onCancel={() => setConfirmingDelete(false)}
          onDeleted={() => {
            setConfirmingDelete(false)
            onChanged()
          }}
        />
      )}
    </div>
  )
}
