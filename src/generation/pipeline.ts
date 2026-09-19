import { isUserMaterialOnly } from '@/ai/researchPrompt'
import type { AIProvider, DeckContext, GenerationBrief } from '@/ai/provider'
import { applyRepairs, notesWithCitations } from './repair'
import type { Claim, EvidencePack, GeneratedDeck, QualityFlag } from './schemas'
import { requiresFreshness } from './validation/evidence'
import { repairTargets, validateDeck } from './validation/validateDeck'

/**
 * What stage of one `generatePresentation` call is in progress, for a caller
 * that wants to show it (`CreatePage`'s spinner copy — see the design spec's
 * "CreatePage"). `'repair'` only ever fires when there's something to repair;
 * a clean deck's pipeline never reaches it.
 */
export type GenerationStage = 'research' | 'write' | 'validate' | 'repair'

export interface PipelineOptions {
  signal?: AbortSignal
  onStage?: (stage: GenerationStage, detail?: { slides: number }) => void
  /** Defaults to `new Date()`. Tests pass a fixed date so `today`/`currentYear` are deterministic. */
  now?: Date
}

export interface PipelineResult {
  /** Repaired where repair succeeded; every card's `speakerNotes` already carries its citations. */
  deck: GeneratedDeck
  evidence: EvidencePack | null
  research: 'ok' | 'failed' | 'skipped'
  /** From the final validation — post-repair when a repair actually landed. */
  claims: Claim[]
  /** From the final validation — post-repair when a repair actually landed. */
  flags: QualityFlag[]
  repaired: number[]
}

/**
 * User-initiated cancellation, exactly as `ai/fallbackProvider.ts` treats it:
 * either the caller's own signal is already aborted, or the rejection itself
 * is the browser's abort error. Both must propagate rather than degrade to a
 * "failed" outcome, or Cancel would silently keep going.
 */
function isAbort(err: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true
  return err instanceof DOMException && err.name === 'AbortError'
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** `now` as `YYYY-MM-DD`, in UTC — never the caller's local timezone. */
function toUtcDateString(now: Date): string {
  return now.toISOString().slice(0, 10)
}

/**
 * Runs the whole creation-time pipeline for one deck — research, write,
 * validate, and (when needed) one targeted repair pass — and returns a deck
 * whose speaker notes already carry their citations. See the design spec's
 * "The pipeline", "Generate-once is unchanged" and "[4] Targeted repair".
 *
 * Research and repair are both best effort: any failure other than
 * cancellation degrades silently (logged with `console.warn`) rather than
 * failing the whole generation, because a deck the user is waiting on should
 * not be lost over a step that only makes it better. `generateDeck` is the
 * one call whose errors propagate — there is no deck without it.
 */
export async function generatePresentation(
  provider: AIProvider,
  topic: string,
  brief: GenerationBrief,
  options: PipelineOptions = {},
): Promise<PipelineResult> {
  const now = options.now ?? new Date()
  const today = toUtcDateString(now)
  const currentYear = now.getUTCFullYear()
  const { signal, onStage } = options

  let evidence: EvidencePack | null = null
  let research: PipelineResult['research']

  if (isUserMaterialOnly(brief.guidance)) {
    research = 'skipped'
  } else {
    onStage?.('research')
    try {
      evidence = await provider.research(topic, brief, today, signal)
      research = 'ok'
    } catch (err) {
      if (isAbort(err, signal)) throw err
      console.warn('[generation] research failed; writing without evidence:', messageOf(err))
      research = 'failed'
      evidence = null
    }
  }

  const context: DeckContext = { evidence, today }

  onStage?.('write')
  let deck = await provider.generateDeck(topic, brief, signal, context)

  onStage?.('validate')
  const freshnessRequired = deck.brief.freshnessRequired || requiresFreshness(topic, brief.guidance)
  let { flags, claims } = validateDeck(deck, { pack: evidence, currentYear, freshnessRequired })

  const targets = repairTargets(flags)
  const repaired: number[] = []

  if (targets.length > 0) {
    onStage?.('repair', { slides: targets.length })
    try {
      const response = await provider.repairSlides(deck, targets, flags, context, signal)
      const result = applyRepairs(deck, response, targets)
      deck = result.deck
      repaired.push(...result.repaired)
      if (result.repaired.length > 0) {
        const revalidated = validateDeck(deck, { pack: evidence, currentYear, freshnessRequired })
        flags = revalidated.flags
        claims = revalidated.claims
      }
    } catch (err) {
      if (isAbort(err, signal)) throw err
      console.warn('[generation] repair failed; keeping the unrepaired deck:', messageOf(err))
    }
  }

  deck = {
    ...deck,
    cards: deck.cards.map((card, index) => ({
      ...card,
      speakerNotes: notesWithCitations(
        card,
        claims.filter((claim) => claim.slideIndex === index),
        evidence,
      ),
    })),
  }

  if (flags.length > 0) {
    console.info('[generation] quality flags', flags)
  }

  return { deck, evidence, research, claims, flags, repaired }
}
