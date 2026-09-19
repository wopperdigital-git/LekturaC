# Content generation pipeline: research, plan, write, validate, repair

**Date:** 2026-09-19
**Status:** approved design
**Source requirements:** `LEKTURA_CONTENT_GENERATION_SPEC.md` (repo root; product spec, §1–§49)
**Builds on:** `2026-09-18-slide-blueprint-design.md`, `2026-09-02-narration-page-design.md`

## The problem

A deck comes from one model call that plans, writes and picks visuals at once, and
nothing inspects what it wrote. A real 8-slide EV deck generated on 2026-09-19 showed
most of the product spec's failure list:

- a 13-word heading ("Global EV sales have surged to a significant share of new car
  registrations"), forced by the prompt's "every heading is a FULL-SENTENCE ASSERTION"
  rule;
- a filler slide ("You will learn three core insights…"), forced by the Inform
  blueprint's fixed `objectives` row and the prompt's "follow its sequence exactly";
- an ambiguous metric ("5.8% U.S. EV share" — EV or BEV? sales or registrations?);
- a tailpipe claim ("0 g CO₂") with no lifecycle context;
- 2022 figures under a present-tense "have surged";
- no source for any number, and no speaker notes.

## Decisions (made with the user, 2026-09-19)

| Question | Decision |
| --- | --- |
| Where facts come from | **Grounded search.** A research step runs before writing, via the provider's own search tool. |
| Blueprints | **Guidance, not rails.** The three arcs stay; objectives/agenda/roadmap rows become optional; the model plans each slide's purpose. |
| Speaker notes | **Written at creation, stored as narration.** `card.narration = { text, generated }`, so the Narrate page opens pre-filled. |
| Charts | **Not in this work.** The plan records `visualType` (including `line_chart`), validators use it, and trends still render as stats/timelines. |

## Measured constraints (2026-09-19)

- Groq `openai/gpt-oss-120b` and `openai/gpt-oss-20b` both support the built-in
  `browser_search` tool. One factual query returned a real IEA URL.
- **JSON mode cannot be combined with a tool** (`"json mode cannot be combined with
  tool/function calling"`), so the research call returns free text and the JSON
  inside it is extracted and parsed by us.
- One search query used 13.8k prompt tokens on the 20b model (1.3s, 3 tool calls) and
  62.7k on the 120b model (5.2s, 11 tool calls). The 120b model with
  `max_tokens: 3000` failed with `context_length_exceeded`. **Research uses
  `openai/gpt-oss-20b` with a modest `max_tokens`.** Groq's rate limits are per
  model, so research does not spend the 120b writer's window.
- Gemini's key returned 429 `RESOURCE_EXHAUSTED` on the probe, so Gemini grounding
  (`tools: [{ google_search: {} }]`) is implemented to the documented API but
  **untested live**. Gemini also disallows `responseMimeType: application/json` with
  tools, so it uses the same free-text-then-extract path.

## The pipeline

```
brief ──► [1] RESEARCH (best effort)           provider.research()        → EvidencePack | null
      ──► [2] PLAN + WRITE (one call)          provider.generateDeck()    → GeneratedDeck (v2)
      ──► [3] VALIDATE (deterministic)         validateDeck()             → QualityFlag[]
      ──► [4] REPAIR (≤ 1 call, targeted)      provider.repairSlides()    → replacement cards
      ──► [5] RE-VALIDATE                      validateDeck()             → final flags
      ──► ingest: notes → narration, meta → presentations.generation
```

`src/generation/pipeline.ts`'s `generatePresentation(provider, topic, brief, options)`
runs all five. `CreatePage` calls it instead of `provider.generateDeck` directly and
shows the current stage.

### Why one plan-and-write call, not separate planner and writer calls

Product spec §2 allows "one structured model call with multiple stages". The writer is
a reasoning model that spends about 3,400 tokens thinking before it emits anything,
and Groq's free tier allows about 8,000 tokens per minute. Separate planner, writer
and reviewer calls would each pay that overhead, trip the window and roughly triple
the wait. The model returns each slide's **plan beside its copy** in one JSON object,
and the plan fields come first in each card so they are generated before the copy
they govern.

### Generate-once is unchanged

Research, repair and the notes all happen **before the deck exists**. Nothing rewrites
a deck after `createDeckFromGeneration`. The rule "no code path asks the model for a
card's content a second time" stays literally true: the repair call runs inside the
single creation. It is not a regenerate button, and must not become one.

### [1] Research

`AIProvider.research(topic, brief, context, signal): Promise<EvidencePack>`.

- One call. The model identifies the 4–8 facts the deck most needs, searches, and
  returns `{ sources, findings, disagreements }` as JSON inside its text reply (§37).
  Every finding carries its context: value, unit, geography, population, year,
  definition, source ids and confidence.
- Parsing is lenient about the wrapper and strict about the content. The parser
  extracts the outermost `{…}`, strips `【…】` citation markers, and runs zod. Findings
  whose `sourceIds` name no returned source are dropped. So is a source with no URL
  and no publisher.
- **Best effort.** Any failure except cancellation (network, 400, parse failure,
  capacity on every provider) returns `null` and the deck is written without
  evidence. Its claims are then unverified and flagged. Research must never cost the
  user a deck. Cancellation propagates.
- **Skipped** when the guidance restricts the deck to the user's own material ("only
  use the facts I gave", "don't research", "no outside sources"). That is
  `sourceMode: 'user_material_only'` (§29), detected deterministically.

### [2] Plan + write: the v2 generated deck

```ts
{
  title: string
  blueprint: 'inform' | 'persuade' | 'story'
  brief: {                                   // §3, model-derived, conservative
    objective: string
    audienceKnowledgeLevel: 'beginner' | 'intermediate' | 'advanced'
    presentationType: 'educational' | 'persuasive' | 'informational' | 'report'
                    | 'project' | 'pitch' | 'tutorial' | 'comparison' | 'other'
    freshnessRequired: boolean
    keyQuestions: string[]
  }
  cards: [{
    plan: {                                  // §4 SlidePlan, generated first
      purpose: SlidePurpose                  // §4 list
      audienceQuestion: string
      keyMessage: string
      visualType: VisualType                 // §15 list
      layoutFamily: LayoutFamily             // §18 list
      transition: string                     // from the previous slide ('' on slide 1)
      importance: 'essential' | 'supporting' | 'optional'
    }
    role?: string                            // blueprint row id when one fits (was required)
    blocks: ContentBlock[]                   // unchanged block vocabulary, heading first
    visualStyle: 'structured' | 'expressive'
    speakerNotes: string                     // §21, explanation that is not on the slide
    claims: [{ statement, type, sourceIds: string[], timeSensitive: boolean, year?: number }]
  }]
}
```

- **The model never writes a source object.** It cites source ids from the evidence
  pack. The pipeline attaches the pack's own `Source` records, so a citation cannot
  be invented (§9, §36). An id that is not in the pack makes that claim unverified.
- `Claim.id` and `Claim.verified` are **computed**, not model-supplied. `verified`
  means the claim has at least one source id and every one of them is in the pack.
- Everything here that is new is required, except `role`. A deck missing `plan` or
  `speakerNotes` fails the shape check and gets the existing one self-correcting
  retry.

### Prompt changes (§6, §7, §11–13, §19–20, §26, §36)

- **Headings are short.** 3–10 words, 14 at most. They may be a label, a claim or a
  question, and the full-sentence rule goes. Banned openings include "This
  presentation/deck explains", "You will learn" and "In this slide".
- **Blueprints are narrative arcs to adapt, not sequences to copy.**
  `buildBlueprintSection` keeps carrying every column. Its instruction changes from
  "follow its sequence exactly … Do not add, drop, reorder or merge rows" to "use it
  as the arc; skip objectives/agenda/roadmap rows unless the deck is a formal lesson
  or the user asked for them; the slide count is still exact." `sequenceMismatch`
  stays a console warning.
- **Evidence rules.** Numbers, dates and named statistics come only from the evidence
  pack and cite its ids. Metrics state what, where, when and the unit. Approximate
  wording is used where the evidence is approximate, and decimals are never invented.
  Tailpipe and lifecycle claims are kept distinct. Wording is calibrated, never
  "proves/always/guarantees" beyond the evidence. Without an evidence pack: no
  specific statistics except well-established ones, approximate wording, and claims
  still listed so they can be flagged.
- **Visible text vs notes.** 20–50 words of visible text per slide (70 at most),
  bullets 3–5 of ≤12 words. Explanation goes in `speakerNotes` (40–90 words), which
  must add to the slide rather than repeat it.
- **Filler.** No agenda, objectives, "thank you" or "introduction" slides unless the
  presentation type warrants them. The last slide resolves the objective.
- **Today's date is in the prompt**, so "current" has a meaning (§10).

### Token budget

Plans, notes and claims roughly double the output per slide. `deckMaxTokens(count)` =
`clamp(count * 480 + 2600, 5200, 7000)`; `'auto'` → 7000. The floor clears the
writer's measured ~3,400 reasoning tokens. The ceiling stays under Groq's 8,000/min
window, the same bound `narrationMaxTokens` measured. At 10 slides that is 7,000
tokens with about 3,600 left for output after reasoning: tight but inside. **Risk,
accepted:** a 10-slide deck can truncate. That fails the shape check, is retried once
and then surfaces as an error. The 10-slide cap is what keeps this viable, so raising
`MAX_SLIDES` needs this budget revisited.

### [3] Deterministic validation (§33, §42)

`validateDeck(deck, context): QualityFlag[]`, where each flag is
`{ type, severity: 'low' | 'medium' | 'high', slideIndex?: number, message, suggestedAction }`.
Every rule below is pure and unit-tested.

| Flag | Rule | Severity |
| --- | --- | --- |
| `TITLE_TOO_LONG` | heading > 10 words / > 14 words | low / medium |
| `BODY_TOO_DENSE` | visible words excluding heading > 70; exempt purposes `timeline`, `references` | medium |
| `TOO_MANY_BULLETS` | a bulletList with > 6 items | low |
| `UNSUPPORTED_STATISTIC` | a stat block, or a percent/number-with-unit, on a slide with no verified claim | high with evidence pack, medium without |
| `MISSING_SOURCE` | a claim of type statistic/historical/scientific/comparison with no verified source | medium |
| `OUTDATED_EVIDENCE` | brief/topic needs freshness, claim `timeSensitive`, claim year or source year < currentYear − 2, claim type not `historical` | high |
| `AMBIGUOUS_METRIC` | a stat whose label has no 4-digit year, or no unit/scope word for a bare number | low |
| `CONFLICTING_CLAIM` | two stats with the same normalized label and different values, or two claims identical once numbers are removed but with different numbers | high |
| `LAYOUT_REPETITION` | three consecutive slides with the same **resolved** layout family (from `resolveLayout`, not the model's claim) | low |
| `TEXT_ONLY_DECK` | ≥ 4 slides and no stat/timeline/comparison/quote block anywhere | medium |
| `WEAK_CONCLUSION` | last slide's purpose not in summary/conclusion/recommendation/call_to_action | medium |
| `FILLER_SLIDE` | purpose `overview`/agenda-like heading ("agenda", "objectives", "what you will learn", "you will learn", "introduction", "thank you") when `presentationType` is not `educational`/`tutorial`; or an opening that begins "this presentation/deck/slide" | medium |
| `VISUAL_MISMATCH` | plan `visualType` timeline without timelineStep blocks, two_column_comparison/comparison_table without ≥ 2 comparisonGroups, metric_cards without a stat | low |
| `DUPLICATE_CONTENT` | two slides with the same normalized heading, or a bullet line repeated across slides | medium |
| `OVERCLAIM` | visible text uses proves / always / guarantees / completely eliminates / clearly superior / "zero emissions" without "tailpipe" | low |
| `NARRATION_DUPLICATES_SLIDE` | notes empty, or ≥ 70% of the notes' words also appear on the slide | medium |

Heuristics are deliberately conservative. A false "high" triggers a repair call, so a
rule that cannot be sure reports `low`, which is logged but never repaired.

### [4] Targeted repair (§35)

- `repairTargets(flags)` returns the slide indices carrying a flag that is high
  severity, or medium severity of a repairable type (`TITLE_TOO_LONG`,
  `BODY_TOO_DENSE`, `UNSUPPORTED_STATISTIC`, `MISSING_SOURCE`, `FILLER_SLIDE`,
  `WEAK_CONCLUSION`, `NARRATION_DUPLICATES_SLIDE`, `OUTDATED_EVIDENCE`,
  `CONFLICTING_CLAIM`). It returns at most 4 slides, most severe first. Deck-level
  flags with no slide index are never repaired.
- **At most one repair call per generation.** It receives the whole deck as context,
  the target slides' flags with their suggested actions, and the evidence pack, and it
  returns replacement cards `{ slide, card }` in the v2 card shape.
- **`applyRepairs(deck, repairs, targets)` writes only to targeted slides, whatever the
  model returned.** It is the same invariant as `mergeNarration`: a replacement for a
  slide that was not targeted is dropped, so is an out-of-range index, and so is a
  replacement that fails the card schema. It lives in a pure function so a test can
  fail when someone removes it.
- A repaired slide keeps the original's position. The slide count is never changed.
- **Best effort.** A repair failure other than cancellation keeps the unrepaired deck.
  The flags that remain after re-validation are logged and stored, not shown as
  errors.

### Ingest and storage

- `speakerNotes` becomes `card.narration = { text: notes, generated: notes }`. The
  Narrate page then reads those slides as `generated`. A later narration call treats
  them as regenerable, exactly as if narration had been generated there.
- **Migration `0011_add_generation_meta.sql`** adds
  `presentations.generation jsonb not null default '{}'`. It holds
  `{ version: 1, brief, sources, plans: Record<cardId, SlidePlan>,
  claims: Record<cardId, Claim[]>, flags, research: 'ok' | 'failed' | 'skipped',
  generatedAt }`: §28's "full metadata in the presentation project" and §15's tracked
  flags. **It is written in a separate, best-effort update after the insert**, and an
  error there is logged and never thrown. The deck must land on a project that has
  not run 0011, the lesson 0006 and 0008 taught. Nothing reads it yet.
- **No on-slide citations, and none appended to the notes either.** `speakerNotes`
  becomes a slide's narration script (see above) — a voice reads it aloud, so a
  "Source: IEA, 2025" line tacked onto the end would be read out loud along with
  the rest. Citations instead stay in the stored metadata: `presentations.generation`
  (migration `0011`, below) already carries the verified claims and their sources,
  keyed by card id, which is enough to build a citations view later without ever
  touching what gets spoken. A visible on-slide citation still needs a block or
  field the renderer, export and editor all understand — that is follow-up work,
  like charts.

### CreatePage

- It calls `generatePresentation` and shows the stage under the spinner: "Researching
  sources…", "Writing slides…", "Checking quality…", "Tightening N slides…".
- Cancel aborts whichever stage is running.

## Interfaces

- `AIProvider` gains `research(...)` and `repairSlides(...)`, and `FallbackProvider`
  wraps both with the existing capacity-only failover. Test stubs gain `vi.fn()` for
  them.
- `GeneratedDeck` becomes the v2 shape above. `createDeckFromGeneration` keeps its
  signature, plus an optional third argument carrying `{ sources, flags, research }`
  for the meta write.

## Not in this work

- A chart block and on-slide citations (both need renderer, export and editor work).
- A references slide. It would change the requested slide count.
- User file / YouTube input (§29–30): no such input exists yet. `sourceMode` is
  modelled so it can arrive.
- Showing quality flags in the UI. They are stored, not surfaced.
- A post-creation "fix this slide" action. That would break generate-once.

## Risks

- **Longer generation.** Research adds about 2–6s. Repair, when it fires, adds another
  writer call (about 20–40s).
- **Output truncation at 10 slides** (see Token budget).
- **Research reliability.** Search results vary. The parser drops anything unsourced,
  so a bad run shrinks the evidence pack rather than corrupting it.
- **Gemini grounding is untested live**, because the key was out of quota.
- **Heuristic flags.** Conservative severities keep false positives from triggering
  repairs.
