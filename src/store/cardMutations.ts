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

/**
 * `card` inserted directly after `afterCardId`, or at the end when that is
 * `null` — or names a card that is no longer here.
 *
 * After the *active* card rather than at the end of the deck: adding a slide
 * while looking at slide 3 and finding it at the bottom of a 30-card deck is
 * the behaviour every other editor stopped having. `reindex` then re-derives
 * every `orderIndex` from position, so the cards that follow shift down without
 * the caller touching them.
 */
export function withCardAfter(cards: Card[], afterCardId: string | null, card: Card): Card[] {
  const ordered = [...cards].sort((a, b) => a.orderIndex - b.orderIndex)
  const at = afterCardId ? ordered.findIndex((c) => c.id === afterCardId) : -1
  const next = [...ordered]
  next.splice(at >= 0 ? at + 1 : ordered.length, 0, card)
  return reindex(next)
}

/** Cards whose id is not in `orderedIds` — deleted since — drop out. */
export function inOrder(cards: Card[], orderedIds: string[]): Card[] {
  const byId = new Map(cards.map((c) => [c.id, c]))
  return reindex(orderedIds.map((id) => byId.get(id)).filter((c): c is Card => c !== undefined))
}
