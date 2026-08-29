import { useLayoutEffect, useRef, useState } from 'react'
import type { DeckSummary } from '@/store/presentationStore'
import { ThemeProvider } from '@/components/theme/ThemeProvider'
import { SlideStage } from '@/components/theme/SlideStage'
import { SlideSurface } from '@/components/theme/SlideSurface'
import { TextStyleScope } from '@/components/theme/TextStyleScope'
import { SlideBody } from '@/components/layouts/SlideBody'
import { LayoutRenderer } from '@/components/layouts/LayoutRenderer'
import { mergeTextStyle } from '@/engine/textStyle'
import { deckSwatch } from './deckSwatch'

/*
  A deck's cover is its own first slide, rendered — the same trick the outline
  rail uses: the real `LayoutRenderer` output at full slide width inside an
  offscreen box, shrunk with a transform. Not a screenshot, so it cannot drift
  from the deck, and it needs no stored image, no capture step and no
  invalidation when the theme or the opening card changes.
*/
const BASE_WIDTH = 800
// Unlike the rail, this one *does* assume 16:9 — see the crop note below.
const BASE_HEIGHT = (BASE_WIDTH * 9) / 16

/**
 * The deck's opening slide, drawn in the deck's own theme.
 *
 * The frame is a fixed 16:9 and the slide is fitted to its *width*, so a card
 * taller than that is cropped at the bottom rather than shrunk to fit. That is
 * the opposite of the outline rail, deliberately: the rail is a map of the
 * whole deck and must show every card whole, while a dashboard cover is an
 * identity — a grid of tiles all the same size reads as a grid, and one deck
 * whose long first slide made its cover half the height of its neighbours' does
 * not. Cropping costs nothing here because nothing is legible at this size
 * anyway; recognisable is the entire job.
 *
 * Cards have no fixed aspect ratio (see `CardCanvas`) — that stays true. This
 * is a fixed *viewport onto* a card, not a card forced into a shape.
 */
export function DeckThumbnail({ deck, className = '' }: { deck: DeckSummary; className?: string }) {
  const frameRef = useRef<HTMLDivElement>(null)
  const [frameWidth, setFrameWidth] = useState(0)

  useLayoutEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    // Measured before paint, so the first frame is already at the right scale
    // instead of flashing an 800px slide inside a 360px tile.
    const measure = () => setFrameWidth(frame.clientWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(frame)
    return () => observer.disconnect()
  }, [])

  const cover = deck.cover
  if (!cover) return <SwatchCover deck={deck} className={className} />

  const scale = frameWidth > 0 ? frameWidth / BASE_WIDTH : 0

  return (
    <div ref={frameRef} className={`relative overflow-hidden bg-app-surface ${className}`}>
      {/*
        `aria-hidden`: the tile's accessible name is the deck title next to it,
        and a screen reader walking a whole slide's text per deck would bury it.
      */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 select-none">
        <div
          className="absolute top-0 left-0 origin-top-left"
          style={{ width: BASE_WIDTH, transform: `scale(${scale})` }}
        >
          <ThemeProvider theme={deck.theme}>
            {/* The stage's padding is what lets the theme's backdrop show around
                the card — without it every theme would look like its card
                colour and nothing else. `items-center` centres a short opening
                card (most hero cards are short) instead of stranding it at the
                top of the frame. */}
            <SlideStage
              className="flex w-full items-center justify-center p-10"
              style={{ minHeight: BASE_HEIGHT }}
            >
              {/* Same merge as the canvas and the rail, so a deck-wide or
                  per-card text override shows up on the cover too. */}
              <TextStyleScope style={mergeTextStyle(deck.textStyle, cover.textStyle)}>
                <SlideSurface className="w-full rounded-slide p-10 shadow-slide-card">
                  {/* `SlideBody` is what makes a nudged element sit where the
                      user put it here as well — it carries the card's width
                      into the coordinate space the nudges are stored in. */}
                  <SlideBody card={cover}>
                    <LayoutRenderer card={cover} context={{ isFirstCard: true }} />
                  </SlideBody>
                </SlideSurface>
              </TextStyleScope>
            </SlideStage>
          </ThemeProvider>
        </div>
      </div>
    </div>
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
