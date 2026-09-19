# Content Generation Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single "prompt → slides" call with research → plan+write → deterministic validation → one targeted repair, storing speaker notes as narration and generation metadata on the deck.

**Architecture:** A new `src/generation/` module holds the v2 schemas, pure validators, the repair merge and the pipeline orchestrator. Providers gain `research` and `repairSlides`. `CreatePage` calls `generatePresentation` instead of `provider.generateDeck`. Everything happens before the deck is created, so the generate-once rule is untouched.

**Tech Stack:** TypeScript 6 (strict, `verbatimModuleSyntax`, `erasableSyntaxOnly`), zod, Vitest (node env), React 19, Supabase, Groq (`openai/gpt-oss-120b` writer, `openai/gpt-oss-20b` + `browser_search` research), Gemini fallback.

**Spec:** `docs/superpowers/specs/2026-09-19-content-generation-pipeline-design.md` (read it — it is binding). Product requirements behind it: `LEKTURA_CONTENT_GENERATION_SPEC.md`.

## Global Constraints

- Generate-once holds: no code path runs after `createDeckFromGeneration` that asks a model for card content. Research and repair run only inside `generatePresentation`.
- Best effort: research and repair failures (anything except cancellation) degrade silently to "no evidence" / "unrepaired deck". Only the plan+write call may fail a generation.
- Cancellation (`signal.aborted` or a `DOMException` named `AbortError`) always propagates and never fails over.
- `FallbackProvider` hands off only on `AIProviderError` with `kind === 'capacity'`, for every method.
- `applyRepairs` writes only to targeted slide indices; slide count never changes.
- Validators are pure (no React, no store, no fetch) and deterministic; `currentYear` is passed in, never read from `Date` inside a validator.
- Research model `openai/gpt-oss-20b` with `tools: [{ type: 'browser_search' }]`, **no** `response_format` (Groq rejects JSON mode with tools). Gemini research uses `tools: [{ google_search: {} }]` and **no** `responseMimeType`.
- Deck token budget: `deckMaxTokens(count) = clamp(count * 480 + 2600, 5200, 7000)`, `'auto'` → 7000.
- Migration 0011's column is written in a separate best-effort update; its failure is `console.warn`ed, never thrown.
- Type-check with `npx tsc -b; echo "EXIT=$?"` — its output is ANSI-coloured, so grepping for `error TS` misses errors. Lint baseline is 10 warnings (`npm run lint`); do not add warnings. Tests: `npx vitest run`.
- Commit after each task with a descriptive message ending in:
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`

---

### Task 1: v2 schemas

**Files:**
- Create: `src/generation/schemas.ts`
- Create: `src/generation/schemas.test.ts`
- Modify: `src/ai/provider.ts` (use the v2 deck schema; add research/repair types)
- Modify: `src/ai/deckSchema.test.ts`, `src/ai/fallbackProvider.test.ts` (fixtures to v2 shape)

**Interfaces — Produces:** everything exported below; `generatedDeckSchema`, `GeneratedDeck`, `GeneratedCard` re-exported from `@/ai/provider` so existing imports keep working.

- [ ] **Step 1: Write `src/generation/schemas.ts` exactly:**

```ts
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
```

Note `card: z.unknown()` in the repair response is deliberate: each replacement is validated individually by `applyRepairs` (Task 6), so one malformed card drops only itself rather than the whole repair.

- [ ] **Step 2: In `src/ai/provider.ts`** delete the local `blueprintIdSchema`, `generatedCardSchema`, `generatedDeckSchema`, `GeneratedDeck`; instead `export { generatedDeckSchema, type GeneratedDeck, type GeneratedCard } from '@/generation/schemas'` and import what the file itself uses. Do not change `AIProvider` yet (Task 5 does).

- [ ] **Step 3: Tests, `src/generation/schemas.test.ts`:**
  - a full v2 deck (one card with plan, blocks heading-first, visualStyle, speakerNotes, claims) parses;
  - a card missing `plan` fails; a card missing `speakerNotes` fails; a card whose first block isn't a heading fails;
  - an unknown `plan.purpose` (`'intro'`) parses as `'concept_explanation'` (the catch);
  - `role` is optional; `claims` defaults to `[]`; a claim with unknown `type` becomes `'general_fact'`;
  - `evidencePackSchema` parses `{}` to empty arrays; a source with unknown `sourceType` becomes `'other'`;
  - an unknown `blueprint` id fails.

- [ ] **Step 4: Update fixtures** in `src/ai/deckSchema.test.ts` and `src/ai/fallbackProvider.test.ts` (and any other test constructing a `GeneratedDeck`) to the v2 shape. Keep deckSchema.test's existing assertions' intent (blueprint required, unknown blueprint fails, a role the blueprint doesn't use still parses), changing only what the new shape forces — `role` is now optional, so replace "role is required" with "a card without role parses".

- [ ] **Step 5:** `npx tsc -b; echo "EXIT=$?"` — expect failures only in `presentationStore.ts`/`CreatePage.tsx` if any; fix narrowly so the build is green (the store's `createDeckFromGeneration` param type is structural and should already accept v2). `npx vitest run` green. Commit.

---

### Task 2: structural validators

**Files:**
- Create: `src/generation/validation/text.ts` (shared helpers)
- Create: `src/generation/validation/structure.ts`
- Create: `src/generation/validation/structure.test.ts`

**Interfaces — Consumes:** `GeneratedDeck`, `GeneratedCard`, `QualityFlag` (Task 1); `resolveLayout` from `@/engine/layoutEngine`.
**Produces:**
```ts
// text.ts
export function wordCount(text: string): number            // split on whitespace, ignore empty
export function headingOf(card: GeneratedCard): string     // blocks[0].text ('' if not heading)
export function visibleLines(card: GeneratedCard): string[] // every text field EXCEPT the heading:
  // paragraph.text, each bullet item, stat `${value} ${label}`, quote text (+attribution),
  // timelineStep `${label} ${text}`, comparisonGroup heading + items, image alt if any
