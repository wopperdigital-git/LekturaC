import { blocksOfType, type ContentBlock, type LayoutType, type VisualStyle } from './contentBlocks'

const SHORT_ITEM_MAX_CHARS = 40

/**
 * Rule-based classifier: inspects what a card's content actually is and
 * picks the layout that best presents it. Mirrors Gamma's "AI picks a
 * layout per card based on content type" behavior, minus the LLM call —
 * this runs synchronously and deterministically so cards render instantly
 * and stay stable across re-renders.
 */
export interface LayoutContext {
  /** The opening card gets a shot at the cinematic title treatment instead of the plain fallback. */
  isFirstCard?: boolean
}

export function chooseLayout(blocks: ContentBlock[], context: LayoutContext = {}): LayoutType {
  const stats = blocksOfType(blocks, 'stat')
  const comparisonGroups = blocksOfType(blocks, 'comparisonGroup')
  const timelineSteps = blocksOfType(blocks, 'timelineStep')
  const bulletLists = blocksOfType(blocks, 'bulletList')
  const images = blocksOfType(blocks, 'image')
  const paragraphs = blocksOfType(blocks, 'paragraph')
  const headings = blocksOfType(blocks, 'heading')
  const quotes = blocksOfType(blocks, 'quote')

  if (
    context.isFirstCard &&
    headings.length === 1 &&
    blocks.length <= 2 &&
    stats.length === 0 &&
    comparisonGroups.length === 0 &&
    timelineSteps.length === 0 &&
    bulletLists.length === 0 &&
    images.length === 0
  ) {
    return 'hero'
  }

  if (stats.length === 1 && comparisonGroups.length === 0 && timelineSteps.length === 0) {
    return 'statHero'
  }

  if (stats.length >= 2 && stats.length <= 4 && comparisonGroups.length === 0 && timelineSteps.length === 0) {
    return 'statGrid'
  }

  if (comparisonGroups.length >= 2 && comparisonGroups.length <= 4) {
    return 'comparison'
  }

  if (timelineSteps.length >= 2) {
    return 'timeline'
  }

  if (
    quotes.length === 1 &&
    bulletLists.length === 0 &&
    stats.length === 0 &&
    images.length === 0 &&
    paragraphs.length <= 1
  ) {
    return 'quote'
  }

  if (
    bulletLists.length === 1 &&
    bulletLists[0].items.length <= 6 &&
    bulletLists[0].items.every((item) => item.length <= SHORT_ITEM_MAX_CHARS) &&
    images.length === 0
  ) {
    return 'iconGrid'
  }

  if (images.length >= 2 && paragraphs.length === 0) {
    return 'gallery'
  }

  if (headings.length >= 1 && paragraphs.length >= 1 && images.length === 1) {
    return 'standardSplit'
  }

  // A single bullet list that didn't qualify for the compact icon grid above
  // (too many items, or items too long to read as short chips) still deserves
  // its own clean treatment rather than falling into the generic slab.
  if (bulletLists.length === 1 && stats.length === 0 && quotes.length === 0 && images.length === 0) {
    return 'numberedList'
  }

  if (
    paragraphs.length >= 2 &&
    bulletLists.length === 0 &&
    stats.length === 0 &&
    quotes.length === 0 &&
    images.length === 0
  ) {
    return 'textFocus'
  }

  return 'standard'
}

/** Resolves a card's effective layout: an explicit override wins, 'auto' defers to the classifier. */
export function resolveLayout(
  layout: LayoutType,
  blocks: ContentBlock[],
  context: LayoutContext = {},
): Exclude<LayoutType, 'auto'> {
  const resolved = layout === 'auto' ? chooseLayout(blocks, context) : layout
  return resolved as Exclude<LayoutType, 'auto'>
}

