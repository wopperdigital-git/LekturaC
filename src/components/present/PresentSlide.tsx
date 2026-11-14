import type { Card } from '@/engine/contentBlocks'
import type { TextStyle } from '@/engine/textStyle'
import { mergeTextStyle } from '@/engine/textStyle'
import { groundOf } from '@/engine/composition'
import { LayoutRenderer } from '@/components/layouts/LayoutRenderer'
import { SlideBody } from '@/components/layouts/SlideBody'
import { SlideSurface } from '@/components/theme/SlideSurface'
import { TextStyleScope } from '@/components/theme/TextStyleScope'

/**
 * One slide drawn the way the presenter, the projector window and the console
 * draw it. Callers provide the `ThemeProvider` and the scaling frame.
 */
export function PresentSlide({
  card,
  textStyle,
  isFirstCard,
}: {
  card: Card
  textStyle: TextStyle
  isFirstCard: boolean
}) {
  // The ground is read with the same first-card flag the layout is drawn with, so the two cannot disagree.
  const ground = groundOf({ ...card, orderIndex: isFirstCard ? 0 : Math.max(card.orderIndex, 1) })
  return (
    <TextStyleScope style={mergeTextStyle(textStyle, card.textStyle)}>
      <SlideSurface className="w-full rounded-slide shadow-slide-card" ground={ground}>
        {/* Provides the card width every stored element nudge is a fraction of,
            so every surface shows the same arrangement the editor does. */}
        <SlideBody card={card}>
          <LayoutRenderer card={card} context={{ isFirstCard }} />
        </SlideBody>
      </SlideSurface>
    </TextStyleScope>
  )
}
