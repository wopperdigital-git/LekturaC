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

/**
 * Why a generation attempt failed, at the granularity a caller needs to decide
 * whether trying a *different* provider could plausibly help.
 *
 * - `capacity`  — 429/503. The provider is busy or this key's quota is spent.
 *                 Nothing is wrong with the request, so another provider is
 *                 likely to succeed with it. The only kind worth failing over.
 * - `auth`      — 401/403, or no key configured at all. A misconfigured key is
 *                 a problem the user has to fix; silently succeeding on a
 *                 second provider would bury it.
 * - `request`   — other 4xx. We sent something the API rejected; it will be
 *                 rejected everywhere.
 * - `response`  — the call succeeded but the content wasn't a usable deck.
 * - `unknown`   — anything unclassified, treated as non-failoverable.
 */
export type AIFailureKind = 'capacity' | 'auth' | 'request' | 'response' | 'unknown'

export function kindForStatus(status: number): AIFailureKind {
  if (status === 429 || status === 503) return 'capacity'
  if (status === 401 || status === 403) return 'auth'
  if (status >= 400 && status < 500) return 'request'
  return 'unknown'
}

export class AIProviderError extends Error {
  readonly kind: AIFailureKind
  readonly status?: number

  constructor(message: string, options?: { kind?: AIFailureKind; status?: number }) {
    super(message)
    this.name = 'AIProviderError'
    this.kind = options?.kind ?? 'unknown'
    this.status = options?.status
  }
}
