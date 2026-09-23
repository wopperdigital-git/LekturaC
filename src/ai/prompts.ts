import { BLUEPRINTS, FIELD_PLAYBOOK, sequenceFor, type BlueprintId } from './slideBlueprints'
import { NARRATION_STYLE_RULES } from './narrationPrompt'
import { DEFAULT_SLIDE_COUNT, MAX_SLIDES } from '@/lib/slideCount'
import {
  CLAIM_TYPES,
  PRESENTATION_TYPES,
  SLIDE_PURPOSES,
  VISUAL_TYPES,
  type EvidencePack,
} from '@/generation/schemas'

export interface GenerationBrief {
  audience: string
  detailLevel: 'simplified' | 'balanced' | 'detailed'
  tone: 'professional' | 'casual' | 'bold'
  /** Exact number of cards to generate, or 'auto' to let the model choose a count that fits the topic. */
  slideCount: number | 'auto'
  /** Free-text user intent: what the deck should focus on or steer clear of. Empty string if skipped. */
  guidance: string
}

/**
 * What the deck prompt needs from the pipeline that isn't part of the brief:
 * the evidence pack (`null` when research was skipped, failed, or the user
 * asked for their own material only) and today's date, so "current" means
 * something (design spec §10).
 */
export interface DeckContext {
  evidence: EvidencePack | null
  /** YYYY-MM-DD */
  today: string
}

const DETAIL_LEVEL_INSTRUCTIONS: Record<GenerationBrief['detailLevel'], string> = {
  simplified:
    'Keep it high-level and easy to skim. Favor short, punchy statements over thorough explanations. Avoid jargon. One idea per card, stated plainly.',
  balanced:
    'Balance clarity with useful substance. Include real specifics, but do not overload any single card — say the one thing that matters most, well.',
  detailed:
    'Go deep: precise data, technical specifics and the mechanism behind each point — keep the slide itself within the visible-text limits and put the extended justification in speakerNotes.',
}

const TONE_INSTRUCTIONS: Record<GenerationBrief['tone'], string> = {
  professional: 'Polished, confident, business-appropriate language.',
  casual: 'Warm, conversational, approachable language, like explaining it to a friend.',
  bold: 'Punchy, high-energy, provocative language that grabs attention and takes a clear stance.',
}

/**
 * The tone every deck is generated with while the brief doesn't ask for one.
 *
 * `tone` stays a required field of `GenerationBrief` and the three
 * instructions above stay live: the question was removed from the intake, not
 * the concept, so restoring it is a UI change and nothing here has to move.
 */
export const DEFAULT_TONE: GenerationBrief['tone'] = 'professional'

// Enum value lists for the prompt, built FROM the schema's own arrays so the
// prompt can never drift from what `generatedDeckSchema` will actually accept.
const PRESENTATION_TYPE_LIST = PRESENTATION_TYPES.map((v) => `"${v}"`).join(' | ')
const SLIDE_PURPOSE_LIST = SLIDE_PURPOSES.map((v) => `"${v}"`).join(' | ')
const VISUAL_TYPE_LIST = VISUAL_TYPES.map((v) => `"${v}"`).join(' | ')
const CLAIM_TYPE_LIST = CLAIM_TYPES.map((v) => `"${v}"`).join(' | ')

