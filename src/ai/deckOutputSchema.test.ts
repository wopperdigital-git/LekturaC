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

describe('deckOutputSchema and the structured blocks', () => {
  // The model may write a point, a callout, a code block and a heading kicker. The mirror is loose: a
  // failure here throws (kind `response`, no failover), so an empty string must pass and the real schema's
  // one retry or `.catch` deals with it.
  function deckWithBlocks(blocks: unknown[], visualType = 'text') {
    return {
      title: 'T',
      blueprint: 'inform',
      brief: { objective: 'O', audienceKnowledgeLevel: 'beginner', presentationType: 'other', freshnessRequired: false, keyQuestions: [] },
      cards: [
        {
          plan: { purpose: 'hook', audienceQuestion: 'q', keyMessage: 'k', visualType, layoutFamily: 'list', transition: '', importance: 'essential' },
          blocks,
          visualStyle: 'structured',
          speakerNotes: 'n',
          claims: [],
        },
      ],
    }
  }

  it.each([
    ['point', { type: 'point', label: 'Term', text: 'Meaning' }],
    ['callout with a label', { type: 'callout', label: 'Key', text: 'Key idea' }],
    ['callout without a label', { type: 'callout', text: 'Key idea' }],
    ['code', { type: 'code', code: 'x = 1', label: 'C', caption: 'A line' }],
  ])('accepts a %s block', (_name, block) => {
    expect(deckOutputSchema.safeParse(deckWithBlocks([{ type: 'heading', text: 'H' }, block])).success).toBe(true)
  })

  it('accepts an empty string in every new string field, which the real schema then fixes or refuses', () => {
    const blocks = [
      { type: 'heading', text: 'H', kicker: '' },
      { type: 'point', label: '', text: 'Meaning' },
      { type: 'callout', label: '', text: 'Key idea' },
      { type: 'code', code: 'x', label: '', caption: '' },
    ]
    expect(deckOutputSchema.safeParse(deckWithBlocks(blocks)).success).toBe(true)
    // The empty point label is a required-empty: the real schema refuses it (the pipeline's one retry).
    expect(generatedDeckSchema.safeParse(deckWithBlocks(blocks)).success).toBe(false)
    const fixable = [blocks[0], blocks[2], blocks[3]]
    const real = generatedDeckSchema.parse(deckWithBlocks(fixable))
    expect(real.cards[0].blocks).toEqual([
      { type: 'heading', text: 'H' },
      { type: 'callout', text: 'Key idea' },
      { type: 'code', code: 'x' },
    ])
  })

  it('accepts an over-long kicker and a code block with empty code', () => {
    const blocks = [{ type: 'heading', text: 'H', kicker: 'x'.repeat(200) }, { type: 'code', code: '' }]
    expect(deckOutputSchema.safeParse(deckWithBlocks(blocks)).success).toBe(true)
  })

  it('keeps a heading kicker', () => {
    const parsed = deckOutputSchema.parse(deckWithBlocks([{ type: 'heading', text: 'H', kicker: 'PART ONE' }]))
    expect(parsed.cards[0].blocks[0]).toEqual({ type: 'heading', text: 'H', kicker: 'PART ONE' })
  })

  it.each(['definitions', 'code_example'])('accepts plan.visualType %s', (visualType) => {
    expect(deckOutputSchema.safeParse(deckWithBlocks([{ type: 'heading', text: 'H' }], visualType)).success).toBe(true)
  })

  it('still accepts a timeline step, and both shared-shape types reach the real schema intact', () => {
    const blocks = [
      { type: 'heading', text: 'H' },
      { type: 'timelineStep', label: '1990', text: 'Start' },
      { type: 'point', label: 'Term', text: 'Meaning' },
    ]
    expect(deckOutputSchema.parse(deckWithBlocks(blocks)).cards[0].blocks).toEqual(blocks)
    expect(generatedDeckSchema.parse(deckWithBlocks(blocks)).cards[0].blocks).toEqual(blocks)
  })

  it('refuses a block type the real schema does not know', () => {
    const blocks = [{ type: 'heading', text: 'H' }, { type: 'banner', label: 'x', text: 'y' }]
    expect(deckOutputSchema.safeParse(deckWithBlocks(blocks)).success).toBe(false)
  })
})

describe('deckOutputSchema stays under Anthropic’s grammar limit', () => {
  /*
    Anthropic compiles the structured-output schema into a grammar and refuses one that is too large with a
    400 ("The compiled grammar is too large…"), which is a `request` failure: no retry, no failover, no deck.
    `zodOutputFormat` turns every `type` literal into a plain string, so each block variant is an object the
    grammar cannot tell apart by its tag; variant count is what drives the size. Measured against the live
    API on 2026-11-19 (claude-sonnet-5): eleven variants (and ten, without `image`) were refused for the deck
    call; nine passed for both the deck and the repair call, and nine with the point/step merge passed with
    a spare variant. Keep it at nine or fewer, and probe the live API before adding one.
  */
  async function blockVariants() {
    const { zodOutputFormat } = await import('@anthropic-ai/sdk/helpers/zod')
    const schema = zodOutputFormat(deckOutputSchema).schema as { $defs: Record<string, { anyOf?: unknown[] }> }
    const unions = Object.values(schema.$defs).filter((d) => Array.isArray(d.anyOf))
    expect(unions).toHaveLength(1)
    return unions[0].anyOf as { properties: Record<string, unknown> }[]
  }

  it('offers at most nine block variants', async () => {
    expect((await blockVariants()).length).toBeLessThanOrEqual(9)
  })

  it('does not offer an image block (photos come from imageQuery; the prompt forbids writing one)', async () => {
    const variants = await blockVariants()
    expect(variants.some((v) => 'url' in v.properties)).toBe(false)
  })
})
