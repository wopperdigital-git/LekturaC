import type { DeckSummary } from '@/store/presentationStore'
import { deckSwatch } from './deckSwatch'
import { DeckMenu } from './DeckMenu'
import { relativeUpdatedAt } from './relativeTime'

/** The `list` view's row — same data as `DeckCard`, laid out horizontally. */
export function DeckListRow({
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
    <div className="group flex items-center gap-3 rounded-app-sm px-2 py-2 transition-colors hover:bg-app-surface">
      <button
        onClick={onOpen}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-app-sm text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent"
      >
        <span
          aria-hidden="true"
          className="grid size-10 shrink-0 place-items-center rounded-app-sm text-lg font-semibold text-white/40"
          style={{ background: `linear-gradient(135deg, ${swatch.from}, ${swatch.to})` }}
        >
          {initial}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-app-foreground">{deck.title}</span>
          <span className="mt-0.5 block text-xs text-app-muted sm:hidden">
            {relativeUpdatedAt(deck.updatedAt)}
          </span>
        </span>
      </button>

      <span className="hidden shrink-0 text-xs text-app-muted sm:block">
        {relativeUpdatedAt(deck.updatedAt)}
      </span>

      <DeckMenu
        deckTitle={deck.title}
        onOpen={onOpen}
        onPresent={onPresent}
        onExport={onExport}
        onDelete={onDelete}
        exporting={exporting}
      />
    </div>
  )
}
