import { describe, expect, it } from 'vitest'
import type { Card } from '@/engine/contentBlocks'
import { inOrder, withBlockRemoved, withBlockReplaced, withLayoutPinned, withoutCard } from './cardMutations'

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

describe('withBlockReplaced', () => {
  it('swaps one block on one card', () => {
    const result = withBlockReplaced(deck, 'b', 1, { type: 'paragraph', text: 'Edited' })
    expect(result[1].blocks[1]).toEqual({ type: 'paragraph', text: 'Edited' })
    expect(result[1].blocks[0]).toEqual(deck[1].blocks[0])
    expect(result[0]).toBe(deck[0])
  })

  it('ignores an out-of-range index instead of growing the block list', () => {
    expect(withBlockReplaced(deck, 'b', 9, { type: 'heading', text: 'x' })[1].blocks).toHaveLength(3)
    expect(withBlockReplaced(deck, 'b', -1, { type: 'heading', text: 'x' })[1].blocks).toHaveLength(3)
  })

  it('ignores an unknown card id', () => {
    expect(withBlockReplaced(deck, 'nope', 0, { type: 'heading', text: 'x' })).toEqual(deck)
  })
})

describe('withBlockRemoved', () => {
  it('removes the block and leaves the others in order', () => {
    const result = withBlockRemoved(deck, 'c', 1)
    expect(result[2].blocks.map((b) => b.type)).toEqual(['heading', 'stat'])
  })

  it('ignores an out-of-range index', () => {
    expect(withBlockRemoved(deck, 'c', 3)[2].blocks).toHaveLength(3)
  })

  it('does not mutate the deck it was given', () => {
    withBlockRemoved(deck, 'a', 0)
    expect(deck[0].blocks).toHaveLength(3)
  })
})

describe('withLayoutPinned', () => {
  // Removing a block changes which block types a card holds, which is exactly
  // what chooseLayout classifies on — without pinning, deleting a stat can flip
  // the card to a different layout and rearrange everything around the cursor.
  it('pins an auto card to the layout it is currently rendered with', () => {
    expect(withLayoutPinned(deck, 'a', 'statHero')[0].layout).toBe('statHero')
  })

  it('leaves an already-pinned card on its own layout', () => {
    const pinned = withLayoutPinned(deck, 'a', 'statHero')
    expect(withLayoutPinned(pinned, 'a', 'timeline')[0].layout).toBe('statHero')
  })

  it('touches only the named card', () => {
    expect(withLayoutPinned(deck, 'a', 'quote')[1].layout).toBe('auto')
  })
})
