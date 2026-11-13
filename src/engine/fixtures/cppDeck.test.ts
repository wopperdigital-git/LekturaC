import { describe, expect, it } from 'vitest'
import { cardSchema } from '@/engine/contentBlocks'
import { resolveLayout } from '@/engine/layoutEngine'
import { CPP_DECK, withStyle } from './cppDeck'

describe('CPP_DECK', () => {
  it('is seven valid cards covering seven layouts', () => {
    expect(CPP_DECK).toHaveLength(7)
    for (const card of CPP_DECK) expect(cardSchema.safeParse(card).success).toBe(true)
    const layouts = CPP_DECK.map((c, i) => resolveLayout(c.layout, c.blocks, { isFirstCard: i === 0 }))
    expect(layouts).toEqual(['hero', 'iconGrid', 'statGrid', 'timeline', 'comparison', 'quote', 'standardSplit'])
  })

  it('numbers cards in order and opens every card with a heading', () => {
    expect(CPP_DECK.map((c) => c.orderIndex)).toEqual([0, 1, 2, 3, 4, 5, 6])
    for (const card of CPP_DECK) expect(card.blocks[0]?.type).toBe('heading')
  })

  it('withStyle restyles every card without touching the original', () => {
    const styled = withStyle(CPP_DECK, 'expressive')
    expect(styled.every((c) => c.visualStyle === 'expressive')).toBe(true)
    expect(CPP_DECK.every((c) => c.visualStyle === 'structured')).toBe(true)
    expect(styled.map((c) => c.blocks)).toEqual(CPP_DECK.map((c) => c.blocks))
  })
})
