import { resolveLayout, type LayoutContext } from '@/engine/layoutEngine'
import type { Card } from '@/engine/contentBlocks'
import { StandardLayout } from './StandardLayout'
import { StandardSplitLayout } from './StandardSplitLayout'
import { HeroLayout } from './HeroLayout'
import { StatHeroLayout } from './StatHeroLayout'
import { StatGridLayout } from './StatGridLayout'
import { ComparisonLayout } from './ComparisonLayout'
import { TimelineLayout } from './TimelineLayout'
import { IconGridLayout } from './IconGridLayout'
import { NumberedListLayout } from './NumberedListLayout'
import { QuoteLayout } from './QuoteLayout'
import { TextFocusLayout } from './TextFocusLayout'
import { GalleryLayout } from './GalleryLayout'

const LAYOUT_COMPONENTS = {
  standard: StandardLayout,
  standardSplit: StandardSplitLayout,
  hero: HeroLayout,
  statHero: StatHeroLayout,
  statGrid: StatGridLayout,
  comparison: ComparisonLayout,
  timeline: TimelineLayout,
  iconGrid: IconGridLayout,
  numberedList: NumberedListLayout,
  quote: QuoteLayout,
  textFocus: TextFocusLayout,
  gallery: GalleryLayout,
} as const

/**
 * Draws one card's arrangement.
 *
 * Unchanged by element nudges, and that is the design: a nudge is a delta from
 * wherever this puts an element, applied afterwards by `Adjustable`, not a
 * replacement for the layout. So the classifier still runs for every card, an
 * untouched element is still placed entirely by its layout component, and
 * switching a card's layout variety re-arranges everything with the nudges
 * still riding on top.
 */
export function LayoutRenderer({ card, context }: { card: Card; context?: LayoutContext }) {
  const resolved = resolveLayout(card.layout, card.blocks, context)
  const Component = LAYOUT_COMPONENTS[resolved]
  return <Component blocks={card.blocks} variant={card.visualStyle} />
}

