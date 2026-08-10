import { z } from 'zod'

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
})

export type Card = z.infer<typeof cardSchema>

export function blocksOfType<T extends ContentBlock['type']>(
  blocks: ContentBlock[],
  type: T,
): Extract<ContentBlock, { type: T }>[] {
  return blocks.filter((b): b is Extract<ContentBlock, { type: T }> => b.type === type)
}
