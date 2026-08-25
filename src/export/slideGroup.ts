import type { Card, LayoutType } from '@/engine/contentBlocks'
import { resolveLayout } from '@/engine/layoutEngine'

/**
 * The five arrangements a slide can take in the exported .pptx.
 *
 * Deliberately fewer than the twelve on-screen layouts: PowerPoint gets native,
 * editable text boxes rather than a reproduction of each hand-designed
 * treatment, and the structure worth preserving across that translation is
 * "is this a title, a body, a stat, a two-column comparison, or a quote".
 * `visualStyle` is a screen-only distinction and is not represented here.
 */
export type PptxGroup = 'title' | 'body' | 'stat' | 'twoCol' | 'quote'

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
  gallery: 'body',
  statHero: 'stat',
  statGrid: 'stat',
  comparison: 'twoCol',
  quote: 'quote',
}

/**
 * Which arrangement a card exports as.
 *
 * `resolveLayout` runs first and is not optional: `card.layout` is `'auto'` for
 * nearly every card, since the classifier decides at render time. Grouping on
 * the stored value would classify the string `'auto'` and put the whole deck in
 * one bucket.
 */
export function slideGroup(card: Card, isFirstCard: boolean): PptxGroup {
  const resolved = resolveLayout(card.layout, card.blocks, { isFirstCard })
  return GROUP_BY_LAYOUT[resolved]
}
