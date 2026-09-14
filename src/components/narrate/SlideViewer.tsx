import { usePresentationStore } from '@/store/presentationStore'
import { LayoutRenderer } from '@/components/layouts/LayoutRenderer'
import { SlideBody } from '@/components/layouts/SlideBody'
import { SlideSurface } from '@/components/theme/SlideSurface'
import { TextStyleScope } from '@/components/theme/TextStyleScope'
import { mergeTextStyle } from '@/engine/textStyle'
import type { Card } from '@/engine/contentBlocks'

/**
 * One slide, rendered exactly as the editor and presenter draw it, and inert.
 *
 * Read-only is achieved by OMISSION, not by a `readOnly` prop threaded through
 * twelve layout components. Typing needs `TextEditingContext` and selection
 * boxes need the interaction half of `BlockAdjustContext`; neither is provided
 * here, so every layout renders its normal output with nothing to grab.
 *
 * `SlideBody` is still required: it provides `BlockDataContext`, the DATA half,
 * which is what makes stored element nudges and bold marks render at all.
 * Dropping it would show the narration viewer a different slide than the one
 * the user arranged.
 */
export function SlideViewer({ card, isFirstCard }: { card: Card; isFirstCard: boolean }) {
  const deckTextStyle = usePresentationStore((s) => s.textStyle)

  return (
    <TextStyleScope style={mergeTextStyle(deckTextStyle, card.textStyle)}>
      {/* No `max-w-*` here: `SlideCanvas` owns the width, laying the slide out
          once at a fixed natural size and scaling the result. A cap would leave
          dead space inside the measured box and shrink the card further than it
          needs to be. */}
      <SlideSurface className="w-full rounded-slide p-10 shadow-slide-card">
        <SlideBody card={card}>
          <LayoutRenderer card={card} context={{ isFirstCard }} />
        </SlideBody>
      </SlideSurface>
    </TextStyleScope>
  )
}