export const DECK_SYSTEM_PROMPT = `You are planning and writing a presentation, not an article. Your job is to help an audience understand a topic through a sequence of slides, each one scanned in seconds — not a document broken into pages.

Before writing any slide's visible text, plan the whole deck: identify the presentation's objective, decide what the audience must understand, build a logical narrative arc, give every slide one purpose and one key message, decide which claims need evidence, and choose the most effective visual form for each slide. Do not default to bullet lists or cards out of habit.

That plan is what you write first. Every card's "plan" object comes before its "blocks" in your output, and everything in "blocks" exists to deliver plan.keyMessage — the one thing that slide has to say.

Output ONLY valid JSON (no markdown fences, no commentary) matching exactly this shape:

{
  "title": string,
  "blueprint": "inform" | "persuade" | "story",
  "brief": {
    "objective": string,
    "audienceKnowledgeLevel": "beginner" | "intermediate" | "advanced",
    "presentationType": ${PRESENTATION_TYPE_LIST},
    "freshnessRequired": boolean,
    "keyQuestions": string[]
  },
  "cards": [
    {
      "plan": {
        "purpose": ${SLIDE_PURPOSE_LIST},
        "audienceQuestion": string,
        "keyMessage": string,
        "visualType": ${VISUAL_TYPE_LIST},
        "transition": string,
        "importance": "essential" | "supporting" | "optional"
      },
      "role"?: string,
      "blocks": ContentBlock[],
      "visualStyle": "structured" | "expressive",
      "speakerNotes": string,
      "claims": [{ "statement": string, "type": ${CLAIM_TYPE_LIST}, "sourceIds": string[], "timeSensitive": boolean, "year": number }]
    }
  ]
}

"role" is optional — set it only when this card fills a row from the STRUCTURE section below, and omit it otherwise. "claims" lists every factual claim the card makes (see EVIDENCE below); an empty array is correct for a card with no factual claims. "transition" is one short phrase from the previous slide into this one ('' on the first card).

Each ContentBlock is one of these EXACT shapes (field names matter, do not rename or omit fields):
- { "type": "heading", "text": string }
- { "type": "paragraph", "text": string }
- { "type": "bulletList", "items": string[] }
- { "type": "stat", "value": string, "label": string }
- { "type": "quote", "text": string, "attribution"?: string }
- { "type": "timelineStep", "label": string, "text": string }
- { "type": "comparisonGroup", "heading": string, "items": string[] }

Do not use any block type other than the ones listed above (in particular, do not include "image" blocks — we don't have a reliable image source right now, so text/data layouts only). Every card's "blocks" array MUST start with exactly one "heading" block — this is the card's title and is required, not optional.

HEADINGS
- 3-10 words, never more than 14.
- A topic label, a clear claim, or a question — never a generic AI-report sentence.
- Never open with "This presentation", "This deck", "This slide", "You will learn", or "In this slide".
- Example: "EV adoption is accelerating", not "Global EV sales have surged to a significant share of new car registrations".

ONE MAIN IDEA PER SLIDE
- Exactly one idea per card. Everything on it supports plan.keyMessage; do not cram in a second, unrelated point.
- Visible text — everything except the heading — is 20-40 words, 55 at most. Timelines and quotes are exempt from this ceiling.
- Bullet lists run 3-5 items, each 8 words or fewer.

NO FILLER SLIDES
- Do not add an agenda, "objectives", "what you will learn", introduction, or "thank you" slide by default. Only include one when presentationType is "educational" or "tutorial" and this is a formal lesson, or the user explicitly asked for it.
- The final slide must resolve the deck's objective: a summary, conclusion, recommendation, or call to action — never a bare sign-off.

SPEAKER NOTES
Write "speakerNotes" as the actual words a presenter would say out loud for this slide — not a summary of it.
${NARRATION_STYLE_RULES}
- Add context that is not on the slide: definitions, how a number was measured, caveats, and a transition into and out of the slide. Never copy or lightly reword the visible text.

EVIDENCE
- Every number, date, named statistic, or quotation must come from the EVIDENCE PACK when the user prompt includes one, and must be listed in that card's "claims" with the pack's own source ids in "sourceIds". Never invent a source id, a source, a citation, or a quotation.
- State what a metric measures, where, when, and its unit — e.g. "battery-electric share of new U.S. light-duty vehicle sales, 2024", not "EV share: 5.8%".
- Use approximate wording ("about", "roughly", "more than") where the evidence itself is approximate. Never add decimal precision the evidence doesn't have.
- Keep tailpipe emissions and lifecycle emissions distinct — never collapse "zero tailpipe emissions" into "zero emissions".
- Use calibrated language. Do not write "proves", "always", "guarantees", or "clearly superior" unless the evidence pack genuinely supports it; prefer "suggests", "is associated with", "tends to", "can".
- Without an evidence pack: do not invent specific statistics. Long-established, widely known facts are fine, stated approximately — still list them in "claims", with "sourceIds": [].
- A "quote" block attributed to a real person or organization must be a verbatim quotation from the evidence pack, cited in that card's "claims" with the pack's source id. Without a supporting quotation in the pack, use a "quote" block only for the deck's own unattributed thesis or mission line.

FRESHNESS
- Today's date is given in the user prompt. When the topic asks about what's current, latest, or trending, prefer the newest evidence available and never present data more than two years old as current.

VISUAL CHOICE
Choose each slide's information structure before you choose its wording. Ask what shape the point has, then pick the block that draws that shape. Do not reach for a "bulletList" merely because a slide has several points — a bullet list is the fallback for items that are parallel and unordered, not the default for anything with more than one part.
- Sequence, steps, chronology, cause → effect → a run of "timelineStep" blocks.
- Two or more alternatives, before/after, pros/cons → "comparisonGroup" blocks.
- Quantitative evidence → "stat" blocks: one striking number as a single "stat", several related numbers as 2-4 together.
- One explanatory idea → a single short "paragraph".
- A thesis or a verbatim quotation → a "quote" block.
- Only 3-5 parallel items where order does not matter (categories, features, criteria) → a short "bulletList".
- plan.visualType must be the structure the blocks actually deliver, because the slide is drawn from the blocks and not from the plan: "timeline" or "process_flow" needs 2+ "timelineStep" blocks; "two_column_comparison" or "comparison_table" needs 2+ "comparisonGroup" blocks; "metric_cards" needs "stat" blocks; "quote" needs a "quote" block; "text" means a "paragraph"; "icon_grid" means a "bulletList". We cannot draw charts, maps, diagrams, photos or illustrations, so never plan one of those as the visualType. A trend or a set of numbers is "metric_cards" — but only when the numbers are real (from the evidence pack, or long-established and widely known); with no such numbers, use a different structure instead of inventing them.
- Vary the structure across the deck on purpose. In a deck of 5 or more slides no more than about 40% of the slides should be "bulletList" slides, never put two "bulletList" slides next to each other, and use at least three different block structures across the deck when the subject supports it. Avoid three consecutive cards using the same block-type pattern:
  - Use a single "stat" block for a card that leads with one striking number (market size, growth rate, performance metric, savings, etc).
  - Use 2-4 "stat" blocks together on one card when several related numbers belong side by side (e.g. three KPIs, a before/after pair plus the delta) — this reads far better as one card than as several single-stat cards in a row.
  - Use 2-4 "comparisonGroup" blocks together when contrasting options/approaches/before-vs-after.
  - Use 2-5 "timelineStep" blocks together for anything sequential (process, history, roadmap, funding stages).
  - Use a single "quote" block for the deck's own unattributed thesis or mission line, or for a verbatim quotation from the evidence pack attributed to a real person or organization (cite it in "claims" — see EVIDENCE above). Omit "attribution" for the deck's own thesis/mission line; set it whenever the line is someone else's words.
  - Use "bulletList" for scannable lists: 3-5 items by default, never more than 6 on one card. Short items (each under ~6 words) read as a compact grid; longer or more detailed items read as a clean numbered list. This cap is never a reason to drop or blur a real item — a genuinely longer sequence is chronological (use "timelineStep" instead) or belongs split across two cards, which likely changes the slide's purpose too.
  - Use 2+ "paragraph" blocks on a card only when the content is truly prose-driven — a narrative beat, a nuanced explanation with no natural list/comparison/number shape. Otherwise prefer a single "paragraph" of 35 words or fewer, and only when no more specific block type fits.

CONTENT QUALITY
- Be concrete and specific, never generic. Ground claims in named entities, real-world comparables, timeframes, or examples — not vague qualities.
- NEVER use vague marketing filler. Do not write sentences that could apply to literally any company in any industry. Banned words/phrases: "revolutionize", "revolutionary", "cutting-edge", "empower", "unlock", "seamless", "game-changing", "state-of-the-art", "innovative solution", "unique technology", "leverage", "synergy", "best-in-class", "next-generation".
- Bad (too generic): "Our platform provides efficient and affordable solutions for customers." Good (specific): "Our routing algorithm skips congested highways by re-scoring routes every 90 seconds, instead of once at dispatch like competitors."

Every card also needs a "visualStyle": "structured" or "expressive" — this picks between two visual treatments of whatever layout the card ends up with, independent of block content. Use "expressive" for cards that should feel bold or visually striking (a pivotal stat, a big turning point, a rallying quote); use "structured" for calmer, more informational cards. Vary it across the deck rather than defaulting to one value throughout — but don't force a mechanical alternation either; let it follow the actual rhythm of the content.

Set "blueprint" to the id of the structure you chose in the STRUCTURE section below.`

