import type { ComponentType } from 'react'
import { accentOwner, groundOfLayout } from '@/engine/composition'
import { resolveLayout, type LayoutContext } from '@/engine/layoutEngine'
import type { Card, ContentBlock, LayoutType, VisualStyle } from '@/engine/contentBlocks'
import { FlowLayout } from './FlowLayout'
import { StandardLayout } from './StandardLayout'
import { StandardSplitLayout } from './StandardSplitLayout'
import { HeroLayout } from './HeroLayout'
import { StatHeroLayout } from './StatHeroLayout'
import { QuoteLayout } from './QuoteLayout'
import { TextFocusLayout } from './TextFocusLayout'
import { ImageFocusLayout } from './ImageFocusLayout'
import { SectionLayout } from './SectionLayout'
import { StatementLayout } from './StatementLayout'
import { TwoColumnLayout } from './TwoColumnLayout'
import { StatSplitLayout } from './StatSplitLayout'
import { PhotoListLayout } from './PhotoListLayout'
import { SlideFactsContext } from './slideFacts'

/*
  The layouts now drawn by `FlowLayout` rather than a component of their own.

  These are the "families" — layouts describing how a run of items looks. Each
  one moves here as its arrangement is ported into `GroupRenderer`, and its old
  component is deleted in the same change. The frames that describe a whole
  card (hero, statHero, quote, textFocus, standard, standardSplit, imageFocus) keep their
  components.

  `LAYOUT_COMPONENTS` below is typed to exclude exactly these names, so moving a
  layout into this list is a type error until its entry there is removed too.
*/
const FLOW_LAYOUTS = [
  'statGrid',
  'timeline',
  'comparison',
  'iconGrid',
  'numberedList',
  'checklist',
  'splitList',
  'statList',
  'timelineRow',
  'comparisonTable',
  'gallery',
  'steps',
  'beforeAfter',
  'termRows',
] as const

type FlowLayoutName = (typeof FLOW_LAYOUTS)[number]

function rendersAsFlow(layout: Exclude<LayoutType, 'auto'>): layout is FlowLayoutName {
  return (FLOW_LAYOUTS as readonly string[]).includes(layout)
}

const LAYOUT_COMPONENTS: Record<
  Exclude<LayoutType, 'auto' | FlowLayoutName>,
  ComponentType<{ blocks: ContentBlock[]; variant: VisualStyle; position: number }>
> = {
  standard: StandardLayout,
  standardSplit: StandardSplitLayout,
  imageFocus: ImageFocusLayout,
  hero: HeroLayout,
  statHero: StatHeroLayout,
  quote: QuoteLayout,
  textFocus: TextFocusLayout,
  section: SectionLayout,
  statement: StatementLayout,
  twoColumn: TwoColumnLayout,
  statSplit: StatSplitLayout,
  photoList: PhotoListLayout,
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
  /*
    A card with no blocks is a blank slide. Cards size to their content, so with
    nothing in it the surface would collapse to its padding — a thin strip that
    reads as a rendering fault rather than an empty slide, and is barely a target
    to click. A floor of height keeps it slide-shaped on every surface that draws
    a card: the canvas, the presenter, the thumbnails and the dashboard cover.
  */
  if (card.blocks.length === 0) return <div aria-hidden="true" className="my-auto min-h-64" />
  const resolved = resolveLayout(card.layout, card.blocks, context)
  // What the blocks drawn inside the frames need to know about their slide (see `slideFacts.ts`).
  const facts = { accentOwner: accentOwner(card.blocks, resolved), ground: groundOfLayout(resolved) }
  if (rendersAsFlow(resolved)) {
    return (
      <SlideFactsContext.Provider value={facts}>
        <FlowLayout blocks={card.blocks} variant={card.visualStyle} hint={card.layout} layout={resolved} />
      </SlideFactsContext.Provider>
    )
  }
  const Component = LAYOUT_COMPONENTS[resolved]
  // `position` is where the card sits in the deck: a split alternates its photo's side by it.
  return (
    <SlideFactsContext.Provider value={facts}>
      <Component blocks={card.blocks} variant={card.visualStyle} position={card.orderIndex} />
    </SlideFactsContext.Provider>
  )
}
