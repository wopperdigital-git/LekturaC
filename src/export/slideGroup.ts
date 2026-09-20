import type { Card, LayoutType } from '@/engine/contentBlocks'
import { resolveLayout } from '@/engine/layoutEngine'

/**
 * The five arrangements a slide can take in the exported .pptx.
 *
 * Five describe a shape and are deliberately fewer than the twelve on-screen
 * layouts: PowerPoint gets native, editable text boxes rather than a
 * reproduction of each hand-designed treatment, and the structure worth
 * preserving across that translation is "is this a title, a body, a stat, a
 * two-column comparison, or a quote". `visualStyle` is a screen-only
 * distinction and is not represented here.
 *
 * `adjusted` is the exception and describes no shape at all. It is for a card
 * where somebody has dragged or resized an element: those nudges have to
 * survive the export, and none of the five can express them — `body`, in
 * particular, merges every block after the heading into one text box, which
 * leaves a per-element offset nowhere to go.
 */
export type PptxGroup = 'title' | 'body' | 'stat' | 'twoCol' | 'quote' | 'adjusted'

/*
  Exhaustive by construction: a thirteenth layout added to `LayoutType` is a
  type error here rather than a silent fallthrough into `body`, which would
  ship a wrong-looking slide with nothing to catch it.
*/
const GROUP_BY_LAYOUT: Record<Exclude<LayoutType, 'auto'>, PptxGroup> = {
  hero: 'title',
  textFocus: 'title',
  standard: 'body',
  standardSplit: 'body',
  timeline: 'body',
  iconGrid: 'body',
  numberedList: 'body',
  checklist: 'body',
  splitList: 'body',
  timelineRow: 'body',
  gallery: 'body',
  statHero: 'stat',
  statGrid: 'stat',
  statList: 'stat',
  comparison: 'twoCol',
  comparisonTable: 'twoCol',
  quote: 'quote',
}

/**
 * Which arrangement a card exports as.
 *
 * A card carrying element adjustments short-circuits everything below it, so
 * the nudges the user made are not silently dropped into one of the five fixed
 * arrangements. A card nobody has touched takes exactly the path it always did.
 *
 * Otherwise `resolveLayout` runs first and is not optional: `card.layout` is
 * `'auto'` for nearly every card, since the classifier decides at render time.
 * Grouping on the stored value would classify the string `'auto'` and put the
 * whole deck in one bucket.
 */
export function slideGroup(card: Card, isFirstCard: boolean): PptxGroup {
  if (card.adjusts && Object.keys(card.adjusts).length > 0) return 'adjusted'
  const resolved = resolveLayout(card.layout, card.blocks, { isFirstCard })
  return GROUP_BY_LAYOUT[resolved]
}
