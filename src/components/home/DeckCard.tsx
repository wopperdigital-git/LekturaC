import type { DeckSummary } from '@/store/presentationStore'
import { useNewItems } from '@/jobs/newItems'
import { NewDot } from '@/components/jobs/NewDot'
import { DeckMenu } from './DeckMenu'
import { DeckThumbnail } from './DeckThumbnail'
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
  const newKinds = useNewItems(deck.id)

  return (
    <div
      // a hairline frame on the canvas, no shadow (only what floats casts one);
      // hover rules the frame in ink. No overflow-hidden: it would clip the
      // action menu's dropdown against the card's own bounds.
      className="group relative rounded-app border border-app-border bg-app-background transition-colors duration-150 hover:border-app-foreground"
    >
      <button
        onClick={onOpen}
        className="block w-full cursor-pointer text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent"
      >
        {/* The cover is the deck's own first slide in the deck's own theme,
            so the grid is scannable by what a deck *is* rather than by the
            first letter of its title. `rounded-t-app` matches the card's own
            corners; the border under it separates the slide from the title
            block, which a themed slide otherwise bleeds into. */}
        <DeckThumbnail deck={deck} className="aspect-video w-full rounded-t-app border-b border-app-border" />
        <div className="px-5 py-4">
          <div className="truncate font-medium text-app-foreground">{deck.title}</div>
          <div className="mt-1 text-xs text-app-muted">{relativeUpdatedAt(deck.updatedAt)}</div>
        </div>
      </button>

      {/*
        Positioned by a wrapper rather than by a class on DeckMenu itself:
        DeckMenu's root already carries `relative` (it anchors the dropdown), and
        Tailwind emits `.relative` after `.absolute`, so an `absolute` passed in
        through className loses and the trigger drops back into the card's flow.
      */}
      <div className="absolute top-3 right-3 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
        <DeckMenu
          deckTitle={deck.title}
          onOpen={onOpen}
          onPresent={onPresent}
          onExport={onExport}
          onDelete={onDelete}
          exporting={exporting}
          onDark
        />
      </div>
      <NewDot kinds={newKinds} className="pointer-events-none absolute -top-1 -right-1 z-10" />
    </div>
  )
}