export function normalize(text: string): string             // lowercase, strip punctuation, collapse spaces
// structure.ts
export function structureFlags(deck: GeneratedDeck): QualityFlag[]
```

Rules (exact thresholds; severity in brackets; every flag needs a one-sentence `message` naming the slide and a `suggestedAction`):

1. `TITLE_TOO_LONG` — heading words > 14 [medium]; else > 10 [low].
2. `BODY_TOO_DENSE` — words across `visibleLines` > 70 [medium], unless `plan.purpose` is `timeline` or `references`.
3. `TOO_MANY_BULLETS` — any bulletList with > 6 items [low].
4. `LAYOUT_REPETITION` — map each card's resolved layout (`resolveLayout('auto', card.blocks, { isFirstCard: i === 0 })`) to a family: hero→hero, statHero/statGrid→data, comparison→comparison, timeline→timeline, quote→quote, iconGrid→grid, numberedList→list, textFocus/standard/standardSplit→text, gallery→visual. Three consecutive cards with the same family → one flag [low] on the third card's index. `text` family counts. Do not use `plan.layoutFamily` — the model's claim is not what renders.
5. `TEXT_ONLY_DECK` — deck has ≥ 4 cards and no block of type stat/timelineStep/comparisonGroup/quote anywhere [medium], no slideIndex.
6. `WEAK_CONCLUSION` — last card's `plan.purpose` not in `summary|conclusion|recommendation|call_to_action` [medium], slideIndex = last.
7. `FILLER_SLIDE` [medium] — for card i:
   - normalized heading starts with or equals one of `agenda`, `objectives`, `learning objectives`, `what you will learn`, `you will learn`, `introduction`, `thank you`, `thanks`, `questions`, AND `deck.brief.presentationType` is not `educational`/`tutorial`; or
   - i === 0 and normalized heading starts with `this presentation`, `this deck`, `this slide`, `in this presentation` (any presentation type — spec §23).
8. `VISUAL_MISMATCH` [low] — `plan.visualType` is `timeline` and no timelineStep block; is `two_column_comparison`/`comparison_table` and fewer than 2 comparisonGroup blocks; is `metric_cards` and no stat block.
9. `DUPLICATE_CONTENT` [medium] — two cards with equal `normalize(heading)` (flag the later one); or a bullet item whose normalized text (≥ 4 words) appears on an earlier card (flag the later card, once per card).
10. `OVERCLAIM` [low] — any visible line or heading (case-insensitive, word-boundary) contains `proves`, `always`, `guarantees`, `guaranteed`, `completely eliminates`, `clearly superior`, or `zero emissions` not preceded within the same line by `tailpipe`. One flag per card.
11. `NARRATION_DUPLICATES_SLIDE` [medium] — `speakerNotes.trim()` empty; or ≥ 70% of the notes' normalized words (ignoring words ≤ 3 chars) appear in the card's heading + visible lines.

- [ ] **Step 1:** Write `structure.test.ts` first: one passing "clean deck" (5 varied cards, short titles, conclusion last, notes that add new words) producing `[]`; then one focused test per rule with the minimal card that trips it and one near-miss that does not (e.g. 10-word title → none, 11 → low, 15 → medium; 70 visible words → none, 71 → medium; timeline purpose with 90 words → none; "tailpipe zero emissions" → none). Build cards with a small `card(...)` factory in the test.
- [ ] **Step 2:** Run — fails (module missing). **Step 3:** implement. **Step 4:** tests pass, tsc EXIT=0. **Step 5:** commit.

---

### Task 3: evidence validators, claim verification, `validateDeck`, `repairTargets`

**Files:**
- Create: `src/generation/validation/evidence.ts`, `src/generation/validation/evidence.test.ts`
- Create: `src/generation/validation/validateDeck.ts`, `src/generation/validation/validateDeck.test.ts`

**Interfaces — Consumes:** Task 1 types; Task 2 `structureFlags`, `visibleLines`, `normalize`, `headingOf`.
**Produces:**
```ts
// evidence.ts
export const FRESHNESS_TERMS: readonly string[]  // today, current, currently, latest, recent, recently, modern, this year, nowadays, trends, trend
export function requiresFreshness(...texts: string[]): boolean   // any term at a word boundary, case-insensitive
export function yearOf(value: number | string | undefined): number | undefined  // first 4-digit 19xx/20xx
export function verifyClaims(deck: GeneratedDeck, pack: EvidencePack | null): Claim[]
  // id = `c${slideIndex + 1}-${n + 1}`; verified = sourceIds.length > 0 && every id in pack.sources
  // (always false when pack is null)
