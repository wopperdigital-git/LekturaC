import { z } from 'zod'
import { contentBlockSchema, visualStyleSchema } from '@/engine/contentBlocks'
import {
  CLAIM_TYPES,
  LAYOUT_FAMILIES,
  PRESENTATION_TYPES,
  SLIDE_PURPOSES,
  VISUAL_TYPES,
} from '@/generation/schemas'

/*
  A structural mirror of `generatedDeckSchema` (`@/generation/schemas`), built
  only so Anthropic's structured-output `output_config.format`
  (`zodOutputFormat`, `@anthropic-ai/sdk/helpers/zod`) has a JSON-Schema-safe
  shape to constrain the model's generation against.

  JSON Schema cannot represent `.catch(default)` (a runtime fallback for a
  value that parsed but failed validation — there is no JSON Schema keyword
  for "substitute this on failure") or the real schema's `.refine()` (first
  block must be a heading — an arbitrary predicate, not a shape). So every
  `.catch()` below becomes a plain `z.enum`/type with no fallback, and the
  refinement is dropped entirely. Structured output still constrains the
  model to one of the enum's literal values in the first place, so losing
  `.catch()` here costs nothing; `.default()` fields keep their default,
  since JSON Schema has no trouble with that.

  This schema's own validation is NOT what the app trusts. `anthropicProvider.ts`
  always re-runs the REAL `generatedDeckSchema.safeParse()` on
  `response.parsed_output` afterward — that's what still enforces the
  `.catch()` defaults and the heading refinement.

  MUST be kept in sync with `generatedDeckSchema` by hand: there is no
  mechanical link between the two, so a field added, renamed or retyped over
  there needs the same change made here.
*/

const slidePlanOutputSchema = z.object({
  purpose: z.enum(SLIDE_PURPOSES),
  audienceQuestion: z.string(),
  keyMessage: z.string().min(1),
  visualType: z.enum(VISUAL_TYPES),
  layoutFamily: z.enum(LAYOUT_FAMILIES),
  transition: z.string().default(''),
  importance: z.enum(['essential', 'supporting', 'optional']),
})

const generatedClaimOutputSchema = z.object({
  statement: z.string().min(1),
  type: z.enum(CLAIM_TYPES),
  sourceIds: z.array(z.string()).default([]),
  timeSensitive: z.boolean(),
  year: z.number().int().optional(),
})

const deckBriefOutputSchema = z.object({
  objective: z.string().min(1),
  audienceKnowledgeLevel: z.enum(['beginner', 'intermediate', 'advanced']),
  presentationType: z.enum(PRESENTATION_TYPES),
  freshnessRequired: z.boolean(),
  keyQuestions: z.array(z.string()).default([]),
})

const generatedCardOutputSchema = z.object({
  plan: slidePlanOutputSchema,
  role: z.string().optional(),
  blocks: z.array(contentBlockSchema).min(1),
  visualStyle: visualStyleSchema,
  speakerNotes: z.string(),
  claims: z.array(generatedClaimOutputSchema).default([]),
})

export const deckOutputSchema = z.object({
  title: z.string().min(1),
  blueprint: z.enum(['inform', 'persuade', 'story']),
  brief: deckBriefOutputSchema,
  cards: z.array(generatedCardOutputSchema).min(1),
})
