# AI Writes Structured Blocks (Phase 2, part 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** New decks arrive with kickers, term rows, callouts and (in programming decks) code, and with headings that state the point, without any new AI call or any new reason for a repair.

**Architecture:** The generation schema and its Anthropic mirror accept the Part 1 blocks; the deck and repair prompts teach them; a pure `normalizeStructuredBlocks` cleans the model's output inside `generatePresentation` (after the reply and after a repair) before validation; the validators count and bind the new blocks without raising anything new above `low`.

**Tech Stack:** TypeScript, zod, Vitest (mocked `fetch`/fake providers).

**Spec:** `docs/superpowers/specs/2026-11-19-ai-structured-blocks-design.md` (read it whole; its "my call" lines are binding).

## Global Constraints

- No new provider call anywhere; "generate once" holds (only new decks change).
- None of the new rules sends a slide to repair on its own: new validator cases are `low`; `VISUAL_MISMATCH` for `definitions`/`code_example` is `low`; the existing cases keep their severities.
- Deck system prompt grows by at most **1,600** characters over its length before Task 4 edits it (measured at the start of Task 4 and pinned as a number); repair system prompt by at most **800**.
- No long dashes (`—`, `–`) in any prompt text.
- Size numbers live in `src/ai/detailLevel.ts` and reach the model through `densitySection`, never as literals in the system prompts: point meaning = level `bulletWords`, run = level `bulletItems` capped at `MAX_POINT_RUN = 6`, callout = level `bulletWords + 6`, code ≤ `CODE_MAX_LINES = 12` lines of ≤ `CODE_MAX_LINE_CHARS = 60` characters.
- Commits name exact paths (never `git add -A`) and end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Claude returns `"label": ""` in a point or omits a callout's label: the deck still arrives (mirror is loose; real schema's one retry with errors handles a required-empty) — Task 1 test.
2. A model writes three callouts, a lone point, a 6-word kicker and a kicker on the title slide in one deck: the stored deck has one callout per slide, a bold-term paragraph, no long kicker, no title kicker, and no `VISUAL_MISMATCH` caused by the clean-up — Task 2 test.
3. A repair returns a card with two callouts: the cleaned version is what gets validated and stored — Task 2 pipeline test.
4. A balanced slide of 5 points plus a callout plus a kicker is not `BODY_TOO_DENSE`; a code slide with 12 long lines is neither dense nor thin — Task 3 test.
5. A deck generated on Groq with the longer prompt: the prompt growth stays inside the pinned caps — Task 4 test (the live Groq run is by hand, for the user).

---

### Task 1: Generation schema and Anthropic mirror

**Files:** `src/generation/schemas.ts`, `src/ai/deckOutputSchema.ts`, `src/engine/contentBlocks.ts` (export the three block schemas if not already), tests (`src/generation/schemas.test.ts` or the existing schema test, `src/ai/deckOutputSchema.test.ts`, `src/generation/repair.test.ts`).

**Interfaces (produces):**
- `generatedBlockSchema` = the eight original shapes with the heading keeping `kicker: z.string().trim().min(1).max(80).optional().catch(undefined)`, plus `point {label: trimmed min(1), text: trimmed min(1)}`, `callout {label: optional catch(undefined), text: trimmed min(1)}`, `code {code: min(1) (not trimmed: leading spaces are code), label?, caption? (optional catch(undefined))}`.
- `VISUAL_TYPES` gains `'definitions'` and `'code_example'`.
- `deckOutputSchema.ts`: its own loose shapes for the three blocks and the heading's optional `kicker` (plain `z.string()`, no trim/min/catch), per the file's header rule.