export interface EvidenceContext { pack: EvidencePack | null; currentYear: number; freshnessRequired: boolean }
export function evidenceFlags(deck: GeneratedDeck, claims: Claim[], ctx: EvidenceContext): QualityFlag[]
// validateDeck.ts
export interface ValidationContext extends EvidenceContext {}
export function validateDeck(deck: GeneratedDeck, ctx: ValidationContext): { flags: QualityFlag[]; claims: Claim[] }
  // claims = verifyClaims(deck, ctx.pack); flags = [...structureFlags(deck), ...evidenceFlags(deck, claims, ctx)]
export const REPAIRABLE: ReadonlySet<QualityFlagType>
  // TITLE_TOO_LONG, BODY_TOO_DENSE, UNSUPPORTED_STATISTIC, MISSING_SOURCE, FILLER_SLIDE,
  // WEAK_CONCLUSION, NARRATION_DUPLICATES_SLIDE, OUTDATED_EVIDENCE, CONFLICTING_CLAIM
export const MAX_REPAIR_SLIDES = 4
export function repairTargets(flags: QualityFlag[]): number[]
```

Rules:

1. `UNSUPPORTED_STATISTIC` — a card "has a figure" if it has a stat block, or any visible line/heading matches `/\d+(\.\d+)?\s?(%|percent|million|billion|trillion|x\b|×)/i` or a currency amount `/[$€£¥]\s?\d/`. If it has a figure and none of its claims is `verified` → flag [high] when `ctx.pack` has ≥ 1 source, else [medium].
2. `MISSING_SOURCE` — each claim of type statistic/historical/scientific/comparison that is not verified → [medium], one flag per card listing the count.
3. `OUTDATED_EVIDENCE` — only when `ctx.freshnessRequired`: a claim with `timeSensitive` true, type ≠ `historical`, whose year (claim.year, else the newest `yearOf(publicationDate)` among its sources) is < `currentYear - 2` → [high], one per card. Also skip a card whose `plan.purpose` is `timeline`.
4. `AMBIGUOUS_METRIC` [low] — a stat block whose `label` has no 4-digit year. One flag per card.
5. `CONFLICTING_CLAIM` [high] — (a) two stat blocks anywhere in the deck whose `normalize(label)` are equal and whose `value`s differ (flag the later card); (b) two claims whose statements, normalized and with every digit sequence replaced by `#`, are equal but whose digit sequences differ (flag the later claim's card).
6. `repairTargets`: take flags with a `slideIndex` where severity is `high`, or severity is `medium` and type ∈ `REPAIRABLE`; rank slides by (count of high, then count of medium) descending, ties by index ascending; return up to `MAX_REPAIR_SLIDES` indices **sorted ascending**.

