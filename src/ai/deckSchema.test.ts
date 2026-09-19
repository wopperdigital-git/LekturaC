import { describe, expect, it } from 'vitest'
import { generatedDeckSchema } from './provider'

function deck(overrides: Record<string, unknown> = {}) {
  return {
    title: 'A deck',
    blueprint: 'inform',
    brief: {
      objective: 'Explain why retention drops',
      audienceKnowledgeLevel: 'beginner',
      presentationType: 'educational',
      freshnessRequired: false,
      keyQuestions: [],
    },
    cards: [
      {
        plan: {
          purpose: 'hook',
          audienceQuestion: 'Why does retention drop?',
          keyMessage: 'Retention drops after fifteen minutes',
          visualType: 'text',
          layoutFamily: 'hero',
          transition: '',
          importance: 'essential',
        },
        blocks: [{ type: 'heading', text: 'Retention drops after fifteen minutes' }],
        visualStyle: 'structured',
        speakerNotes: 'Explain the fifteen-minute cliff and why it matters.',
        role: 'title-why-matters',
      },
    ],
    ...overrides,
  }
}

describe('generatedDeckSchema', () => {
  it('accepts a deck carrying a blueprint and per-card roles', () => {
    const result = generatedDeckSchema.safeParse(deck())
    expect(result.success).toBe(true)
  })

  it('rejects an unknown blueprint id', () => {
    // Shape failures DO fail the generation: the single self-correcting retry
    // hands these zod messages back to the model.
    expect(generatedDeckSchema.safeParse(deck({ blueprint: 'informative' })).success).toBe(false)
  })

  it('rejects a missing blueprint', () => {
    const d = deck()
    delete (d as Record<string, unknown>).blueprint
    expect(generatedDeckSchema.safeParse(d).success).toBe(false)
  })

  it('accepts a card without role', () => {
    const withoutRole = { ...deck().cards[0] } as Record<string, unknown>
    delete withoutRole.role
    expect(generatedDeckSchema.safeParse(deck({ cards: [withoutRole] })).success).toBe(true)
  })

  it('accepts a role the chosen blueprint does not use', () => {
    // Sequence is NOT validated here — a mismatch is warned about at ingest so
    // an otherwise good deck is never thrown away.
    expect(generatedDeckSchema.safeParse(deck({ cards: [{ ...deck().cards[0], role: 'hook' }] })).success).toBe(true)
  })

  it('still requires the first block to be a heading', () => {
    expect(
      generatedDeckSchema.safeParse(
        deck({
          cards: [
            {
              ...deck().cards[0],
              blocks: [{ type: 'paragraph', text: 'no heading' }],
            },
          ],
        }),
      ).success,
    ).toBe(false)
  })
})
