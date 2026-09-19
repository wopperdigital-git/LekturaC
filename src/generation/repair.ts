import { generatedCardSchema, type Claim, type EvidencePack, type GeneratedCard, type GeneratedDeck, type RepairResponse, type Source } from './schemas'
import { yearOf } from './validation/evidence'

/**
 * Writes a repair call's replacement cards into `deck`, but only for slides
 * that were actually targeted — see the design spec's "[4] Targeted repair".
 * This is the same invariant `mergeNarration` (`engine/narration.ts`) holds
 * for hand-written scripts: a model reply is not itself permission to write
 * anywhere it likes, only to the slides the caller asked it to fix.
 *
 * A repair is dropped, rather than applied, when:
 * - its slide number doesn't map to one of `targets` (0-based `slide - 1`),
 * - that index falls outside the deck's own cards (a model-invented slide
 *   number), or
 * - the replacement doesn't parse as a `GeneratedCard` (a malformed reply
 *   must not corrupt a deck nothing here can regenerate).
 *
 * The deck's length never changes — only existing indices are ever replaced —
 * and the input `deck` is never mutated: a new deck object is returned, with
 * a shallow-copied `cards` array so untouched cards keep their original
 * object identity.
 */
export function applyRepairs(
  deck: GeneratedDeck,
  response: RepairResponse,
  targets: number[],
): { deck: GeneratedDeck; repaired: number[] } {
  const targetSet = new Set(targets)
  const cards = [...deck.cards]
  const repaired = new Set<number>()

  for (const repair of response.repairs) {
    const index = repair.slide - 1
    if (!targetSet.has(index)) continue
    if (index < 0 || index >= cards.length) continue
    const parsed = generatedCardSchema.safeParse(repair.card)
    if (!parsed.success) continue
    cards[index] = parsed.data
    repaired.add(index)
  }

  return {
    deck: { ...deck, cards },
    repaired: [...repaired].sort((a, b) => a - b),
  }
}

/** `publisher || title`, then `, ${year}` appended when the source's `publicationDate` names one. */
function citationLabel(source: Source): string {
  const name = source.publisher || source.title
  const year = yearOf(source.publicationDate)
  return year !== undefined ? `${name}, ${year}` : name
}

/**
 * `card.speakerNotes`, followed by a `Sources:` line built deterministically
 * from whichever of `claims` are verified — no on-slide citations, per the
 * design spec's "Ingest and storage" ("No on-slide citations in this work").
 *
 * `claims` is expected to already be scoped to this card (the same
 * `slideIndex`-filtered slice `validateDeck` computes per slide) — the
 * function itself has no way to tell which slide `card` is, since a
 * `GeneratedCard` carries no index.
 *
 * Citations are `publisher || title` plus the year from `publicationDate`
 * when known (`yearOf`), deduplicated and kept in the order their claim was
 * first cited. Notes are returned unchanged when nothing verified here cites
 * a source that is actually in `pack`, or when `pack` is `null`.
 */
export function notesWithCitations(card: GeneratedCard, claims: Claim[], pack: EvidencePack | null): string {
  if (!pack) return card.speakerNotes

  const sourcesById = new Map(pack.sources.map((source) => [source.id, source]))
  const labels: string[] = []
  const seen = new Set<string>()

  for (const claim of claims) {
    if (!claim.verified) continue
    for (const sourceId of claim.sourceIds) {
      const source = sourcesById.get(sourceId)
      if (!source) continue
      const label = citationLabel(source)
      if (seen.has(label)) continue
      seen.add(label)
      labels.push(label)
    }
  }

  if (labels.length === 0) return card.speakerNotes
  return `${card.speakerNotes}\n\nSources: ${labels.join('; ')}`
}