- [ ] **Step 1:** Tests first. `evidence.test.ts`: `requiresFreshness('Current EV trends')` true, `('History of the steam engine')` false, `('recently')` true, `('currentness')` false; `yearOf('2024-05')` 2024, `yearOf(1999)` 1999, `yearOf('n/a')` undefined; `verifyClaims` with null pack → all unverified; unknown source id → unverified; all known → verified; ids are `c1-1`, `c1-2`, `c2-1`. One trip + one near-miss per rule (e.g. with currentYear 2026 and freshness on: a 2023 time-sensitive claim → flag, 2024 → none; a `historical` claim from 1990 → none; freshness off → none). `validateDeck.test.ts`: composes both lists; `repairTargets` ignores low flags and deck-level flags, ignores medium non-repairable (`AMBIGUOUS_METRIC` is low anyway; use `DUPLICATE_CONTENT` medium → ignored), caps at 4, returns ascending.
- [ ] **Steps 2–5:** fail → implement → pass (tsc EXIT=0) → commit.

---

### Task 4: prompts — deck, research, repair

**Files:**
- Modify: `src/ai/prompts.ts`
- Create: `src/ai/researchPrompt.ts`, `src/ai/researchPrompt.test.ts`
- Create: `src/ai/repairPrompt.ts`, `src/ai/repairPrompt.test.ts`
- Modify: `src/ai/blueprintPrompt.test.ts`
- Create: `src/ai/deckPrompt.test.ts`

**Interfaces — Consumes:** Task 1 schemas/types.
**Produces:**
```ts
// prompts.ts
export interface DeckContext { evidence: EvidencePack | null; today: string /* YYYY-MM-DD */ }
export const DECK_SYSTEM_PROMPT: string                         // rewritten, see below
export function buildDeckUserPrompt(topic: string, brief: GenerationBrief, context?: DeckContext): string
export function buildBlueprintSection(slideCount: number | 'auto'): string   // wording change only
export function renderEvidencePack(pack: EvidencePack): string  // compact lines: `[s1] IEA — Global EV Outlook 2024 (2024) <url>` then `- statement | value unit | geography | year | definition | sources: s1`
export function deckMaxTokens(slideCount: number | 'auto'): number  // clamp(count*480+2600, 5200, 7000); 'auto' → 7000
// researchPrompt.ts
export const RESEARCH_SYSTEM_PROMPT: string
export function buildResearchUserPrompt(topic: string, brief: GenerationBrief, today: string): string
export function parseEvidencePack(raw: string): EvidencePack | null
export function isUserMaterialOnly(guidance: string): boolean
// repairPrompt.ts
export const REPAIR_SYSTEM_PROMPT: string
export function buildRepairUserPrompt(deck: GeneratedDeck, targets: number[], flags: QualityFlag[], context: DeckContext): string
export function parseRepairResponse(raw: string): RepairResponse | null   // JSON.parse + repairResponseSchema; null on failure
export const REPAIR_MAX_TOKENS = 6000
```

**DECK_SYSTEM_PROMPT requirements** (rewrite; keep the ContentBlock shape list, the "no image blocks" rule, the visualStyle rule, the banned marketing words and the block-type usage guidance; replace the rest):
- Opens with the design spec's §36 framing: planning and writing a presentation, not an article; plan before writing.
- Output shape: the v2 JSON (title, blueprint, brief{…}, cards[{ plan{…}, role?, blocks, visualStyle, speakerNotes, claims[] }]) with every enum's allowed values listed inline. Say that `plan` is written first in each card and the copy must deliver `plan.keyMessage`.
- Headings: 3–10 words, never more than 14; label, claim or question; banned openings "This presentation", "This deck", "This slide", "You will learn", "In this slide". **Remove** the "FULL-SENTENCE ASSERTION" rule entirely.
- One main idea per slide; visible text 20–50 words (≤ 70) excluding heading; bullets 3–5 items of ≤ 12 words; timelines/quotes exempt.
- No filler slides: agenda/objectives/"what you will learn"/introduction/thank-you only when presentationType is educational or tutorial as a formal lesson, or the user asked. Final slide resolves the objective (summary, conclusion, recommendation or call to action).
- Speaker notes 40–90 words per slide: context, definitions, how a number was measured, transitions, caveats — never a copy of the visible text.
- Evidence: every number, date, named statistic or quotation must come from the EVIDENCE PACK when one is given and be listed in the card's `claims` with the pack's source ids. Never invent a source id, source, citation or quotation. Metrics state what/where/when/unit (e.g. "battery-electric share of new U.S. light-duty vehicle sales, 2024"). Use approximate wording where the evidence is approximate; never add decimal precision. Keep tailpipe and lifecycle emissions distinct. Calibrated language — no "proves", "always", "guarantees", "clearly superior" unless the evidence says so.
- Without an evidence pack: no specific statistics except long-established, widely known facts; phrase them approximately; still list them in `claims` with `sourceIds: []`.
- Freshness: when the topic says current/latest/today/trends, prefer the newest evidence and never present data older than two years as current.
- Visual choice: chronology → timelineStep run; alternatives → comparisonGroup pair; several related numbers → stats; a single striking number → one stat; categories → short bullet list; set `plan.visualType` to what the slide needs even when it is a chart type we render as stats.
- Avoid three consecutive slides with the same block pattern.

