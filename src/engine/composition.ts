import type { ContentBlock, LayoutType } from './contentBlocks'
import { singlePhoto } from './blockPartition'

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
