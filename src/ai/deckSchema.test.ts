import { describe, expect, it } from 'vitest'
import { generatedDeckSchema } from './provider'

function deck(overrides: Record<string, unknown> = {}) {
  return {
    title: 'A deck',
    blueprint: 'inform',
    cards: [
      {
        blocks: [{ type: 'heading', text: 'Retention drops after fifteen minutes' }],
        visualStyle: 'structured',
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

  it('rejects a card with no role', () => {
    expect(
      generatedDeckSchema.safeParse(
        deck({
          cards: [{ blocks: [{ type: 'heading', text: 'Hi' }], visualStyle: 'structured' }],
        }),
      ).success,
    ).toBe(false)
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
            { blocks: [{ type: 'paragraph', text: 'no heading' }], visualStyle: 'structured', role: 'hook' },
          ],
        }),
      ).success,
    ).toBe(false)
  })
})
