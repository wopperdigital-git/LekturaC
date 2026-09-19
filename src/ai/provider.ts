import { z } from 'zod'
import type { DeckContext, GenerationBrief } from './prompts'
import type { EvidencePack, GeneratedDeck, QualityFlag, RepairResponse } from '@/generation/schemas'

export type { GenerationBrief, DeckContext }

/*
  The generated-deck schema (and the v2 research/plan types around it) now
  live in `@/generation/schemas` — that module is the contract every later
  generation-pipeline task imports, so it can't depend back on `ai/provider`.
  Re-exported here so every existing `from '@/ai/provider'` import keeps
  working unchanged.
*/
export {
  generatedDeckSchema,
  type GeneratedCard,
  type GeneratedDeck,
  type EvidencePack,
  type QualityFlag,
  type RepairResponse,
} from '@/generation/schemas'

/**
 * One slide as the narration model sees it.
 *
 * Every slide in the deck is sent, whether or not a script is wanted for it: a
 * call that saw only the gaps would write transitions into nothing.
 *
 * `write` is what separates the two. It says the caller selected this slide, so
 * the model should return a script for it. `existingScript` is independent —
 * it is whatever the slide says today, supplied as context — and the two must
 * stay separate, because "not selected" and "already has a script" are
 * different facts: an empty slide the user left unticked must still not be
 * written, and deriving one from the other would silently request it.
 */
export interface NarrationSlide {
  slide: number
  heading: string
  lines: string[]
  write: boolean
  existingScript?: string
}

export const narrationResponseSchema = z.object({
  scripts: z
    .array(
      z.object({
        slide: z.number().int().positive(),
        text: z.string().min(1),
      }),
    )
    .min(1),
})

export type NarrationResponse = z.infer<typeof narrationResponseSchema>

export interface AIProvider {
  /**
   * `signal` is optional so a third provider may ignore it, but both current
   * implementations thread it into the fetch and the retry backoff alike, so
   * Cancel takes effect immediately rather than waiting a timer out.
   *
   * `context` is optional so `CreatePage`'s existing three-argument call
   * keeps compiling: it carries the evidence pack from `research()` (or
   * `null` when research was skipped/failed) plus today's date, both used by
   * `buildDeckUserPrompt`.
   */
  generateDeck(
    topic: string,
    brief: GenerationBrief,
    signal?: AbortSignal,
    context?: DeckContext,
  ): Promise<GeneratedDeck>

  /**
   * One best-effort research call before the deck is written (design spec
   * "[1] Research"). `today` is a plain argument rather than folded into
   * `DeckContext` because research is what *produces* the evidence that
   * `DeckContext.evidence` later carries — the two are not interchangeable.
   */
  research(
    topic: string,
    brief: GenerationBrief,
    today: string,
    signal?: AbortSignal,
  ): Promise<EvidencePack>

  /**
   * Fixes specific flagged slides after validation (design spec "[4] Targeted
   * repair"). `targets` are 0-based card indices — the same indexing
   * `QualityFlag.slideIndex` uses — and only those slides may come back
   * changed; nothing here rewrites the deck wholesale.
   */
  repairSlides(
    deck: GeneratedDeck,
    targets: number[],
    flags: QualityFlag[],
    context: DeckContext,
    signal?: AbortSignal,
  ): Promise<RepairResponse>

  /**
   * Writes an expanded spoken script for each slide that needs one.
   *
   * Deliberately NOT a second content generation: the scripts never touch a
   * card's `blocks`, are never rendered on a slide and are never exported. The
   * "generated once" rule is about the deck's content, which this does not
   * rewrite.
   */
  generateNarration(
    title: string,
    slides: NarrationSlide[],
    signal?: AbortSignal,
  ): Promise<NarrationResponse>
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
