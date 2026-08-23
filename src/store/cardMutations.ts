import type { Card } from '@/engine/contentBlocks'

/*
  The array moves behind card delete and reorder — kept pure and out of the
  zustand store so they can be tested directly.

  Both re-derive `orderIndex` from array position, so position and `orderIndex`
  can never drift apart.
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
