import { describe, expect, it } from 'vitest'
import type { ZodTypeAny } from 'zod'
import { generatedDeckSchema } from '@/generation/schemas'
import { deckOutputSchema } from './deckOutputSchema'

/*
  `deckOutputSchema` is a hand-maintained structural mirror of
  `generatedDeckSchema` (see `deckOutputSchema.ts`'s header comment) — there
  is no mechanical link between the two, so a field added, renamed or retyped
  on the real schema silently stops being sent to Anthropic's structured
  output unless this file is updated by hand too.

  The plan's Risks section originally asked for "a deck valid under the
  mirror parses under the real schema" — that literal claim is false by
  design (the mirror drops `.catch()` defaults and the heading `.refine()`),
  so instead this compares the two schemas' own field names, recursively, at
  every object-shaped nesting level (deck, brief, card, plan, claim). A block
  type, enum or other non-object leaf isn't recursed into — both sides import
  the exact same `contentBlockSchema`/`visualStyleSchema`, so there's nothing
  to drift there.
*/

/**
 * Unwraps `.optional()`/`.default()`/`.catch()` (all represented as an
 * `innerType` wrapper in zod v4) and, for an array, its element type, then
 * returns the resulting object schema's own field names — or `undefined` if,
 * after unwrapping, this isn't an object schema (a leaf: a string, enum,
 * union of block types, etc., which this test doesn't compare structurally).
 */
function objectShape(schema: ZodTypeAny): Record<string, ZodTypeAny> | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let s: any = schema
  while (s?._def?.innerType) s = s._def.innerType
  if (s?._def?.type === 'array') {
    s = s.element
    while (s?._def?.innerType) s = s._def.innerType
  }
  if (s?._def?.type === 'object') return s.shape
  return undefined
}

function assertSameKeys(mirror: ZodTypeAny, real: ZodTypeAny, path: string) {
  const mirrorShape = objectShape(mirror)
  const realShape = objectShape(real)
  if (!mirrorShape || !realShape) return

  expect(Object.keys(mirrorShape).sort(), `${path} field names`).toEqual(Object.keys(realShape).sort())

  for (const key of Object.keys(mirrorShape)) {
    assertSameKeys(mirrorShape[key], realShape[key], `${path}.${key}`)
  }
}

describe('deckOutputSchema mirrors generatedDeckSchema', () => {
  it('has the same field names at every object-shaped level (deck, brief, card, plan, claim)', () => {
    assertSameKeys(deckOutputSchema, generatedDeckSchema, 'deck')
  })
})

describe('deckOutputSchema leniency', () => {
  // `messages.parse` validates the model's reply against this mirror and throws
  // on failure (kind `response`, no failover). A bad imageQuery must therefore
  // pass here and be dropped by the real schema's `.catch(undefined)`.
  function deckWith(imageQuery: unknown) {
    return {
      title: 'T',
      blueprint: 'inform',
      brief: { objective: 'O', audienceKnowledgeLevel: 'beginner', presentationType: 'other', freshnessRequired: false, keyQuestions: [] },
      cards: [
        {
          plan: { purpose: 'hook', audienceQuestion: 'q', keyMessage: 'k', visualType: 'text', layoutFamily: 'list', transition: '', importance: 'essential' },
          imageQuery,
          blocks: [{ type: 'heading', text: 'H' }],
          visualStyle: 'structured',
          speakerNotes: 'n',
          claims: [],
        },
      ],
    }
  }

  it.each([['empty', ''], ['one character', 'a'], ['120 characters', 'x'.repeat(120)]])(
    'accepts a %s imageQuery, which the real schema then drops',
    (_label, value) => {
      expect(deckOutputSchema.safeParse(deckWith(value)).success).toBe(true)
      const real = generatedDeckSchema.parse(deckWith(value))
      expect(real.cards[0].imageQuery).toBeUndefined()
    },
  )
})
