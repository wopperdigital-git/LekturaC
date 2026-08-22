import type { Card, ContentBlock } from '@/engine/contentBlocks'

/*
  The array/block moves behind delete, reorder, and inline editing — kept pure
  and out of the zustand store so they can be tested directly. Content edits are
  the one place in this app where an index mistake destroys text nobody can
  retype: decks are generated once and there is no regenerate path.

  `withoutCard` and `inOrder` re-derive `orderIndex` from array position, so
  position and `orderIndex` can never drift apart.
*/

function reindex(cards: Card[]): Card[] {
  return cards.map((c, i) => (c.orderIndex === i ? c : { ...c, orderIndex: i }))
}

export function withoutCard(cards: Card[], cardId: string): Card[] {
  return reindex(cards.filter((c) => c.id !== cardId))
}

/** Cards whose id is not in `orderedIds` — deleted since — drop out. */
export function inOrder(cards: Card[], orderedIds: string[]): Card[] {
  const byId = new Map(cards.map((c) => [c.id, c]))
  return reindex(orderedIds.map((id) => byId.get(id)).filter((c): c is Card => c !== undefined))
}

function mapCard(cards: Card[], cardId: string, fn: (card: Card) => Card): Card[] {
  return cards.map((c) => (c.id === cardId ? fn(c) : c))
}

export function withBlockReplaced(
  cards: Card[],
  cardId: string,
  blockIndex: number,
  block: ContentBlock,
): Card[] {
  return mapCard(cards, cardId, (card) => {
    if (blockIndex < 0 || blockIndex >= card.blocks.length) return card
    const blocks = [...card.blocks]
    blocks[blockIndex] = block
    return { ...card, blocks }
  })
}

export function withBlockRemoved(cards: Card[], cardId: string, blockIndex: number): Card[] {
  return mapCard(cards, cardId, (card) => {
    if (blockIndex < 0 || blockIndex >= card.blocks.length) return card
    return { ...card, blocks: card.blocks.filter((_, i) => i !== blockIndex) }
  })
}

/**
 * Pins a card to the layout it is currently being rendered with.
 *
 * `chooseLayout` classifies on which *block types* a card contains, and
 * `resolveLayout` re-runs it on every render while `layout === 'auto'` — so
 * removing a block can silently flip a card from `statHero` to `standard` and
 * rearrange everything around the user's cursor. Structural edits call this
 * first. Text edits deliberately do not: they can't change block types, so
 * there is nothing to protect against and leaving `'auto'` keeps the card
 * responsive to later changes.
 */
export function withLayoutPinned(cards: Card[], cardId: string, resolved: Card['layout']): Card[] {
  return mapCard(cards, cardId, (card) => (card.layout === 'auto' ? { ...card, layout: resolved } : card))
}
