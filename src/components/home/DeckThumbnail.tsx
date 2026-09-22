import type { DeckSummary } from '@/store/presentationStore'
import { SlidePreview } from '@/components/editor/SlidePreview'
import { deckSwatch } from './deckSwatch'

/**
 * A deck's cover is its own first slide, rendered in the deck's own theme — see
 * `SlidePreview` for how, and for why it is cropped rather than shrunk. Never a
 * stored screenshot, so it cannot drift from the deck.
 */
export function DeckThumbnail({ deck, className = '' }: { deck: DeckSummary; className?: string }) {
  if (!deck.cover) return <SwatchCover deck={deck} className={className} />
  return (
    <SlidePreview
      card={deck.cover}
      theme={deck.theme}
      textStyle={deck.textStyle}
      isFirstCard
      className={className}
    />
  )
}

/**
 * The cover for a deck with no cards — the "skip and start blank" escape hatch,
 * before anything has been written. Keeps the lettered gradient the whole grid
 * used to use, so an empty deck still reads as a deck rather than a hole.
 */
function SwatchCover({ deck, className }: { deck: DeckSummary; className: string }) {
  const swatch = deckSwatch(deck.id)
  const initial = deck.title.trim().charAt(0).toUpperCase() || '?'

  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden ${className}`}
      style={{ background: `linear-gradient(135deg, ${swatch.from}, ${swatch.to})` }}
    >
      <span aria-hidden="true" className="text-6xl leading-none font-semibold text-white/25 select-none">
        {initial}
      </span>
    </div>
  )
}