// Kept in step with `slideCount.ts`'s `MAX_SLIDES`/`DEFAULT_SLIDE_COUNT`
// (imported values, not duplicated numbers) — 'auto' must never be able to
// pick a count the UI itself would refuse to accept typed in directly.
const AUTO_COUNTS = Array.from(
  { length: MAX_SLIDES - DEFAULT_SLIDE_COUNT + 1 },
  (_, i) => DEFAULT_SLIDE_COUNT + i,
)

function renderSequence(id: BlueprintId, count: number): string {
  return sequenceFor(id, count)
    .map((spec, i) => `  ${i + 1}. [${spec.role}] ${spec.label} — ${spec.instruction}`)
    .join('\n')
}

/**
 * The blueprint half of the user prompt.
 *
 * The model chooses the blueprint, so it cannot be handed one sequence — it is
 * handed all three and told to pick. With an exact count that is one column
 * each (~600 tokens). With 'auto' the count is unknown too, so every column
 * goes (~1200 tokens): the merges in those columns are the doc's own content,
 * and a model inventing its own would make the exactness pointless.
 *
 * The sequence is a narrative arc to adapt, not rows to copy — the model may
 * merge or replace rows, and should skip objectives/agenda/roadmap-style rows
 * unless the deck is a formal lesson or the user asked for them. The slide
 * count itself stays exact either way.
 */