**`buildBlueprintSection` wording** — replace the "follow its sequence exactly … Do not add, drop, reorder or merge rows" instruction with: pick the ONE blueprint whose arc fits; use its sequence as the narrative arc; the slide count stays exact; you may merge or replace rows to serve the objective; **skip objectives/agenda/roadmap-style rows unless the deck is a formal lesson or the user asked for them**; when a card fills a row set `role` to that row's id, otherwise omit `role`. Keep carrying every column for `'auto'` and one column per blueprint for an exact count (existing tests for that stay).

**`buildDeckUserPrompt`**: adds `Today's date: <today>` and, when `context.evidence` has ≥ 1 source, an `EVIDENCE PACK (cite these source ids; do not use any other source)` section from `renderEvidencePack`; when evidence is null, a line saying no verified evidence is available and the no-evidence rules apply. Remove the closing "Write every card…" sentence only if it contradicts the new rules (it doesn't have to go).

**Research prompt**: system prompt per product spec §37 — identify the 4–8 facts this presentation most needs (definitions, key dates, the most decision-relevant statistics), search the web, prefer government/official/academic/established sources, return every fact with its context, preserve disagreement rather than picking a number, mark uncertainty via `confidence`, and **reply with one JSON object only** of shape `{ "sources": [{ "id": "s1", "title", "publisher", "url", "publicationDate", "sourceType" }], "findings": [{ "statement", "value", "unit", "geography", "population", "year", "definition", "sourceIds", "confidence" }], "disagreements": [string] }`. User prompt carries topic, audience, detail level, guidance and today's date.

**`parseEvidencePack(raw)`**: strip `【…】` markers; take the substring from the first `{` to the last `}`; `JSON.parse`; `evidencePackSchema.safeParse`; on failure return `null`. Then clean: drop sources lacking both `url` and `publisher`; drop findings whose `sourceIds` (after filtering to known ids) are empty; keep `sourceIds` filtered to known ids. Return `null` if no finding survives.

**`isUserMaterialOnly(guidance)`**: true when guidance (case-insensitive) matches any of: `only use`, `use only`, `only the facts`, `facts i gave`, `information i provided`, `no outside`, `don't research`, `do not research`, `no research`, `without research`, `stick to the facts i`.

**Repair prompt**: system prompt per product spec §39/§41 — you are fixing specific slides of an existing deck; return ONLY `{ "repairs": [{ "slide": <1-based>, "card": <full v2 card> }] }` for exactly the listed slides; keep each slide's purpose and position; fix every listed problem; keep all other rules of the deck prompt (headings, density, evidence, notes); do not add new factual claims unless supported by the evidence pack. User prompt: today's date; the whole deck as compact JSON (title, brief, and each card's heading + plan.keyMessage, 1-based); for each target the full card JSON plus its flags (`type`, `message`, `suggestedAction`); the evidence pack section (same `renderEvidencePack`) or the no-evidence line.

- [ ] **Step 1: tests first.**
  - `deckPrompt.test.ts`: system prompt contains `speakerNotes`, `plan`, `claims`, `keyMessage`; does NOT contain `FULL-SENTENCE`; user prompt contains the given `today` and `EVIDENCE PACK` and `[s1]` when a pack is given, and neither when evidence is null (and does contain the no-evidence line); `deckMaxTokens` 1 → 5200, 5 → 5200, 8 → 6440, 10 → 7000, 20 → 7000, 'auto' → 7000.
  - `blueprintPrompt.test.ts`: keep existing assertions except any that assert the old "exactly"/"Do not add, drop" wording; add: section mentions skipping objectives/agenda rows unless a formal lesson; still says the count is exact.
  - `researchPrompt.test.ts`: parses a clean JSON reply; parses a reply wrapped in prose and ```json fences with `【4†L7-L9】` markers; drops a finding citing an unknown id; drops a source with neither url nor publisher (and findings citing only it); returns null for non-JSON; returns null when no finding survives; `isUserMaterialOnly` true for "Only use the facts I gave you", false for "focus on costs".
  - `repairPrompt.test.ts`: user prompt names each target as its 1-based slide and includes each flag's `suggestedAction`; does not include full card JSON for non-targets; `parseRepairResponse` returns null for garbage and parses `{repairs:[{slide:2, card:{…}}]}`.
- [ ] **Steps 2–5:** fail → implement → pass (tsc EXIT=0, lint no new warnings) → commit.

---

### Task 5: providers — research, repair, deck context

**Files:**
- Modify: `src/ai/provider.ts` (interface), `src/ai/groqProvider.ts`, `src/ai/geminiProvider.ts`, `src/ai/fallbackProvider.ts`
- Modify: `src/ai/fallbackProvider.test.ts`, `src/ai/narrationFallback.test.ts` (stubs gain the new methods)
- Create: `src/ai/researchFallback.test.ts`

**Interfaces — Consumes:** Task 4 prompt builders/parsers, Task 1 types.
**Produces (added to `AIProvider`):**
```ts
generateDeck(topic: string, brief: GenerationBrief, signal?: AbortSignal, context?: DeckContext): Promise<GeneratedDeck>
research(topic: string, brief: GenerationBrief, today: string, signal?: AbortSignal): Promise<EvidencePack>
repairSlides(deck: GeneratedDeck, targets: number[], flags: QualityFlag[], context: DeckContext, signal?: AbortSignal): Promise<RepairResponse>
```

- **Groq `generateDeck`**: pass `context` to `buildDeckUserPrompt`; max tokens `deckMaxTokens(brief.slideCount)` (replaces the inline 260/800 formula). Keep the one self-correcting retry.
- **Groq `research`**: model constant `RESEARCH_MODEL = 'openai/gpt-oss-20b'`; body `{ model, messages: [system, user], tools: [{ type: 'browser_search' }], max_tokens: 2000, temperature: 0.3 }`, **no `response_format`**. Refactor `callGroq` to take an options object (`{ model, maxTokens, jsonMode, tools, temperature }`) so deck/narration keep JSON mode and research doesn't; same retry loop and error kinds. Parse with `parseEvidencePack`; `null` → throw `AIProviderError('Research returned no usable evidence', { kind: 'response' })`.
- **Groq `repairSlides`**: writer model, JSON mode, `REPAIR_MAX_TOKENS`, one self-correcting retry on `parseRepairResponse` null, then throw `kind: 'response'`.
- **Gemini** equivalents: `generateDeck` same context/budget change; `research` with `tools: [{ google_search: {} }]` and **no** `responseMimeType`, text = all `parts[].text` joined; `repairSlides` with JSON mime. Refactor `callGemini` to an options object likewise. Both must thread `signal` into fetch and `sleep`.
- **FallbackProvider**: add `research` and `repairSlides` with the identical failover loop (capacity-only, abort never hands off). Extract the loop into one private generic helper `private async run<T>(label: string, call: (p: AIProvider) => Promise<T>, signal?: AbortSignal): Promise<T>` and use it for all four methods; keep existing warning text shape `[ai] ${name} is out of capacity (...); falling back to ${next}` plus ` for ${label}` when label isn't `'deck'`.
- **`CreatePage` still compiles unchanged** (the new `generateDeck` params are optional).

- [ ] **Step 1:** Update stubs in the two existing test files (`research: vi.fn()`, `repairSlides: vi.fn()`). Write `researchFallback.test.ts` mirroring `narrationFallback.test.ts`: capacity on first → second's research result returned (both call counts); auth on first → throws, second never called; response kind → throws, no handoff; aborted signal → no handoff; same four for `repairSlides`.
- [ ] **Steps 2–5:** fail → implement → pass (tsc EXIT=0, lint baseline) → commit.

---

### Task 6: pipeline orchestrator and repair merge

**Files:**
- Create: `src/generation/repair.ts`, `src/generation/repair.test.ts`
- Create: `src/generation/pipeline.ts`, `src/generation/pipeline.test.ts`

**Interfaces — Consumes:** Tasks 1, 3, 4 (`isUserMaterialOnly`, `requiresFreshness`), 5 (`AIProvider`).
**Produces:**
```ts
// repair.ts
export function applyRepairs(deck: GeneratedDeck, response: RepairResponse, targets: number[]): { deck: GeneratedDeck; repaired: number[] }
  // for each repair: index = slide - 1; skip unless targets includes index; skip unless
  // generatedCardSchema.safeParse(card) succeeds; replace cards[index]. Never changes length.
  // Returns a new deck object (input not mutated) and the indices actually replaced, ascending.
export function notesWithCitations(card: GeneratedCard, claims: Claim[], pack: EvidencePack | null): string
  // speakerNotes, then — if any verified claim on this card cites sources — a blank line and
  // `Sources: IEA, 2024; U.S. DOE, 2023` (publisher || title, then yearOf(publicationDate) when known;
  // unique, in first-cited order). Unchanged notes when nothing verified.
// pipeline.ts
export type GenerationStage = 'research' | 'write' | 'validate' | 'repair'
export interface PipelineOptions {
  signal?: AbortSignal
  onStage?: (stage: GenerationStage, detail?: { slides: number }) => void
  now?: Date                      // defaults to new Date(); tests pass a fixed date
}
export interface PipelineResult {
  deck: GeneratedDeck             // repaired where repair succeeded; speakerNotes already carry citations
  evidence: EvidencePack | null
  research: 'ok' | 'failed' | 'skipped'
  claims: Claim[]                 // from the final validation
  flags: QualityFlag[]            // from the final validation
  repaired: number[]
}
export async function generatePresentation(provider: AIProvider, topic: string, brief: GenerationBrief, options?: PipelineOptions): Promise<PipelineResult>
```

Flow (must match exactly):
1. `today` = `now` as `YYYY-MM-DD` (UTC); `currentYear` = `now.getUTCFullYear()`.
2. If `isUserMaterialOnly(brief.guidance)` → research `'skipped'`, evidence null. Else `onStage('research')`; `provider.research(...)`; on success `'ok'`; on abort rethrow; on any other error `console.warn('[generation] research failed; writing without evidence:', message)`, `'failed'`, evidence null.
3. `onStage('write')`; `provider.generateDeck(topic, brief, signal, { evidence, today })` — errors propagate.
4. `onStage('validate')`; `freshnessRequired = deck.brief.freshnessRequired || requiresFreshness(topic, brief.guidance)`; `validateDeck(deck, { pack: evidence, currentYear, freshnessRequired })`.
5. `targets = repairTargets(flags)`. If non-empty: `onStage('repair', { slides: targets.length })`; `provider.repairSlides(deck, targets, flags, { evidence, today }, signal)`; `applyRepairs`; if anything was repaired, re-run validation for the final flags/claims. Abort rethrows; any other error → `console.warn('[generation] repair failed; keeping the unrepaired deck:', message)`.
6. Replace each card's `speakerNotes` with `notesWithCitations(card, claims, evidence)` (claims from the final validation).
7. `console.info('[generation] quality flags', flags)` when non-empty. Return the result.

- [ ] **Step 1: Tests first**, with a stub `AIProvider` whose methods are `vi.fn()` and that counts calls:
  - `repair.test.ts`: replacement for a targeted slide lands; replacement for an untargeted slide is dropped (**the invariant — this test must fail if the `targets` check is removed**); out-of-range slide dropped; schema-invalid card dropped while a valid sibling lands; length unchanged; input not mutated; `notesWithCitations` appends `Sources: IEA, 2024` for a verified claim citing a source published `2024-05`, leaves notes unchanged with no verified claims or null pack, de-duplicates publishers.
  - `pipeline.test.ts` (fixed `now = new Date('2026-09-19T00:00:00Z')`): research ok → `generateDeck` receives `{ evidence: pack, today: '2026-09-19' }`; research throws `AIProviderError` → still generates, `research: 'failed'`, evidence null; guidance "only use the facts I gave" → `research` never called, `'skipped'`; clean deck → `repairSlides` never called; deck with an 18-word heading → `repairSlides` called once with that slide's index and the repaired card is in the result with the flag gone; `repairSlides` rejects → result still returned with the original card; abort during research (signal aborted, research rejects with `DOMException('x','AbortError')`) → `generatePresentation` rejects and `generateDeck` is never called; `onStage` receives `research, write, validate` (and `repair` when repairing) in order.
- [ ] **Steps 2–5:** fail → implement → pass (tsc EXIT=0) → commit.

---

### Task 7: ingest, storage, migration, CreatePage

**Files:**
- Create: `supabase/migrations/0011_add_generation_meta.sql`
- Create: `src/generation/meta.ts`, `src/generation/meta.test.ts`
- Modify: `src/store/presentationStore.ts` (`createDeckFromGeneration`)
- Modify: `src/pages/CreatePage.tsx`

**Interfaces — Consumes:** Task 6 `generatePresentation`, `PipelineResult`, `GenerationStage`.
**Produces:**
```ts
// meta.ts
export interface GenerationMeta {
  version: 1
  brief: DeckBrief
  sources: Source[]
  plans: Record<string, SlidePlan>        // keyed by card id
  claims: Record<string, Claim[]>         // keyed by card id
  flags: QualityFlag[]
  research: 'ok' | 'failed' | 'skipped'
  generatedAt: string                     // ISO
}
export function buildGenerationMeta(result: PipelineResult, cardIds: string[], generatedAt: string): GenerationMeta
  // cardIds[i] pairs with result.deck.cards[i]; claims grouped by claim.slideIndex; sources = evidence?.sources ?? []
```

- **Migration 0011**: `alter table public.presentations add column if not exists generation jsonb not null default '{}'::jsonb;` with a header comment in the style of 0006/0008 explaining it holds generation metadata (brief, sources, plans, claims, quality flags), that nothing reads it yet, and that the app writes it best-effort so an un-migrated project still creates decks.
- **`createDeckFromGeneration(deck, requestedCount, meta?)`**: third optional param `meta?: { result: PipelineResult }` (or the `PipelineResult` itself — pick one and document it). Each card gets `narration: { text: card.speakerNotes, generated: card.speakerNotes }` when notes are non-empty (in memory **and** in the cards insert as `narration`; migration 0008 is already required for any card write — see CLAUDE.md). Keep the blueprint `sequenceMismatch` warning but skip it when cards have no roles. `roleLayoutHint(c.role, blocks)` unchanged. After both inserts succeed, when `meta` is given: `supabase.from('presentations').update({ generation: buildGenerationMeta(...) }).eq('id', id)`; on error `console.warn('[generation] could not store generation metadata (run migration 0011):', error.message)` — never throw.
- **`CreatePage`**: replace `provider.generateDeck(...)` with `generatePresentation(provider, t, briefObj, { signal: controller.signal, onStage })`, then `createDeckFromGeneration(result.deck, count, result)`. Hold a `stage` state; the spinner line that currently reads "Writing slides from your brief · {elapsed}s" shows, by stage: research → "Researching sources", write → "Writing slides from your brief", validate → "Checking quality", repair → `Tightening ${n} slide(s)`, each followed by ` · {elapsed}s`. Reset stage when generation ends. Cancel/abort behaviour unchanged.

- [ ] **Step 1:** `meta.test.ts` first: plans keyed by card id in order; claims grouped under the right card id (a claim with slideIndex 1 lands under `cardIds[1]`); cards with no claims get `[]`; sources empty when evidence null; `version` 1; `generatedAt` passed through.
- [ ] **Steps 2–4:** implement; `npx vitest run`, tsc EXIT=0, `npm run lint` baseline, `npm run build` succeeds.
- [ ] **Step 5:** commit.

---

### Task 8: documentation

**Files:**
- Modify: `CLAUDE.md`

- [ ] Update, accurately and in the file's existing voice:
  - **Data flow** step 2–5: the pipeline (research best-effort via `openai/gpt-oss-20b` + `browser_search`, JSON mode impossible with tools; plan+write v2 shape; deterministic validation; ≤1 targeted repair; notes → narration; meta → `presentations.generation`), the new token budget and its 10-slide risk, blueprints now guidance (objectives/roadmap rows optional; `role` optional; sequence check still a warning), headings now short (the full-sentence rule is gone).
  - A new **### Generation pipeline (`src/generation/`)** section: stages, why one plan+write call, generate-once unchanged (repair runs before the deck exists — not precedent for a regenerate button), the model never writes a source object, `verified` computed, conservative severities, `applyRepairs` invariant, research never costs a deck, Gemini grounding untested live, no on-slide citations yet (they go in notes), charts and references slide deferred.
  - **Narration page**: speaker notes now pre-fill narration as `generated` at creation.
  - **Persistence**: migration 0011 and that it's written best-effort.
  - **Test list** in Commands: add `generation/schemas.test.ts`, `validation/structure.test.ts`, `validation/evidence.test.ts`, `validation/validateDeck.test.ts`, `repair.test.ts`, `pipeline.test.ts`, `meta.test.ts`, `ai/researchPrompt.test.ts`, `ai/repairPrompt.test.ts`, `ai/deckPrompt.test.ts`, `ai/researchFallback.test.ts`, each with one clause on what it guards.
- [ ] Commit.
