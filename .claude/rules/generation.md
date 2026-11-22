---
paths:
  - "src/generation/**"
  - "src/ai/**"
  - "src/pages/CreatePage.tsx"
  - "src/components/create/**"
  - "src/lib/slideCount.ts"
  - "src/jobs/deckJob.ts"
  - "src/store/presentationStore.ts"
  - "src/engine/emphasis.ts"
  - "src/engine/roleLayout.ts"
---

# Deck creation, generation pipeline, AI providers

## Creation flow

1. `pages/CreatePage.tsx`: one-sheet brief (topic, slide count 1–`MAX_SLIDES` or `'auto'`, audience, detail level, optional guidance) beside a live badge preview. Draft saved every keystroke (see `brief-drafts.md` rule); the always-shown slide count only counts as an answer once something else is answered. Old one-question drafts resume via `pendingText`.
   - Tone was removed from the intake, not generation: `DEFAULT_TONE` (`'professional'`) is still sent. Restoring = `STEP_ORDER` + an `Answers` field + a sheet section.
   - `lib/slideCount.ts`: `MAX_SLIDES = 7`, default 5. **Raising `MAX_SLIDES` requires revisiting the Groq deck and narration token budgets**; past ~20 slides narration cannot complete.
   - `guidance` is injected as a hard constraint overriding the system prompt.
2. Generate hands the brief to `startDeckJob` (background job) and navigates to `/`. After the pipeline the job runs a cancellable **photo stage** (`generation/photos.ts` `addPhotos`): strips every model-written `image` block and appends one Pexels photo per card with an `imageQuery`. It runs even without a Pexels key (so invented URLs are still stripped); a non-cancel failure inserts the deck as generated; `imageQuery` is never stored. **Every provider must honour the abort signal in both `fetch` and backoff `sleep`.**
3. Output is validated against `generatedDeckSchema` (`generation/schemas.ts`). Enums use zod `.catch(default)` so an off-list value never costs a deck; shape errors get one retry with the exact zod errors; each card's first block must be a `heading`. Then `normalizeStructuredBlocks` (`generation/normalizeStructured.ts`, pure) cleans the structured blocks (no kicker on the title slide, one callout per slide, a lone point becomes a bold-term paragraph, long kickers dropped, a card with `code` loses its `imageQuery`). It runs after the deck call and after a landed repair.
   - **The Anthropic structured-output mirror (`ai/deckOutputSchema.ts`) uses loose shapes** (no `min(1)`/`.trim()`), because a mirror failure is a `response` error with no retry or failover. **Its block union is capped at nine variants**: Anthropic refuses a too-large grammar with a 400 (no failover, no deck). So no `image` variant, and `point` shares a variant with `timelineStep`. Probe the live API before adding a variant. Pinned by `ai/deckOutputSchema.test.ts`.
4. `store/presentationStore.ts` `insertGeneratedDeck` (write-only; what the job calls) creates `presentations` + `cards` atomically, prefills `narration` from `speakerNotes`, and writes `presentations.generation` best-effort. `createDeckFromGeneration` wraps it and also replaces the open deck.
5. `engine/emphasis.ts` `applyEmphasis` turns `*x*`/`**x**` into bold marks, stripping delimiters. Runs at ingest **and** at the read boundary (`cardFromRow`), so it must be idempotent (a run that already has marks is skipped).

"Skip and start blank" (`createDeck`) makes an empty project with no AI call.

**Blueprints** (`ai/slideBlueprints.ts`): three 10-slide master sequences with 5–10 scaling tables. The model picks one; the sequence is guidance, not rails (slide count is still exact). `sequenceMismatch` only warns. At ingest `roleLayoutHint` turns a role into a layout (so story slides can be heroes); the role is not stored.

**Token budgets** (per provider): Groq `deckMaxTokens` = `clamp(n*480 + 2600, 5200, 7000)` (Groq's 8,000 TPM free tier counts *requested* output; the 5200 floor clears gpt-oss-120b's ~3,400 reasoning tokens). Gemini `geminiDeckMaxTokens` = `clamp(n*700 + 3000, 6000, 12000)`.

## Generation pipeline (`src/generation/`)

