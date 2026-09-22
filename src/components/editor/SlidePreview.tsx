import { useLayoutEffect, useRef, useState } from 'react'
import type { Card } from '@/engine/contentBlocks'
import { mergeTextStyle, type TextStyle } from '@/engine/textStyle'
import type { ThemeTokens } from '@/lib/theme-tokens'
import { ThemeProvider } from '@/components/theme/ThemeProvider'
import { SlideStage } from '@/components/theme/SlideStage'
import { SlideSurface } from '@/components/theme/SlideSurface'
import { TextStyleScope } from '@/components/theme/TextStyleScope'
import { SlideBody } from '@/components/layouts/SlideBody'
import { LayoutRenderer } from '@/components/layouts/LayoutRenderer'

/*
  One card, drawn for real and shrunk: the actual `LayoutRenderer` output at full
  slide width inside an offscreen box, scaled down with a transform. Not a
  screenshot, so it cannot drift from the card, and it needs no stored image, no
  capture step and no invalidation when the theme or the content changes.

  It is the one implementation behind the dashboard's deck covers and the
  editor's layout picker, so both show a slide exactly as the canvas would.
*/
const BASE_WIDTH = 800
// Unlike the outline rail, this assumes 16:9 — see the crop note below.
const BASE_HEIGHT = (BASE_WIDTH * 9) / 16

/**
 * A card in the given theme, fitted to its container's *width* inside a fixed
 * 16:9 frame.
 *
 * A card taller than that is cropped at the bottom rather than shrunk to fit. That
 * is deliberate: the outline rail is a map of the whole deck and must show every
 * card whole, while a cover or a picker option is an identity — a row of tiles all
 * the same size reads as a row, and nothing is legible at this size anyway.
 * Cards still have no aspect ratio of their own; this is a fixed *viewport onto*
 * one, not a card forced into a shape.
 */
export function SlidePreview({
  card,
  theme,
  textStyle,
  isFirstCard = false,
  className = '',
}: {
  card: Card
  theme: ThemeTokens
  /** The deck's text overrides, merged with the card's own before rendering. */
  textStyle: TextStyle
  isFirstCard?: boolean
  className?: string
}) {
  const frameRef = useRef<HTMLDivElement>(null)
  const [frameWidth, setFrameWidth] = useState(0)

  useLayoutEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    // Measured before paint, so the first frame is already at the right scale
    // instead of flashing an 800px slide inside a small tile.
    const measure = () => setFrameWidth(frame.clientWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(frame)
    return () => observer.disconnect()
  }, [])

  const scale = frameWidth > 0 ? frameWidth / BASE_WIDTH : 0

  return (
    <div ref={frameRef} className={`relative overflow-hidden bg-app-surface ${className}`}>
      {/*
        `aria-hidden`: whatever labels this preview is next to it, and a screen
        reader walking a whole slide's text per tile would bury it.
      */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 select-none">
        <div
          className="absolute top-0 left-0 origin-top-left"
          style={{ width: BASE_WIDTH, transform: `scale(${scale})` }}
        >
          <ThemeProvider theme={theme}>
            {/* The stage's padding is what lets the theme's backdrop show around
                the card — without it every theme would look like its card
                colour and nothing else. `items-center` centres a short card
                instead of stranding it at the top of the frame. */}
            <SlideStage
              className="flex w-full items-center justify-center p-10"
              style={{ minHeight: BASE_HEIGHT }}
            >
              <TextStyleScope style={mergeTextStyle(textStyle, card.textStyle)}>
                <SlideSurface className="w-full rounded-slide p-10 shadow-slide-card">
                  {/* `SlideBody` is what makes a nudged element sit where the
                      user put it here as well — it carries the card's width
                      into the coordinate space the nudges are stored in. */}
                  <SlideBody card={card}>
                    <LayoutRenderer card={card} context={{ isFirstCard }} />
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
