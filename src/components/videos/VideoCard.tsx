import type { DeckSummary } from '@/store/presentationStore'
import type { VideoRecord } from '@/video/videoRecord'
import { videoLength } from '@/video/library'
import { useNewItems } from '@/jobs/newItems'
import { NewDot } from '@/components/jobs/NewDot'
import { trackFill } from '@/components/ui/Programme'
import { deckTrack } from '@/components/home/deckSwatch'
import { DeckThumbnail } from '@/components/home/DeckThumbnail'
import { relativeMadeAt } from '@/components/home/relativeTime'

/**
 * One narrated video, drawn as the deck's badge (DeckCard's slot, cover and track stripe) so a
 * video and its deck read as the same session. The cover is the deck's first slide, which is also
 * the video's first frame; the play disc and running time say it is a video, not the deck.
 *
 * Pressing the cover plays it. Opening the deck is a separate, smaller action in the body: it
 * leaves the page, so it is never what a press on the picture does.
 */
export function VideoCard({
  deck,
  record,
  onPlay,
  onOpenDeck,
}: {
  deck: DeckSummary
  record: VideoRecord
  onPlay: () => void
  onOpenDeck: () => void
}) {
  // Only the video's dot: a new deck or quiz on the same deck is the dashboard's to show.
  const isNew = useNewItems(deck.id).includes('video')
  const length = videoLength(record.durationSeconds)

  return (
    <div className="group relative rounded-app border border-app-border bg-app-background transition-[transform,box-shadow,border-color] duration-200 ease-out hover:-translate-y-1 hover:border-app-foreground hover:shadow-app motion-reduce:hover:translate-y-0">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-2.5 left-1/2 z-10 h-2 w-10 -translate-x-1/2 rounded-full bg-app-canvas shadow-[inset_0_1px_2px_rgba(17,17,17,0.35)] ring-1 ring-app-foreground/40"
      />
      <button
        type="button"
        onClick={onPlay}
        aria-label={`Play the video of ${deck.title} (${length})`}
        className="relative block w-full cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent"
      >
        <DeckThumbnail deck={deck} className="aspect-video w-full rounded-t-app" />
        <span aria-hidden="true" className="absolute inset-0 grid place-items-center">
          <span className="grid size-14 place-items-center rounded-full bg-app-foreground text-app-background shadow-app transition-transform duration-200 group-hover:scale-105 motion-reduce:group-hover:scale-100">
            <svg viewBox="0 0 20 20" className="ml-0.5 size-6" fill="currentColor">
              <path d="M6 4.2v11.6a.6.6 0 0 0 .9.5l9.3-5.8a.6.6 0 0 0 0-1L6.9 3.7a.6.6 0 0 0-.9.5Z" />
            </svg>
          </span>
        </span>
        <span
          aria-hidden="true"
          className="absolute right-2.5 bottom-2.5 rounded-[4px] bg-app-foreground px-1.5 py-0.5 text-xs font-bold text-app-background tabular-nums"
        >
          {length}
        </span>
      </button>
      <div aria-hidden="true" className={`h-1.5 ${trackFill(deckTrack(deck.id))}`} />
      <div className="flex items-start justify-between gap-3 px-5 py-4">
        <div className="min-w-0">
          <div className="truncate font-bold text-app-foreground">{deck.title}</div>
          <div className="mt-1 text-xs text-app-muted">{relativeMadeAt(record.generatedAt)}</div>
        </div>
        <button
          type="button"
          onClick={onOpenDeck}
          aria-label={`Open the deck ${deck.title}`}
          className="shrink-0 cursor-pointer rounded-app-sm px-2 py-1 text-sm font-semibold text-app-accent-text transition-colors hover:bg-app-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent"
        >
          Open deck
        </button>
      </div>
      {isNew && <NewDot kinds={['video']} className="pointer-events-none absolute -top-1 -right-1 z-10" />}
    </div>
  )
}