`generatePresentation(provider, topic, brief, options)` → `{deck, evidence, research, claims, flags, repaired}`: research → plan+write → validate → repair → re-validate. Spec: `2026-09-19-content-generation-pipeline-design.md`.

- **One plan+write call**, not planner/writer/reviewer (reasoning model vs Groq's TPM window). Each card's `plan` is emitted before its `blocks`.
- **Research is best effort and must never cost a deck.** One `provider.research` call; any non-cancel failure → `research: 'failed'`. Skipped when `isUserMaterialOnly(guidance)` matches "only use the/my/these facts" (a bare "only use" is not enough). Research/repair use `maxRetries: 0`; research `maxTokens` 4000.
- **The model never writes a source object, only cites ids.** `verifyClaims` computes claim ids and `verified` (≥1 sourceId, all in the pack; false with no pack).
- **Slide 1 is always a title slide** (prompt + `OPENING_NOT_TITLE` repair + `generatedLayout` names card 0 `hero`).
- **Detail level sets density** from one table, `ai/detailLevel.ts` `DENSITY`, read by both prompts and validators. Change a level there, never in a prompt, or prompt and validator disagree.
- **Plain-language rules** (`ai/plainLanguage.ts`) ride in the deck, repair and narration prompts; the quiz gets only `PLAIN_WORDS_RULES`. Prompt-only, no validator. **Prompts contain no long dashes** (models copy their punctuation).
- **Prompt sizes are pinned in tests** (Groq counts input against its TPM window): deck system prompt ≤ 15,575 + 1,600 chars, repair ≤ 3,557 + 800. Sizes in prompts come from `densitySection`, not literals.
- **Validation** (`validateDeck`, 22 pure rules in `validation/structure.ts` and `validation/evidence.ts`). **Severities are deliberately conservative**: a false "high" buys an unneeded repair, so an unsure rule reports `low`. New structured-block flags are all `low`. List dominance is fixed in the prompt's VISUAL CHOICE section, not the classifier. Chart visual types are deliberately not checked against `stat` blocks (would push the writer to invent numbers).
- **Repair fires at most once**, on up to `MAX_REPAIR_SLIDES` (4) slides ranked by flags. `applyRepairs` never changes deck length or mutates input; a replacement omitting `role` keeps the original's. Failure keeps the unrepaired deck.
- **Ingest:** `speakerNotes` become `narration` exactly as written, **no citations** (a cloned voice reads it). No on-slide citations or references slide. `buildGenerationMeta` writes brief, sources, plans/claims keyed by card id, and flags to `presentations.generation`.
- **Fact check** (`generation/factCheck.ts`, pure): unsourced claims (none when research was `skipped`) show as an amber notice, outline dots and `FactCheckModal`; checked ids are stored as `reviewed`. Read/written by `generation/metaRow.ts` in its own best-effort calls, never in `loadDeck`'s select. No AI action; never shown in presenter, video or export.

## AI providers (`src/ai/`)

`AIProvider`: `generateDeck`, `research`, `repairSlides`, `generateNarration`; all take an optional `AbortSignal`.

- **Retry** (`ai/retry.ts`): 429/503 up to 3 times, 1s/2s/4s; a server `Retry-After` wins only if longer; clamped to 20s. `sleep()` is abortable.
- **Fallback** (`ai/fallbackProvider.ts`): chain `AnthropicProvider` → `GroqProvider` (`openai/gpt-oss-120b`, research on `gpt-oss-20b` + `browser_search`) → `GroqProvider` on `groq/compound` (no research) → `GeminiProvider`. A provider whose key is missing is left out.
  - **Only `capacity` failures (429/503/413) hand off.** An `auth` failover would hide a mistyped key; `request`/`response` fail identically on the backup. Mutation-tested.
  - **Cancellation never hands off**, or the deck the user walked away from still arrives.
  - The compound link's `research()` throws `capacity` before any network call (it 413s on any search prompt), so the chain skips to Gemini.
  - `groq/compound` ignores `response_format` and wraps replies; every JSON parser goes through `ai/jsonText.ts` `extractJsonObject`.
  - **Research runs through Claude's paid web search by default** (Anthropic leads the chain). Deliberate cost choice by the user; do not "fix" it back to Groq-first research.
