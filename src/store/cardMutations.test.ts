import { describe, expect, it } from 'vitest'
import type { Card } from '@/engine/contentBlocks'
import { inOrder, withCardAfter, withoutCard } from './cardMutations'

function card(id: string, orderIndex: number): Card {
  return {
    id,
    orderIndex,
    blocks: [
      { type: 'heading', text: `Heading ${id}` },
      { type: 'paragraph', text: `Body ${id}` },
      { type: 'stat', value: '42%', label: 'growth' },
    ],
    layout: 'auto',
    visualStyle: 'structured',
  }
}

const deck = [card('a', 0), card('b', 1), card('c', 2), card('d', 3)]

describe('withoutCard', () => {
  it('drops the card and closes the gap in orderIndex', () => {
    const result = withoutCard(deck, 'b')
    expect(result.map((c) => c.id)).toEqual(['a', 'c', 'd'])
    expect(result.map((c) => c.orderIndex)).toEqual([0, 1, 2])
  })

  it('leaves the deck alone when the id is unknown', () => {
    expect(withoutCard(deck, 'nope').map((c) => c.id)).toEqual(['a', 'b', 'c', 'd'])
  })
})

describe('withCardAfter', () => {
  const fresh = card('new', 0)

  it('inserts after the named card and renumbers what follows', () => {
    const result = withCardAfter(deck, 'b', fresh)
    expect(result.map((c) => c.id)).toEqual(['a', 'b', 'new', 'c', 'd'])
    expect(result.map((c) => c.orderIndex)).toEqual([0, 1, 2, 3, 4])
  })

  it('appends when no card is named', () => {
    expect(withCardAfter(deck, null, fresh).map((c) => c.id)).toEqual(['a', 'b', 'c', 'd', 'new'])
  })

  /*
    The editor passes the *active* card's id, and that card can have been
    deleted between the modal opening and a type being picked. Appending beats
    throwing away the slide the user just asked for.
  */
  it('appends when the named card is no longer in the deck', () => {
    expect(withCardAfter(deck, 'gone', fresh).map((c) => c.id)).toEqual(['a', 'b', 'c', 'd', 'new'])
  })

  /*
    The deck arrives from the store in whatever order the array happens to be
    in; `orderIndex` is the truth. Splicing into the raw array would drop the
    card in a position the user did not pick.
  */
  it('inserts by orderIndex rather than array position', () => {
    const shuffled = [deck[2], deck[0], deck[3], deck[1]]
    expect(withCardAfter(shuffled, 'a', fresh).map((c) => c.id)).toEqual([
      'a',
      'new',
      'b',
      'c',
      'd',
    ])
  })

  it('leaves the original array untouched', () => {
    withCardAfter(deck, 'a', fresh)
    expect(deck.map((c) => c.id)).toEqual(['a', 'b', 'c', 'd'])
  })
})

describe('inOrder', () => {
  it('reorders to the given ids and renumbers', () => {
    const result = inOrder(deck, ['d', 'a', 'c', 'b'])
    expect(result.map((c) => c.id)).toEqual(['d', 'a', 'c', 'b'])
    expect(result.map((c) => c.orderIndex)).toEqual([0, 1, 2, 3])
  })

  it('ignores ids that are no longer in the deck', () => {
    const result = inOrder(withoutCard(deck, 'b'), ['d', 'b', 'a', 'c'])
    expect(result.map((c) => c.id)).toEqual(['d', 'a', 'c'])
  })
})
