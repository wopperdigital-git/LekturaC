import { z } from 'zod'
import { textStyleSchema } from './textStyle'
import { markSchema } from './marks'
import { adjustsSchema } from './blockAdjust'
import { narrationSchema } from './narration'

export const headingBlockSchema = z.object({
  type: z.literal('heading'),
  text: z.string().min(1),
})

export const paragraphBlockSchema = z.object({
  type: z.literal('paragraph'),
  text: z.string().min(1),
})

export const bulletListBlockSchema = z.object({
  type: z.literal('bulletList'),
  items: z.array(z.string().min(1)).min(1),
})

export const statBlockSchema = z.object({
  type: z.literal('stat'),
  value: z.string().min(1),
  label: z.string().min(1),
})

export const imageBlockSchema = z.object({
  type: z.literal('image'),
  url: z.string().min(1),
  alt: z.string().optional(),
  prompt: z.string().optional(),
})

export const quoteBlockSchema = z.object({
  type: z.literal('quote'),
  text: z.string().min(1),
  attribution: z.string().optional(),
})

export const timelineStepBlockSchema = z.object({
  type: z.literal('timelineStep'),
  label: z.string().min(1),
  text: z.string().min(1),
})

export const comparisonGroupBlockSchema = z.object({
  type: z.literal('comparisonGroup'),
  heading: z.string().min(1),
  items: z.array(z.string().min(1)).min(1),
})

export const contentBlockSchema = z.discriminatedUnion('type', [
  headingBlockSchema,
  paragraphBlockSchema,
  bulletListBlockSchema,
  statBlockSchema,
  imageBlockSchema,
  quoteBlockSchema,
  timelineStepBlockSchema,
  comparisonGroupBlockSchema,
])

export type ContentBlock = z.infer<typeof contentBlockSchema>
export type HeadingBlock = z.infer<typeof headingBlockSchema>
export type ParagraphBlock = z.infer<typeof paragraphBlockSchema>
export type BulletListBlock = z.infer<typeof bulletListBlockSchema>
export type StatBlock = z.infer<typeof statBlockSchema>
export type ImageBlock = z.infer<typeof imageBlockSchema>
export type QuoteBlock = z.infer<typeof quoteBlockSchema>
export type TimelineStepBlock = z.infer<typeof timelineStepBlockSchema>
export type ComparisonGroupBlock = z.infer<typeof comparisonGroupBlockSchema>

export const layoutTypeSchema = z.enum([
  'auto',
  'standard',
  'standardSplit',
  'hero',
  'statHero',
  'statGrid',
  'comparison',
  'timeline',
  'iconGrid',
  'numberedList',
  'quote',
  'textFocus',
  'gallery',
])

export type LayoutType = z.infer<typeof layoutTypeSchema>

export const visualStyleSchema = z.enum(['structured', 'expressive'])

export type VisualStyle = z.infer<typeof visualStyleSchema>

export const cardSchema = z.object({
  id: z.string(),
  orderIndex: z.number(),
  blocks: z.array(contentBlockSchema).min(1),
  layout: layoutTypeSchema,
  visualStyle: visualStyleSchema,
  /*
    Per-card text formatting from the toolbar's Level 2 tools. Optional because
    it postdates every card already in the database: rows written before
    migration 0004 have no such column, and the AI never generates one — a deck
    arrives unstyled and only gains a value if someone edits it.
  */
  textStyle: textStyleSchema.optional(),
  /*
    Level 3's per-text-element data, keyed by `textRef`. Optional and absent by
    default: a freshly generated deck has none, and a card only gains an entry
    for a run of text somebody actually formatted.
  */
  inline: z
    .record(
      z.string(),
      z.object({
        marks: z.array(markSchema).optional(),
        style: textStyleSchema.optional(),
      }),
    )
    .optional(),
  /*
    Per-element nudges, keyed by block index: how far one block has been dragged
    from where the layout engine put it, and what size it was given.

    Optional and absent by default, and an entry appears only for a block
    somebody actually moved or resized — every other block on the card is still
    arranged entirely by its layout component. There is no card-level "this card
    is now free-form" switch: the layout is always the starting point, and these
    are adjustments on top of it. See `engine/blockAdjust.ts`.
  */
  adjusts: adjustsSchema.optional(),
  /*
    The slide's narration script — see `engine/narration.ts`.

    Optional and absent by default, like every field above it: a freshly
    generated deck has none, and a card gains one only when somebody generates
    or writes a script for it. Never rendered on the slide and never exported to
    .pptx; it exists to be read aloud.
  */
  narration: narrationSchema.optional(),
})

export type Card = z.infer<typeof cardSchema>

export function blocksOfType<T extends ContentBlock['type']>(
  blocks: ContentBlock[],
  type: T,
): Extract<ContentBlock, { type: T }>[] {
  return blocks.filter((b): b is Extract<ContentBlock, { type: T }> => b.type === type)
}

/**
 * Like `blocksOfType`, but keeps each block's position in the original array.
 *
 * Layouts filter a card down to the block types they care about, which throws
 * away the index. Level 3 addresses every run of text by that index (see
 * `textRef`), so a filtered layout has no way to name its own text without
 * this. Returning the pair rather than a parallel index array keeps the two
 * from drifting apart at the call site.
 */
export function blocksOfTypeIndexed<T extends ContentBlock['type']>(
  blocks: ContentBlock[],
  type: T,
): { block: Extract<ContentBlock, { type: T }>; index: number }[] {
  const out: { block: Extract<ContentBlock, { type: T }>; index: number }[] = []
  blocks.forEach((b, index) => {
    if (b.type === type) out.push({ block: b as Extract<ContentBlock, { type: T }>, index })
  })
  return out
}
