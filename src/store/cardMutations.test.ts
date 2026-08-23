import { describe, expect, it } from 'vitest'
import type { Card } from '@/engine/contentBlocks'
import { inOrder, withoutCard } from './cardMutations'

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
