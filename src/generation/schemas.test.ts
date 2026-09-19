import { describe, expect, it } from 'vitest'
import {
  evidencePackSchema,
  generatedDeckSchema,
} from './schemas'

function fullDeck(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Electric vehicles in 2026',
    blueprint: 'inform',
    brief: {
      objective: 'Explain the state of EV adoption',
      audienceKnowledgeLevel: 'beginner',
      presentationType: 'educational',
      freshnessRequired: true,
      keyQuestions: ['Why now?'],
    },
    cards: [
      {
        plan: {
          purpose: 'hook',
          audienceQuestion: 'Why should I care about EVs?',
          keyMessage: 'EV adoption is accelerating faster than expected.',
          visualType: 'hero_image',
          layoutFamily: 'hero',
          transition: '',
          importance: 'essential',
        },
        role: 'title-why-matters',
        blocks: [{ type: 'heading', text: 'EVs are going mainstream' }],
        visualStyle: 'structured',
        speakerNotes: 'Set the stage for why EV adoption matters right now.',
        claims: [],
      },
    ],
    ...overrides,
  }
}

describe('generatedDeckSchema (v2)', () => {
  it('parses a full v2 deck', () => {
    const result = generatedDeckSchema.safeParse(fullDeck())
    expect(result.success).toBe(true)
  })

  it('rejects a card missing plan', () => {
    const deck = fullDeck()
    const card = { ...(deck.cards[0] as Record<string, unknown>) }
    delete card.plan
    const result = generatedDeckSchema.safeParse({ ...deck, cards: [card] })
    expect(result.success).toBe(false)
  })

  it('rejects a card missing speakerNotes', () => {
    const deck = fullDeck()
    const card = { ...(deck.cards[0] as Record<string, unknown>) }
    delete card.speakerNotes
    const result = generatedDeckSchema.safeParse({ ...deck, cards: [card] })
    expect(result.success).toBe(false)
  })

  it('rejects a card whose first block is not a heading', () => {
    const deck = fullDeck()
    const card = {
      ...(deck.cards[0] as Record<string, unknown>),
      blocks: [{ type: 'paragraph', text: 'no heading here' }],
    }
    const result = generatedDeckSchema.safeParse({ ...deck, cards: [card] })
    expect(result.success).toBe(false)
  })

  it('parses an unknown plan.purpose as concept_explanation via .catch', () => {
    const deck = fullDeck()
    const card = deck.cards[0] as Record<string, unknown>
    const plan = { ...(card.plan as Record<string, unknown>), purpose: 'intro' }
    const result = generatedDeckSchema.safeParse({ ...deck, cards: [{ ...card, plan }] })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.cards[0].plan.purpose).toBe('concept_explanation')
    }
  })

  it('treats role as optional', () => {
    const deck = fullDeck()
    const card = { ...(deck.cards[0] as Record<string, unknown>) }
    delete card.role
    const result = generatedDeckSchema.safeParse({ ...deck, cards: [card] })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.cards[0].role).toBeUndefined()
    }
  })

  it('defaults claims to an empty array', () => {
    const deck = fullDeck()
    const card = { ...(deck.cards[0] as Record<string, unknown>) }
    delete card.claims
    const result = generatedDeckSchema.safeParse({ ...deck, cards: [card] })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.cards[0].claims).toEqual([])
    }
  })

  it('maps a claim with unknown type to general_fact via .catch', () => {
    const deck = fullDeck()
    const card = deck.cards[0] as Record<string, unknown>
    const result = generatedDeckSchema.safeParse({
      ...deck,
      cards: [
        {
          ...card,
          claims: [{ statement: 'EVs outsold diesel cars in Norway', type: 'made_up_type' }],
        },
      ],
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.cards[0].claims[0]?.type).toBe('general_fact')
    }
  })

  it('rejects an unknown blueprint id', () => {
    const result = generatedDeckSchema.safeParse(fullDeck({ blueprint: 'informative' }))
    expect(result.success).toBe(false)
  })
})

describe('evidencePackSchema', () => {
  it('parses {} to empty arrays', () => {
    const result = evidencePackSchema.safeParse({})
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual({ sources: [], findings: [], disagreements: [] })
    }
  })

  it('maps a source with unknown sourceType to other via .catch', () => {
    const result = evidencePackSchema.safeParse({
      sources: [{ id: 's1', title: 'IEA Global EV Outlook', sourceType: 'blog' }],
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.sources[0]?.sourceType).toBe('other')
    }
  })
})
