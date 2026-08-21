import { z } from 'zod'
import { contentBlockSchema, visualStyleSchema } from '@/engine/contentBlocks'
import type { GenerationBrief } from './prompts'

export type { GenerationBrief }

const generatedCardSchema = z
  .object({ blocks: z.array(contentBlockSchema).min(1), visualStyle: visualStyleSchema })
  .refine((card) => card.blocks[0]?.type === 'heading', {
    message: 'blocks[0] must be a heading block (every card must start with its title)',
  })

export const generatedDeckSchema = z.object({
  title: z.string().min(1),
  cards: z.array(generatedCardSchema).min(1),
})

export type GeneratedDeck = z.infer<typeof generatedDeckSchema>

export interface AIProvider {
  /**
   * `signal` is optional so a third provider may ignore it, but both current
   * implementations thread it into the fetch and the retry backoff alike, so
   * Cancel takes effect immediately rather than waiting a timer out.
   */
  generateDeck(
    topic: string,
    brief: GenerationBrief,
    signal?: AbortSignal,
  ): Promise<GeneratedDeck>
}

export class AIProviderError extends Error {}
