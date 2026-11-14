import type { Card, ContentBlock, LayoutType } from './contentBlocks'
import { singlePhoto } from './blockPartition'
import { resolveLayout, type LayoutContext } from './layoutEngine'

/**
 * The roles a slide's blocks play, read off the blocks and never stored.
 *
 * `claim` is the slide's headline, `lead` the sentence that explains it,
 * `aside` a lone photo set beside the rest, and `body` everything else.
 *
 * Every function here returns block INDICES, never blocks: an index is a
 * block's address everywhere in the app (its `textRef`, its `card.adjusts` key,
 * its `data-block-index`, the editor's selection), so nothing is moved, copied
 * or renumbered. `composition.test.ts` pins that every index lands in exactly
 * one slot.
 */
export interface Slots {
  /** Index of the first heading, or null when the card has none. */
  claim: number | null
  /** Index of the paragraph directly after the claim, or null. */
  lead: number | null
  /** Index of the card's only photo, or null (two or more photos are body). */
  aside: number | null
  /** Every remaining index, ascending. */
  body: number[]
}

export function slotsOf(blocks: ContentBlock[]): Slots {
  const found = blocks.findIndex((block) => block.type === 'heading')
  const claim = found === -1 ? null : found
  const lead = claim !== null && blocks[claim + 1]?.type === 'paragraph' ? claim + 1 : null
  const aside = singlePhoto(blocks)?.index ?? null
  const body: number[] = []
  blocks.forEach((_, index) => {
    if (index !== claim && index !== lead && index !== aside) body.push(index)
  })
  return { claim, lead, aside, body }
}

/**
 * The one block that carries the slide's accent colour, or null when the layout
 * gives it to no single block: a lone stat on a stat hero, the first group of a
 * comparison. Every other arrangement stays neutral.
 */
export function accentOwner(blocks: ContentBlock[], layout: Exclude<LayoutType, 'auto'>): number | null {
  const firstOf = (type: ContentBlock['type']): number | null => {
    const index = blocks.findIndex((block) => block.type === type)
    return index === -1 ? null : index
  }
  switch (layout) {
    case 'statHero':
      return firstOf('stat')
    case 'comparison':
    case 'comparisonTable':
      return firstOf('comparisonGroup')
    default:
      return null
  }
}

/** The ground a slide is drawn on: the page colour, a tint of it, or the theme's deep colour. */
export type Ground = 'plain' | 'tint' | 'deep'

/** The ground a resolved layout asks for: the title slide is deep, a quote and a stat hero are tinted, the rest are plain. */
export function groundOfLayout(layout: Exclude<LayoutType, 'auto'>): Ground {
  switch (layout) {
    case 'hero':
      return 'deep'
    case 'quote':
    case 'statHero':
      return 'tint'
    default:
      return 'plain'
  }
}

/**
 * A card's ground, read off the layout it is drawn with. A surface that hands its
 * layout an explicit context passes the same object here, so the ground and the
 * drawn layout cannot disagree; with none, the card is first when its `orderIndex`
 * is 0. A card with no blocks is always plain: even one named `hero` draws only the
 * blank placeholder, which must not paint the deep ground.
 */
export function groundOf(card: Pick<Card, 'layout' | 'blocks' | 'orderIndex'>, context?: LayoutContext): Ground {
  if (card.blocks.length === 0) return 'plain'
  return groundOfLayout(resolveLayout(card.layout, card.blocks, context ?? { isFirstCard: card.orderIndex === 0 }))
}
