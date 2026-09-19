import { z } from 'zod'
import { contentBlockSchema, visualStyleSchema } from '@/engine/contentBlocks'

/*
  The v2 generated deck: every slide carries its plan beside its copy.

  Enums use `.catch(default)` rather than failing: a model that writes
  "purpose": "intro" must not cost the user a deck nothing can regenerate.
  Required *strings and objects* stay required, so a response that skipped
  planning altogether still fails the shape check and gets the one
  self-correcting retry. See the design spec, "[2] Plan + write".
*/

export const SLIDE_PURPOSES = [
  'hook', 'title', 'context', 'problem', 'definition', 'overview', 'timeline',
  'process', 'concept_explanation', 'evidence', 'data', 'comparison',
  'case_study', 'example', 'diagram', 'summary', 'recommendation',
  'conclusion', 'call_to_action', 'references',
] as const
export type SlidePurpose = (typeof SLIDE_PURPOSES)[number]

export const VISUAL_TYPES = [
  'hero_image', 'photo', 'illustration', 'timeline', 'bar_chart', 'line_chart',
  'pie_chart', 'donut_chart', 'scatter_plot', 'map', 'comparison_table',
  'two_column_comparison', 'process_flow', 'diagram', 'icon_grid',
  'metric_cards', 'quote', 'text', 'mixed',
] as const
export type VisualType = (typeof VISUAL_TYPES)[number]

export const LAYOUT_FAMILIES = [
  'hero', 'list', 'timeline', 'data', 'comparison', 'visual_left',
  'visual_right', 'full_visual', 'process', 'grid', 'quote', 'summary',
] as const
export type LayoutFamily = (typeof LAYOUT_FAMILIES)[number]

export const CLAIM_TYPES = [
  'statistic', 'historical', 'scientific', 'comparison', 'definition',
  'general_fact', 'opinion',
] as const
export type ClaimType = (typeof CLAIM_TYPES)[number]

export const SOURCE_TYPES = [
  'government', 'academic', 'official', 'industry', 'news', 'user_file', 'other',
] as const

export const PRESENTATION_TYPES = [
  'educational', 'persuasive', 'informational', 'report', 'project', 'pitch',
  'tutorial', 'comparison', 'other',
] as const
export type PresentationType = (typeof PRESENTATION_TYPES)[number]

export const slidePlanSchema = z.object({
  purpose: z.enum(SLIDE_PURPOSES).catch('concept_explanation'),
  audienceQuestion: z.string(),
  keyMessage: z.string().min(1),
  visualType: z.enum(VISUAL_TYPES).catch('text'),
  layoutFamily: z.enum(LAYOUT_FAMILIES).catch('list'),
  transition: z.string().default(''),
  importance: z.enum(['essential', 'supporting', 'optional']).catch('supporting'),
})
export type SlidePlan = z.infer<typeof slidePlanSchema>

/** A claim as the model writes it. `id` and `verified` are computed later. */
export const generatedClaimSchema = z.object({
  statement: z.string().min(1),
  type: z.enum(CLAIM_TYPES).catch('general_fact'),
  sourceIds: z.array(z.string()).default([]),
  timeSensitive: z.boolean().catch(false),
  year: z.number().int().optional().catch(undefined),
})
export type GeneratedClaim = z.infer<typeof generatedClaimSchema>

export const deckBriefSchema = z.object({
  objective: z.string().min(1),
  audienceKnowledgeLevel: z.enum(['beginner', 'intermediate', 'advanced']).catch('beginner'),
  presentationType: z.enum(PRESENTATION_TYPES).catch('other'),
  freshnessRequired: z.boolean().catch(false),
  keyQuestions: z.array(z.string()).default([]),
})
export type DeckBrief = z.infer<typeof deckBriefSchema>

export const generatedCardSchema = z
  .object({
    plan: slidePlanSchema,
    /** Blueprint row id when one fits; optional since blueprints became guidance. */
    role: z.string().optional(),
    blocks: z.array(contentBlockSchema).min(1),
    visualStyle: visualStyleSchema,
    speakerNotes: z.string(),
    claims: z.array(generatedClaimSchema).default([]),
  })
  .refine((card) => card.blocks[0]?.type === 'heading', {
    message: 'blocks[0] must be a heading block (every card must start with its title)',
  })
export type GeneratedCard = z.infer<typeof generatedCardSchema>

export const generatedDeckSchema = z.object({
  title: z.string().min(1),
  blueprint: z.enum(['inform', 'persuade', 'story']),
  brief: deckBriefSchema,
  cards: z.array(generatedCardSchema).min(1),
})
export type GeneratedDeck = z.infer<typeof generatedDeckSchema>

export const sourceSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  publisher: z.string().default(''),
  url: z.string().optional(),
  publicationDate: z.string().optional(),
  sourceType: z.enum(SOURCE_TYPES).catch('other'),
})
export type Source = z.infer<typeof sourceSchema>

export const findingSchema = z.object({
  statement: z.string().min(1),
  value: z.string().optional(),
  unit: z.string().optional(),
  geography: z.string().optional(),
  population: z.string().optional(),
  year: z.union([z.number(), z.string()]).optional(),
  definition: z.string().optional(),
  sourceIds: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1).optional().catch(undefined),
})
export type Finding = z.infer<typeof findingSchema>

export const evidencePackSchema = z.object({
  sources: z.array(sourceSchema).default([]),
  findings: z.array(findingSchema).default([]),
  disagreements: z.array(z.string()).default([]),
})
export type EvidencePack = z.infer<typeof evidencePackSchema>

/** A claim after the pipeline has checked its sources against the pack. */
export interface Claim extends GeneratedClaim {
  id: string
  slideIndex: number
  verified: boolean
}

export const QUALITY_FLAG_TYPES = [
  'TITLE_TOO_LONG', 'BODY_TOO_DENSE', 'TOO_MANY_BULLETS', 'UNSUPPORTED_STATISTIC',
  'MISSING_SOURCE', 'OUTDATED_EVIDENCE', 'AMBIGUOUS_METRIC', 'CONFLICTING_CLAIM',
  'LAYOUT_REPETITION', 'TEXT_ONLY_DECK', 'WEAK_CONCLUSION', 'FILLER_SLIDE',
  'VISUAL_MISMATCH', 'DUPLICATE_CONTENT', 'OVERCLAIM', 'NARRATION_DUPLICATES_SLIDE',
] as const
export type QualityFlagType = (typeof QUALITY_FLAG_TYPES)[number]

export interface QualityFlag {
  type: QualityFlagType
  severity: 'low' | 'medium' | 'high'
  /** 0-based card index; absent for deck-level flags. */
  slideIndex?: number
  message: string
  suggestedAction: string
}

/** A replacement card from the repair call, addressed by 1-based slide number. */
export const repairResponseSchema = z.object({
  repairs: z.array(z.object({ slide: z.number().int().positive(), card: z.unknown() })).default([]),
})
export type RepairResponse = z.infer<typeof repairResponseSchema>
