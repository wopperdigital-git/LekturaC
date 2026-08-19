import type { CSSProperties } from 'react'
import type { DeckSummary } from '@/store/presentationStore'
import { deckSwatch } from './deckSwatch'
import { relativeUpdatedAt } from './relativeTime'

export function DeckCard({
  deck,
  onOpen,
  onDelete,
}: {
  deck: DeckSummary
  onOpen: () => void
  onDelete: () => void
}) {
  const swatch = deckSwatch(deck.id)
  const initial = deck.title.trim().charAt(0).toUpperCase() || '?'

  return (
    <div
      // the ring color tracks each card's own swatch, so hover reinforces that card's identity
      style={{ '--card-ring': swatch.from } as CSSProperties}
      // sits inside the dashboard panel, so it leans on a border rather than the
      // full shadow-app — the deep shadow reads as card-in-card against the panel
      className="group relative overflow-hidden rounded-app border border-app-border bg-app-background shadow-sm outline outline-2 outline-offset-2 outline-transparent transition-[transform,box-shadow,outline-color] duration-150 hover:-translate-y-0.5 hover:shadow-app hover:outline-[var(--card-ring)]"
    >
      <button
        onClick={onOpen}
        className="block w-full cursor-pointer text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent"
      >
        <div
          className="relative flex h-28 items-center justify-center overflow-hidden"
          style={{ background: `linear-gradient(135deg, ${swatch.from}, ${swatch.to})` }}
        >
          <span
            aria-hidden="true"
            className="text-6xl leading-none font-semibold text-white/25 select-none"
          >
            {initial}
          </span>
        </div>
        <div className="px-5 py-4">
          <div className="truncate font-medium text-app-foreground">{deck.title}</div>
          <div className="mt-1 text-xs text-app-muted">{relativeUpdatedAt(deck.updatedAt)}</div>
        </div>
      </button>

      <button
        onClick={onDelete}
        aria-label={`Delete "${deck.title}"`}
        title="Delete"
        className="absolute top-3 right-3 flex size-8 cursor-pointer items-center justify-center rounded-full bg-black/25 text-white opacity-100 backdrop-blur-sm transition-opacity duration-150 hover:bg-black/40 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
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
