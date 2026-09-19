import type { PipelineResult } from './pipeline'
import type { Claim, DeckBrief, QualityFlag, SlidePlan, Source } from './schemas'

/**
 * Everything the pipeline produced beside the deck itself, addressed by card
 * id rather than card index.
 *
 * Nothing reads this yet — it is stored purely so a later feature (citations
 * UI, a "why was this slide written this way" panel) has something to read
 * instead of needing the pipeline re-run. Keying by card id rather than array
 * position is what keeps it meaningful after cards are reordered or deleted:
 * an index would silently point at the wrong slide the moment the deck is
 * edited, while an id either still resolves or is harmlessly orphaned.
 */
export interface GenerationMeta {
  version: 1
  brief: DeckBrief
  sources: Source[]
  /** Keyed by card id; `result.deck.cards[i]`'s plan lands under `cardIds[i]`. */
  plans: Record<string, SlidePlan>
  /** Keyed by card id; every claim whose `slideIndex` is `i` lands under `cardIds[i]`. */
  claims: Record<string, Claim[]>
  flags: QualityFlag[]
  research: 'ok' | 'failed' | 'skipped'
  generatedAt: string
}

/**
 * Builds the metadata row for a freshly generated deck.
 *
 * `cardIds[i]` must pair with `result.deck.cards[i]` — the same
 * index-to-id correspondence `createDeckFromGeneration` establishes when it
 * mints each card's id, so this has to be called with the ids in that same
 * order, before anything reorders the cards.
 */
export function buildGenerationMeta(
  result: PipelineResult,
  cardIds: string[],
  generatedAt: string,
): GenerationMeta {
  const plans: Record<string, SlidePlan> = {}
  result.deck.cards.forEach((card, i) => {
    const id = cardIds[i]
    if (id === undefined) return
    plans[id] = card.plan
  })

  const claims: Record<string, Claim[]> = {}
  for (const id of cardIds) claims[id] = []
  for (const claim of result.claims) {
    const id = cardIds[claim.slideIndex]
    if (id === undefined) continue
    claims[id] = [...(claims[id] ?? []), claim]
  }

  return {
    version: 1,
    brief: result.deck.brief,
    sources: result.evidence?.sources ?? [],
    plans,
    claims,
    flags: result.flags,
    research: result.research,
    generatedAt,
  }
}
