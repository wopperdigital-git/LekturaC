import type { ComponentType } from 'react'
import { resolveLayout, type LayoutContext } from '@/engine/layoutEngine'
import type { Card, ContentBlock, LayoutType, VisualStyle } from '@/engine/contentBlocks'
import { FlowLayout } from './FlowLayout'
import { StandardLayout } from './StandardLayout'
import { StandardSplitLayout } from './StandardSplitLayout'
import { HeroLayout } from './HeroLayout'
import { StatHeroLayout } from './StatHeroLayout'
import { IconGridLayout } from './IconGridLayout'
import { NumberedListLayout } from './NumberedListLayout'
import { QuoteLayout } from './QuoteLayout'
import { TextFocusLayout } from './TextFocusLayout'
import { GalleryLayout } from './GalleryLayout'

/*
  The layouts now drawn by `FlowLayout` rather than a component of their own.

  These are the "families" — layouts describing how a run of items looks. Each
  one moves here as its arrangement is ported into `GroupRenderer`, and its old
  component is deleted in the same change. The frames that describe a whole
  card (hero, statHero, quote, textFocus, standard, standardSplit) keep their
  components.

  `LAYOUT_COMPONENTS` below is typed to exclude exactly these names, so moving a
  layout into this list is a type error until its entry there is removed too.
*/
const FLOW_LAYOUTS = ['statGrid', 'timeline', 'comparison'] as const

type FlowLayoutName = (typeof FLOW_LAYOUTS)[number]

function rendersAsFlow(layout: Exclude<LayoutType, 'auto'>): layout is FlowLayoutName {
  return (FLOW_LAYOUTS as readonly string[]).includes(layout)
}

const LAYOUT_COMPONENTS: Record<
  Exclude<LayoutType, 'auto' | FlowLayoutName>,
  ComponentType<{ blocks: ContentBlock[]; variant: VisualStyle }>
> = {
  standard: StandardLayout,
  standardSplit: StandardSplitLayout,
  hero: HeroLayout,
  statHero: StatHeroLayout,
  iconGrid: IconGridLayout,
  numberedList: NumberedListLayout,
  quote: QuoteLayout,
  textFocus: TextFocusLayout,
  gallery: GalleryLayout,
}

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
  if (rendersAsFlow(resolved)) {
    return <FlowLayout blocks={card.blocks} variant={card.visualStyle} hint={card.layout} />
  }
  const Component = LAYOUT_COMPONENTS[resolved]
  return <Component blocks={card.blocks} variant={card.visualStyle} />
}
