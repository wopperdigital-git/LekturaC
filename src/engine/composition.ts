import type { Card, ContentBlock, LayoutType } from './contentBlocks'
import { singlePhoto } from './blockPartition'
import { resolveLayout, type LayoutContext } from './layoutEngine'
import { nodeKey, type RenderNode } from './groups'

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

/** How much room an arrangement's items get: `roomy` draws their text larger. */
export type ItemStep = 'roomy' | 'normal'

/** Longest item text that still reads as one short line at the roomy size. */
const ROOMY_MAX_CHARS = 64
/** Most items that still sit comfortably at the roomy size. */
const ROOMY_MAX_ITEMS = 6

/**
 * Whether a group's items are few and short enough to draw their text at the lead
 * size (`roomy`) rather than the body size (`normal`): at most six items, the longest
 * at most 64 characters. No items is roomy.
 */
export function itemStep(texts: string[]): ItemStep {
  const longest = texts.reduce((max, text) => Math.max(max, text.length), 0)
  return texts.length <= ROOMY_MAX_ITEMS && longest <= ROOMY_MAX_CHARS ? 'roomy' : 'normal'
}

/**
 * The key (`nodeKey`, the first block index) of the one group that should fill the
 * slide's body zone, or null. A group fills only when it is the body's single drawn node
 * and nothing else in the body is drawn beside it, apart from the lone photo's own leaf
 * (a photo is drawn as a band above the body, by index). `bodyIndices` is what the frame
 * hands its child; a node belongs to the body when its first index is in it. Pure: it
 * reads nodes and indices and never moves, drops or renumbers a block.
 */
export function fillNode(nodes: RenderNode[], bodyIndices: number[], photoIndex: number | null): number | null {
  const inBody = new Set(bodyIndices)
  const drawn = nodes.filter(
    (node) => inBody.has(nodeKey(node)) && !(node.kind === 'leaf' && node.index === photoIndex),
  )
  if (drawn.length !== 1 || drawn[0].kind !== 'group') return null
  return nodeKey(drawn[0])
}
