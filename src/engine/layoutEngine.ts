import { blocksOfType, type ContentBlock, type LayoutType } from './contentBlocks'

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
