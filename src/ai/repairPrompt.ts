import { repairResponseSchema, type GeneratedCard, type GeneratedDeck, type QualityFlag, type RepairResponse } from '@/generation/schemas'
import { extractJsonObject } from './jsonText'
import { renderEvidencePack, type DeckContext } from './prompts'

/** At most one repair call per generation (design spec's "[4] Targeted repair"). */
export const REPAIR_MAX_TOKENS = 6000

/**
 * Design spec §39/§41: fix the slides that were flagged, not rewrite the
 * deck. Every other deck-generation rule (headings, density, evidence,
 * notes) still applies, because a repaired slide has to read as if it had
 * been written that way the first time.
 */
export const REPAIR_SYSTEM_PROMPT = `You are fixing specific slides of a presentation that has already been generated — you are repairing it, not writing a new deck.

You are given the whole deck for context, then a list of target slides, each with the problems it has and what to do about them.

For every target slide, write a full replacement card in the same shape the deck was generated in: { "plan": {...}, "role"?: string, "blocks": ContentBlock[], "visualStyle": "structured" | "expressive", "speakerNotes": string, "claims": [...] }. Keep that slide's purpose and its position in the deck — you are repairing it, not swapping in a different slide. If the slide you're given already has a "role", keep it. Fix every problem listed for it.

Every other rule from deck generation still applies:
- Headings are 3-10 words (14 at most), never more than one main idea per slide.
- Visible text is 20-40 words (55 at most) excluding the heading; bullets run 3-5 items of 8 words or fewer.
- Speaker notes are 40-90 words and never repeat the visible text.
- Every number, date, or quotation must come from the evidence pack when one is given, cited in "claims" by its source id. Do not add a new factual claim unless the evidence pack supports it.

Reply with ONLY this JSON object, no markdown fences and no commentary, and include exactly the slides you were asked to fix — no others:
{ "repairs": [ { "slide": number, "card": { "plan": {...}, "role"?: string, "blocks": [...], "visualStyle": "structured" | "expressive", "speakerNotes": string, "claims": [...] } } ] }

"slide" is the slide's 1-based position in the deck, matching the numbering you were given below.`

function headingTextOf(card: GeneratedCard): string {
  const first = card.blocks[0]
  return first && first.type === 'heading' ? first.text : ''
}

/**
 * The whole deck, compact: title, brief, and — for every card — its 1-based
 * slide number, heading and `plan.keyMessage`, never its full content. Only
 * the target slides below get their full card JSON — the model needs the
 * rest of the deck for continuity, not to rewrite it.
 */
function compactDeckJson(deck: GeneratedDeck): string {
  return JSON.stringify({
    title: deck.title,
    brief: deck.brief,
    cards: deck.cards.map((card, i) => ({
      slide: i + 1,
      heading: headingTextOf(card),
      keyMessage: card.plan.keyMessage,
    })),
  })
}

function targetSection(deck: GeneratedDeck, index: number, flags: QualityFlag[]): string {
  const slide = index + 1
  const card = deck.cards[index]
  const cardFlags = flags.filter((f) => f.slideIndex === index)
  const problems = cardFlags.map((f) => `- [${f.type}] ${f.message} → ${f.suggestedAction}`).join('\n')

  return `SLIDE ${slide} — fix this one
Problems:
${problems}

Current card JSON:
${JSON.stringify(card)}`
}

/**
 * The repair call's user prompt: today's date, the whole deck as compact JSON
 * for context, then the full card JSON and flags for each target slide, then
 * the evidence pack (or the no-evidence line) — see the design spec's "[4]
 * Targeted repair".
 *
 * `targets` holds 0-based card indices, the same indexing `QualityFlag.slideIndex`
 * uses, so a flag can be matched to its target without a second lookup.
 */
export function buildRepairUserPrompt(
  deck: GeneratedDeck,
  targets: number[],
  flags: QualityFlag[],
  context: DeckContext,
): string {
  const targetSections = targets.map((index) => targetSection(deck, index, flags)).join('\n\n')

  const evidenceSection =
    context.evidence && context.evidence.sources.length > 0
      ? `EVIDENCE PACK (cite these source ids; do not use any other source):\n${renderEvidencePack(context.evidence)}`
      : 'No verified evidence is available for this deck — do not add a new statistic, date, or quotation that is not already supported.'

  return `Today's date: ${context.today}

The deck, compact (title, brief, and every card's heading and key message):
${compactDeckJson(deck)}

Fix exactly these slides:

${targetSections}

${evidenceSection}

Return only the JSON object described in the system prompt, with one entry in "repairs" for each slide listed above.`
}

/**
 * `extractJsonObject` (tolerant of a markdown fence or prose wrapper) +
 * `JSON.parse` + `repairResponseSchema`; `null` on any failure.
 */
export function parseRepairResponse(raw: string): RepairResponse | null {
  const extracted = extractJsonObject(raw)
  if (extracted === null) return null

  let json: unknown
  try {
    json = JSON.parse(extracted)
  } catch {
    return null
  }
  const result = repairResponseSchema.safeParse(json)
  return result.success ? result.data : null
}
