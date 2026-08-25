import type { CSSProperties } from 'react'
import type { DeckSummary } from '@/store/presentationStore'
import { deckSwatch } from './deckSwatch'
import { DeckMenu } from './DeckMenu'
import { relativeUpdatedAt } from './relativeTime'

export function DeckCard({
  deck,
  onOpen,
  onPresent,
  onExport,
  onDelete,
  exporting,
}: {
  deck: DeckSummary
  onOpen: () => void
  onPresent: () => void
  onExport: () => void
  onDelete: () => void
  exporting: boolean
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

      <DeckMenu
        deckTitle={deck.title}
        onOpen={onOpen}
        onPresent={onPresent}
        onExport={onExport}
        onDelete={onDelete}
        exporting={exporting}
        onDark
        className="absolute top-3 right-3 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
      />
    </div>
  )
}