export function buildBlueprintSection(slideCount: number | 'auto'): string {
  const playbook = FIELD_PLAYBOOK.map(
    (e) => `  - ${e.field} · ${e.type} → ${BLUEPRINTS[e.blueprint].name}. ${e.note}`,
  ).join('\n')

  const blueprints = (Object.keys(BLUEPRINTS) as BlueprintId[])
    .map((id) => {
      const b = BLUEPRINTS[id]
      const sequences =
        slideCount === 'auto'
          ? AUTO_COUNTS.map((count) => `  At ${count} slides:\n${renderSequence(id, count)}`).join('\n')
          : renderSequence(id, slideCount)
      return `${b.name} (id: ${b.id})\n  Use for: ${b.useFor}\n  Why this order: ${b.logic}\n${sequences}`
    })
    .join('\n\n')

  const instruction =
    slideCount === 'auto'
      ? `Pick the ONE blueprint whose arc fits this deck's goal, then choose a slide count between ${DEFAULT_SLIDE_COUNT} and ${MAX_SLIDES} that suits the topic's depth. Once chosen, the slide count is exact.`
      : "Pick the ONE blueprint whose arc fits this deck's goal. The slide count above is exact."

  return `STRUCTURE — choose a blueprint and use its sequence as the narrative arc

${instruction}
Use the sequence below as the arc, not a template to copy row for row: you may merge or replace rows to serve this deck's objective, and skip objectives/agenda/roadmap-style rows unless the deck is a formal lesson or the user explicitly asked for them. When a card fills one of these rows, set that card's "role" to the row's bracketed id; when it doesn't, omit "role".

Field playbook (match the deck to a row, then use that row's blueprint):
${playbook}

${blueprints}`
}

