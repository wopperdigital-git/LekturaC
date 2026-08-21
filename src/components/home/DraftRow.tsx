import { STEP_ORDER, answeredCount, draftTitle, type BriefDraft } from '@/lib/briefDrafts'
import { relativeSavedAt } from './relativeTime'

/**
 * One unfinished brief.
 *
 * Deliberately not a `DeckCard`/`DeckListRow` variant: a draft has no cards to
 * preview, no theme, and only one verb — Resume. Borrowing the deck chrome
 * would promise an Open and a Present that don't exist.
 */
export function DraftRow({
  draft,
  onResume,
  onDelete,
}: {
  draft: BriefDraft
  onResume: () => void
  onDelete: () => void
}) {
  const answered = answeredCount(draft.answers)
  const total = STEP_ORDER.length
  const title = draftTitle(draft)

  return (
    <div className="group flex items-center gap-3 rounded-app-sm px-2 py-2 transition-colors hover:bg-app-surface">
      <button
        onClick={onResume}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-app-sm text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent"
      >
        {/*
          A ring showing how far the brief got, rather than the deck rows'
          gradient initial — progress is the only thing a draft really has.
        */}
        <span
          aria-hidden="true"
          className="grid size-10 shrink-0 place-items-center rounded-full border-2 border-dashed border-app-border text-[11px] font-semibold text-app-muted"
        >
          {answered}/{total}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-app-foreground">{title}</span>
          <span className="mt-0.5 block text-xs text-app-muted">
            {answered === total
              ? 'Ready to generate'
              : `${answered} of ${total} questions answered`}
            <span className="sm:hidden"> · {relativeSavedAt(draft.savedAt)}</span>
          </span>
        </span>
      </button>

      <span className="hidden shrink-0 text-xs text-app-muted sm:block">
        {relativeSavedAt(draft.savedAt)}
      </span>

      <button
        onClick={onResume}
        className="hidden shrink-0 cursor-pointer rounded-app-sm border border-app-border bg-app-background px-3 py-1.5 text-xs font-medium text-app-foreground transition-colors hover:bg-app-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent sm:block"
      >
        Resume
      </button>

      <button
        onClick={onDelete}
        aria-label={`Delete draft "${title}"`}
        title="Delete"
        className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-app-sm text-app-muted transition-[opacity,color] duration-150 hover:text-red-600 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
      >
        <svg
          className="size-4"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M2.5 4h11" />
          <path d="M5.5 4V2.75c0-.55.45-1 1-1h3c.55 0 1 .45 1 1V4" />
          <path d="M6.25 7.25v4.5M9.75 7.25v4.5" />
          <path d="M3.5 4l.6 8.4c.05.6.55 1.1 1.15 1.1h5.5c.6 0 1.1-.5 1.15-1.1l.6-8.4" />
        </svg>
      </button>
    </div>
  )
}