- [ ] **Step 1:** Reverse the Part 1 tests that pin refusal: the deck schema, `applyRepairs` and the mirror now **accept** `point`, `callout`, `code` and a heading `kicker`; `image` is still refused where it was. New tests: empty `point.label` fails the real schema; empty `callout.label`, `code.caption` and `kicker` are dropped (parsed as absent); the mirror accepts `""` in every new string field (Review Focus 1); `plan.visualType: 'definitions'` and `'code_example'` parse.
- [ ] **Step 2:** `npx vitest run src/generation src/ai` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm run test`, `npm run lint`, `npm run build` → pass.
- [ ] **Step 5:** Commit: `feat(generation): the model may write kickers, points, callouts and code`.

### Task 2: Safety net and pipeline wiring

**Files:** Create `src/generation/normalizeStructured.ts` (+ `.test.ts`); modify `src/generation/pipeline.ts` (+ its test).

**Interfaces (produces):** `normalizeStructuredBlocks(deck: GeneratedDeck): GeneratedDeck` (pure; never mutates input; untouched cards keep object identity; same card count), exporting `KICKER_MAX_WORDS = 4`, `KICKER_MAX_CHARS = 32`. Rules, in order per card: (1) card 0: drop its heading's `kicker`; (2) every `callout` after the first on a card → `{type:'paragraph', text: label ? \`${label}: ${text}\` : text}`; (3) a `point` with no `point` immediately before or after → `{type:'paragraph', text: \`**${label}**: ${text}\`}`, and if the card then holds no `point` and `plan.visualType === 'definitions'`, set it to `'text'`; (4) a heading `kicker` over `KICKER_MAX_WORDS` words or `KICKER_MAX_CHARS` characters (after trim) → removed. `generatePresentation` applies it to the model's deck right after `provider.generateDeck` returns and to the deck `applyRepairs` returns, before each `validateDeck`.

- [ ] **Step 1:** Failing tests: each rule; a deck needing none is returned with every card identical (`toBe`); idempotent (twice = once); card count unchanged; every word of a converted block appears in its paragraph; a card with points `[p, p, paragraph, p]` keeps the run and converts the third point; Review Focus 2 as one combined deck; pipeline with a fake provider returning a card with two callouts → result has one callout and one paragraph, and `flags` were computed on the cleaned deck; a fake repair returning two callouts → cleaned (Review Focus 3).
- [ ] **Step 2–4:** fail, implement, full suite/lint/build pass.
- [ ] **Step 5:** Commit: `feat(generation): clean up structured blocks before validation`.

### Task 3: Validators

**Files:** `src/ai/detailLevel.ts` (constants only), `src/generation/validation/text.ts`, `src/generation/validation/structure.ts`, `src/generation/validation/validateDeck.ts` (if severities/REPAIRABLE live there), `src/generation/schemas.ts` (`QUALITY_FLAG_TYPES`), tests.

**Interfaces (produces):** `MAX_POINT_RUN = 6`, `CODE_MAX_LINES = 12`, `CODE_MAX_LINE_CHARS = 60` exported from `src/ai/detailLevel.ts`. `QUALITY_FLAG_TYPES` gains `'POINT_RUN_TOO_LONG'`, `'CODE_TOO_LONG'`, `'CALLOUT_REPEATS_HEADING'` (all emitted `low`, none in `REPAIRABLE`).

- Visible text: `visibleLines` includes each point's label and text; excludes the kicker, callouts and code.
- `BODY_TOO_DENSE`: a card holding `code` is exempt (like timeline/quote). `BODY_TOO_THIN`: a card holding `code` is exempt.
- `VISUAL_MISMATCH`: `definitions` with fewer than 2 points, `code_example` with no code → flag at **`low`**; existing cases unchanged (medium).
- `LIST_DOMINANT`: a point-run card is not list-led (already true; pin it).
- `POINT_RUN_TOO_LONG`: any consecutive run of more than `MAX_POINT_RUN` points. `CODE_TOO_LONG`: a code block with more than `CODE_MAX_LINES` lines or any line longer than `CODE_MAX_LINE_CHARS`. `CALLOUT_REPEATS_HEADING`: `normalize(callout.text)` equals or contains `normalize(heading)` (existing `normalize` in `text.ts`).

- [ ] **Step 1:** Failing tests for each bullet, plus Review Focus 4 (balanced 5 points + callout + kicker under 55 counted words → no `BODY_TOO_DENSE`; 12-line code slide → no dense/thin flag), and that `repairTargets` never selects a slide whose only flags are the new ones (mutation-check: making `VISUAL_MISMATCH` for `definitions` medium fails a test).
- [ ] **Step 2–4:** fail, implement, full suite/lint/build pass.
- [ ] **Step 5:** Commit: `feat(validation): count and bind structured blocks without new repairs`.

### Task 4: Prompts and docs

**Files:** `src/ai/prompts.ts`, `src/ai/repairPrompt.ts`, `src/ai/detailLevel.ts` (`densitySection`), tests (`src/ai/deckPrompt.test.ts`, a repair prompt test, `src/ai/detailLevel.test.ts`), `CLAUDE.md`.

**Interfaces (consumes):** Task 3's constants; Task 1's visual types (the prompt's visual-type list is built from `VISUAL_TYPES`).

- Before editing, record `DECK_SYSTEM_PROMPT.length` and `REPAIR_SYSTEM_PROMPT.length` on the branch as it stands (Task 3 done) and pin `DECK_BASE_LENGTH`/`REPAIR_BASE_LENGTH` in the tests: deck ≤ base + 1,600, repair ≤ base + 800 (Review Focus 5).
- Deck prompt content per the spec's "Prompt" section: the four block shapes; HEADINGS rewritten (state the point as a short claim; a question or topic label only for the title slide or a part-opening slide; word limits kept); KICKER (1 to 3 words naming the part or topic, shared by consecutive slides of one part, on most content slides, never on the title slide, never repeating the heading); VISUAL CHOICE lines for `definitions` (2 to 6 terms with meanings → point run) and `code_example` (one code block, only when the subject is programming or computing); the callout line (single most important takeaway, one sentence, label such as "Key idea", "Remember" or "Watch out", at most one per slide, about one slide in three, never repeating the heading); a definitions or code slide holds only heading, at most one short paragraph and the points or code; IMAGES: skip `imageQuery` on `definitions` and `code_example` slides; SPEAKER NOTES: explain code, never read it out character by character; the visual-type binding sentence names the two new bindings. If over the cap, cut the SPEAKER NOTES line first, then words from the binding sentence.
- `densitySection(level)` gains lines built from `DENSITY[level]` and Task 3's constants: point run rows `bulletItems` (6 at most), label 1 to 4 words, meaning ≤ `bulletWords`; callout ≤ `bulletWords + 6` words; code ≤ `CODE_MAX_LINES` lines of ≤ `CODE_MAX_LINE_CHARS` characters.
- Repair prompt: the four block shapes and one compact line each for kicker, callout, definitions and code_example.
- `CLAUDE.md`: Creation flow / Generation pipeline / Validation (the new block types the model writes, the safety net and where it runs, the low flags, the mirror's loose shapes, the prompt caps); remove the Part 1 statement that the AI cannot write them; note the live check is the user's.

- [ ] **Step 1:** Failing tests: each block shape present; HEADINGS no longer says "a topic label, a clear claim, or a question"; KICKER, callout, definitions, code_example lines present (assert on distinctive phrases); no `—`/`–` in either prompt; the caps; `densitySection` for each level carries the point, callout and code numbers from the table (and `detailLevel.test.ts` checks a full point run + callout fits the level's `maxVisibleWords` when the callout is uncounted, i.e. run alone ≤ max); repair prompt carries the four shapes.
- [ ] **Step 2–4:** fail, implement, full suite/lint/build pass.
- [ ] **Step 5:** Commit: `feat(prompts): teach the deck and repair prompts the structured blocks; docs`.