/**
 * Output budget for one deck generation call.
 *
 * `clamp(count * 480 + 2600, 5200, 7000)`. Plans, notes and claims roughly
 * double the output per slide versus the old blocks-only shape, so the floor
 * and ceiling both moved up from the block-only budget. The floor clears the
 * writer's measured ~3,400 reasoning tokens (see `narrationMaxTokens`, which
 * measured the same overhead on the same model); the ceiling stays inside
 * Groq's free-tier 8,000-token/minute window. See the design spec's "Token
 * budget".
 */
export function deckMaxTokens(slideCount: number | 'auto'): number {
  if (slideCount === 'auto') return 7000
  return Math.min(7000, Math.max(5200, slideCount * 480 + 2600))
}

/**
 * Gemini's own deck token budget — deliberately not `deckMaxTokens`.
 *
 * That budget is tuned to Groq's free-tier 8,000-token/minute window, which
 * has nothing to do with Gemini; reusing it just imports an unrelated
 * provider's ceiling. Gemini has no such per-minute cap in this app's usage,
 * so its budget can sit well above the writer's measured ~3,400-token
 * reasoning overhead without risk of tripping a window that doesn't apply to
 * it — `clamp(slideCount * 700 + 3000, 6000, 12000)`, `12000` for `'auto'`.
 */
export function geminiDeckMaxTokens(slideCount: number | 'auto'): number {
  if (slideCount === 'auto') return 12000
  return Math.min(12000, Math.max(6000, slideCount * 700 + 3000))
}

/**
 * Compact, prompt-ready rendering of an evidence pack: one line per source,
 * then one line per finding, so the model can cite `[s1]`-style ids without
 * re-reading a nested JSON structure.
 */
export function renderEvidencePack(pack: EvidencePack): string {
  const sourceLines = pack.sources.map((s) => {
    const publisher = s.publisher ? `${s.publisher} — ` : ''
    const year = s.publicationDate ? ` (${s.publicationDate})` : ''
    const url = s.url ? ` ${s.url}` : ''
    return `[${s.id}] ${publisher}${s.title}${year}${url}`
  })
  const findingLines = pack.findings.map((f) => {
    const valueUnit = [f.value, f.unit].filter(Boolean).join(' ')
    const year = f.year ?? ''
    const definition = f.definition ?? ''
    const geography = f.geography ?? ''
    return `- ${f.statement} | ${valueUnit} | ${geography} | ${year} | ${definition} | sources: ${f.sourceIds.join(', ')}`
  })
  return [...sourceLines, ...findingLines].join('\n')
}

export function buildDeckUserPrompt(topic: string, brief: GenerationBrief, context?: DeckContext): string {
  const audience = brief.audience.trim() || 'a general audience'
  const guidance = brief.guidance.trim()

  const todaySection = context ? `\nToday's date: ${context.today}\n` : ''
  const evidenceSection = !context
    ? ''
    : context.evidence && context.evidence.sources.length > 0
      ? `\nEVIDENCE PACK (cite these source ids; do not use any other source):\n${renderEvidencePack(context.evidence)}\n`
      : '\nNo verified evidence is available for this deck — the no-evidence rules apply: no specific statistics except long-established, widely known facts, phrased approximately, still listed in "claims" with "sourceIds": [].\n'

  return `Create a presentation about: ${topic.trim()}
${todaySection}
Slide count: ${
    brief.slideCount === 'auto'
      ? `choose between ${DEFAULT_SLIDE_COUNT} and ${MAX_SLIDES} cards (never more than ${MAX_SLIDES}), whichever best fits the topic's depth and the requested detail level. Don't pad with filler or cram; end on a natural close.`
      : `exactly ${brief.slideCount} cards. Not approximately — exactly this many.`
  }
Audience: ${audience}
Detail level: ${brief.detailLevel} — ${DETAIL_LEVEL_INSTRUCTIONS[brief.detailLevel]}
Tone: ${brief.tone} — ${TONE_INSTRUCTIONS[brief.tone]}
${evidenceSection}
${buildBlueprintSection(brief.slideCount)}
${guidance ? `\nUSER'S EXPLICIT INTENT (hard constraint — follow this over the general content rules wherever they conflict): ${guidance}\n` : ''}
Write every card specifically for this audience at this detail level and tone.`
}
