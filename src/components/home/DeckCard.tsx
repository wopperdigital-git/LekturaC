import type { DeckSummary } from '@/store/presentationStore'
import { useNewItems } from '@/jobs/newItems'
import { NewDot } from '@/components/jobs/NewDot'
import { trackFill } from '@/components/ui/Programme'
import { deckTrack } from './deckSwatch'
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
      // A conference badge: punched lanyard slot, cover, the deck's track stripe,
      // then its name. It rests flat on the canvas and lifts on hover (only then
      // does it cast a shadow, as anything lifted does). No overflow-hidden: it
      // would clip the action menu's dropdown against the card's own bounds.
      className="group relative rounded-app border border-app-border bg-app-background transition-[transform,box-shadow,border-color] duration-200 ease-out hover:-translate-y-1 hover:border-app-foreground hover:shadow-app motion-reduce:hover:translate-y-0"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-2.5 left-1/2 z-10 h-2 w-10 -translate-x-1/2 rounded-full bg-app-canvas shadow-[inset_0_1px_2px_rgba(17,17,17,0.35)] ring-1 ring-app-foreground/40"
      />
      <button
        onClick={onOpen}
        className="block w-full cursor-pointer text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent"
      >
        {/* The cover is the deck's own first slide in the deck's own theme,
            so the grid is scannable by what a deck *is* rather than by the
            first letter of its title. `rounded-t-app` matches the card's own
            corners; the track stripe under it separates the slide from the
            title block, which a themed slide otherwise bleeds into. */}
        <DeckThumbnail deck={deck} className="aspect-video w-full rounded-t-app" />
        <div aria-hidden="true" className={`h-1.5 ${trackFill(deckTrack(deck.id))}`} />
        <div className="px-5 py-4">
          <div className="truncate font-bold text-app-foreground">{deck.title}</div>
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
