import { useLayoutEffect, useRef, useState } from 'react'
import type { Card } from '@/engine/contentBlocks'
import { mergeTextStyle, type TextStyle } from '@/engine/textStyle'
import { groundOf } from '@/engine/composition'
import type { ThemeTokens } from '@/lib/theme-tokens'
import { ThemeProvider } from '@/components/theme/ThemeProvider'
import { SlideStage } from '@/components/theme/SlideStage'
import { SlideSurface } from '@/components/theme/SlideSurface'
import { TextStyleScope } from '@/components/theme/TextStyleScope'
import { SlideBody } from '@/components/layouts/SlideBody'
import { LayoutRenderer } from '@/components/layouts/LayoutRenderer'
import { SLIDE_WIDTH_PX } from '@/lib/slideSize'

/*
  One card, drawn for real and shrunk: the actual `LayoutRenderer` output at full
  slide width inside an offscreen box, scaled down with a transform. Not a
  screenshot, so it cannot drift from the card, and it needs no stored image, no
  capture step and no invalidation when the theme or the content changes.

  It is the one implementation behind the dashboard's deck covers and the
  editor's layout picker, so both show a slide exactly as the canvas would.
*/
/** The stage's side padding around the card (`px-10`), either side; the vertical padding is computed below. */
const STAGE_PADDING_PX = 40
// The card at the editor's own width, with the stage around it: text wraps as it does on the canvas.
const BASE_WIDTH = SLIDE_WIDTH_PX + 2 * STAGE_PADDING_PX
// Unlike the outline rail, this assumes 16:9 — see the crop note below.
const BASE_HEIGHT = (BASE_WIDTH * 9) / 16
// The card is itself a 16:9 floor (`SlideSurface`), so with the stage's full
// `p-10` above and below it a short slide is taller than this frame and the
// frame would crop its bottom margin. Trimming the stage's vertical padding to
// what is left over keeps a short card centred, margins equal, in the frame.
const STAGE_PADDING_Y_PX = (BASE_HEIGHT - (SLIDE_WIDTH_PX * 9) / 16) / 2

/**
 * A card in the given theme, fitted to its container's *width* inside a fixed
 * 16:9 frame.
 *
 * A card taller than that is cropped at the bottom rather than shrunk to fit. That
 * is deliberate: the outline rail is a map of the whole deck and must show every
 * card whole, while a cover or a picker option is an identity — a row of tiles all
 * the same size reads as a row, and nothing is legible at this size anyway.
 * A card is a 16:9 floor that grows with its content (`SlideSurface`); this is a
 * fixed *viewport onto* one, not a card forced into a shape.
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
    // instead of flashing a full-size slide inside a small tile.
    const measure = () => setFrameWidth(frame.clientWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(frame)
    return () => observer.disconnect()
  }, [])

  const scale = frameWidth > 0 ? frameWidth / BASE_WIDTH : 0
  // The ground is read with the same first-card flag the layout is drawn with, so the two cannot disagree.
  const ground = groundOf(card, { isFirstCard })

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
              className="flex w-full items-center justify-center px-10"
              style={{ minHeight: BASE_HEIGHT, paddingBlock: STAGE_PADDING_Y_PX }}
            >
              <TextStyleScope style={mergeTextStyle(textStyle, card.textStyle)}>
                <SlideSurface padding="roomy" className="w-full rounded-slide shadow-slide-card" ground={ground}>
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