/*
  What the Level 2 layout picker offers for a card.

  The rule, and the reason this replaced an earlier cross-type version: a user
  picking a layout is choosing a *variety of their card's own type*, never a
  different type. A bullet-list card offers list treatments; it does not offer
  "standard" or "quote", because switching a list into a quote layout is not a
  restyle, it is a different kind of slide.

  A variety is a (layout component, visual treatment) pair. Most types map to a
  single component, so the two hand-designed treatments each component already
  carries — `visualStyle`, chosen by the AI at generation time — are what supply
  the variation. Types with two sensible components (a list can be an icon grid
  or a numbered list) get both, times two treatments.
*/

/** A coarse content family. Determines which layouts a card may be switched between. */
export type CardKind =
  | 'title'
  | 'stats'
  | 'comparison'
  | 'timeline'
  | 'quote'
  | 'list'
  | 'gallery'
  | 'text'

const CARD_KIND_LABELS: Record<CardKind, string> = {
  title: 'Title',
  stats: 'Statistics',
  comparison: 'Comparison',
  timeline: 'Timeline',
  quote: 'Quote',
  list: 'List',
  gallery: 'Gallery',
  text: 'Text',
}

export function cardKindLabel(kind: CardKind): string {
  return CARD_KIND_LABELS[kind]
}

/**
 * The card's content family. Checked in the same priority order the classifier
 * uses, so the label a user sees agrees with the layout they actually got.
 */
export function cardKind(blocks: ContentBlock[], context: LayoutContext = {}): CardKind {
  const stats = blocksOfType(blocks, 'stat')
  const comparisonGroups = blocksOfType(blocks, 'comparisonGroup')
  const timelineSteps = blocksOfType(blocks, 'timelineStep')
  const bulletLists = blocksOfType(blocks, 'bulletList')
  const images = blocksOfType(blocks, 'image')
  const quotes = blocksOfType(blocks, 'quote')
  const headings = blocksOfType(blocks, 'heading')

  if (comparisonGroups.length >= 2) return 'comparison'
  if (timelineSteps.length >= 2) return 'timeline'
  if (stats.length >= 1) return 'stats'
  if (quotes.length >= 1) return 'quote'
  if (images.length >= 2) return 'gallery'
  if (bulletLists.length >= 1) return 'list'
  if (context.isFirstCard && headings.length >= 1 && blocks.length <= 2) return 'title'
  return 'text'
}

/** One option in the picker: which component renders the card, and in which treatment. */
export interface LayoutVariety {
  layout: Exclude<LayoutType, 'auto'>
  visualStyle: VisualStyle
}

/*
  Treatment order is fixed and is what the picker numbers as "· 1" and "· 2",
  so an option keeps its number between openings.
*/
const TREATMENTS: VisualStyle[] = ['structured', 'expressive']

/**
 * The layout components that belong to a card type.
 *
 * Some entries still depend on the blocks (a stat grid needs two stats), so
 * this is filtered against the card in `layoutVarieties` rather than being a
 * plain constant lookup.
 */
function componentsForKind(kind: CardKind, blocks: ContentBlock[]): Exclude<LayoutType, 'auto'>[] {
  switch (kind) {
    case 'title':
      return ['hero']
    case 'stats':
      return blocksOfType(blocks, 'stat').length >= 2 ? ['statHero', 'statGrid'] : ['statHero']
    case 'comparison':
      return ['comparison']
    case 'timeline':
      return ['timeline']
    case 'quote':
      return ['quote']
    case 'list':
      return ['iconGrid', 'numberedList']
    case 'gallery':
      return ['gallery']
    case 'text':
      // A split needs a picture to sit beside the prose; without one it renders
      // an empty half.
      return blocksOfType(blocks, 'image').length >= 1
        ? ['textFocus', 'standardSplit', 'standard']
        : ['textFocus', 'standard']
  }
}

export function layoutVarieties(blocks: ContentBlock[], kind: CardKind): LayoutVariety[] {
  return componentsForKind(kind, blocks).flatMap((layout) =>
    TREATMENTS.map((visualStyle) => ({ layout, visualStyle })),
  )
}
