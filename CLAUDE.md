# CLAUDE.md

Guidance for Claude Code in this repo. Long-form rationale lives in `docs/superpowers/specs/*` and in code comments; this file holds the invariants and gotchas you can't get by reading one file. Older detail (per-test inventories, browser-check logs, accepted minor quirks) is in git history of this file.

## Commands

```
npm run dev       # Vite dev server (localhost:5173)
npm run build     # tsc -b && vite build — type-checks before bundling
npm run lint      # oxlint (type-aware via oxlint-tsgolint, see .oxlintrc.json)
npm run test      # vitest run
npm run preview   # preview a production build
```

CI (`.github/workflows/ci.yml`): typecheck, lint, test, build.

## Testing

- Vitest covers **pure, high-value logic** in `*.test.ts` beside the module. Add a colocated test for new pure logic, and mutation-check safety rules (e.g. which failures fail over).
- **No jsdom.** Component tests (`*.test.tsx`) are SSR render smoke tests for JSX-only failures (what is offered in which state). Look beside the component you change; most components with state-dependent UI have one.
- **Guard tests new work must extend or keep passing:**
  - `components/layouts/everyBlockRenders.test.tsx`: every layout (forced + automatic, both visual treatments, kitchen-sink / image-free / one-photo runs) draws each block's text exactly once. **A new layout or block type must be added to it.**
  - `components/layouts/slideGround.test.tsx`: source scan that every `<SlideSurface` in a non-test `.tsx` has `ground={` and every `groundOf(` gets the first-card flag.
  - `components/layouts/slideWidthOnly.test.ts`: no screen breakpoints (`sm:`, `md:`…) in layouts, and no class token glued to `${` (Tailwind can't see it).
  - `accentBudget.test.tsx` (≤1 `data-accent-owner` per slide), `noHeadingFill.test.tsx`, `redrawRules.test.tsx`, `fillsBody.test.tsx`, `selfCentring.test.tsx`, `densityCompositions.test.tsx`, `newLayouts.test.tsx`, `structuredBlocks.test.tsx`, `termRows.test.tsx`, `LayoutWireframe.test.tsx`.
  - `lib/theme-tokens.test.ts`: per-theme contrast of grounds and inks, theme order, web-font imports.
  - `ai/deckOutputSchema.test.ts` (mirror variant cap) and the prompt-size caps in the prompt tests.
- **Fixtures:** `engine/fixtures/cppDeck.ts` (`CPP_DECK`, one slide per arrangement) and `engine/fixtures/galleryDeck.ts` (`GALLERY_DECK`, one card per arrangement and size variant, ids like `g-section`, `g-termrows`; `galleryDeck.test.ts` pins each id resolves to its arrangement).
- **Dev slide gallery** `/dev/slides` (`pages/DevSlidesPage.tsx`, dev builds only, no login): `?deck=gallery` (else `CPP_DECK`), `?theme=<id>`, `?style=expressive`, `?only=<card id>`, `?all=1`. It draws the read-only presenter path, not the editor.
- **Not testable here, checked by hand:** the live editing DOM (`EditableText`, selection, zoom, pan, drag, drawing), two presenter windows, video encode, voice recording, the lesson player. Recent layout work was checked only on `/dev/slides`; the editor, thumbnails, Present, video and PPTX on it are unchecked.
- **RLS/SQL** is hand-run: `supabase/tests/*.sql` (0009, 0010, 0012, 0014, 0015, 0016, 0017, 0018, 0021); all passed at their last run (latest 2026-11-06, after 0018). **0021's test is written but not yet run.**

## Environment

- `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (see `.env.example`). Absent → `supabaseConfigured` false, store methods no-op, `/login` explains; the app is unusable.
- `VITE_ANTHROPIC_API_KEY`, `VITE_GROQ_API_KEY` (two chain links), `VITE_GEMINI_API_KEY`: build `PROVIDER_CHAIN` in `fallbackProvider.ts`. Any may be omitted; at least one required (`/new` checks on mount). **Baked into the client bundle by design** (no in-app key entry, no proxy). The Anthropic key is billed per token, so a deployed build is spendable.
- `VITE_CARTESIA_API_KEY` (optional): voice cloning/preview/video narration. A full-account key in the bundle; see Voice.
- `VITE_WAVESPEED_API_KEY` (optional): talking intro/outro (WaveSpeed InfiniteTalk, 480p). **Baked into the bundle by decision, and billed per second of video**, so a deployed build is spendable. Without it the video dialog's face step explains it is not set up and the video is made without the clips. See Talking intro & outro.
- `VITE_PEXELS_API_KEY` (optional, 200 requests/hour): photo search. Without it decks get no photos and the image picker is paste-link only (`imagesConfigured` false).
- **Users never see a key's variable name** outside `/new`'s and `/login`'s setup messages. User-facing copy lives in `lib/setupCopy.ts`; variable names go to the console (`warnMissingKey`). Tests assert no `VITE_` in user UI.
- Accounts required: everything except `/login`, `/admin/login`, `/reset-password` is under `<RequireAuth>`. No guest mode.

## Core rule: generate once

A deck's cards come from **one** AI call at creation; nothing afterwards asks the model for card content again. To get different content, start a new project. Hand edits (text, reorder, delete, nudge, add slide/item/block, remove) never call a provider. Research and repair happen *before* the deck exists, inside `generatePresentation`.

Narration, quizzes, lessons and the narrated video are **separate artifacts generated from a deck on demand**: they never write `cards` and are **not precedent for a "regenerate this slide" button**.

Authority: the AI decides what a card says and which blocks it holds; the layout engine decides how it renders. Element nudges are *deltas* on the layout, never a replacement. No free-form canvas for content; the only free-positioned thing is hand-drawn ink (`card.overlay`), which the AI never writes.

## Creation flow

1. `pages/CreatePage.tsx`: one-sheet brief (topic, slide count 1–`MAX_SLIDES` or `'auto'`, audience, detail level, optional guidance) beside a live badge preview. Draft saved every keystroke (see Brief drafts); the always-shown slide count only counts as an answer once something else is answered. Old one-question drafts resume via `pendingText`.
   - Tone was removed from the intake, not generation: `DEFAULT_TONE` (`'professional'`) is still sent. Restoring = `STEP_ORDER` + an `Answers` field + a sheet section.
   - `lib/slideCount.ts`: `MAX_SLIDES = 7`, default 5. **Raising `MAX_SLIDES` requires revisiting the Groq deck and narration token budgets**; past ~20 slides narration cannot complete.
   - `guidance` is injected as a hard constraint overriding the system prompt.
2. Generate hands the brief to `startDeckJob` (background job) and navigates to `/`. After the pipeline the job runs a cancellable **photo stage** (`generation/photos.ts` `addPhotos`): strips every model-written `image` block and appends one Pexels photo per card with an `imageQuery`. It runs even without a Pexels key (so invented URLs are still stripped); a non-cancel failure inserts the deck as generated; `imageQuery` is never stored. **Every provider must honour the abort signal in both `fetch` and backoff `sleep`.**
3. Output is validated against `generatedDeckSchema` (`generation/schemas.ts`). Enums use zod `.catch(default)` so an off-list value never costs a deck; shape errors get one retry with the exact zod errors; each card's first block must be a `heading`. Then `normalizeStructuredBlocks` (`generation/normalizeStructured.ts`, pure) cleans the structured blocks (no kicker on the title slide, one callout per slide, a lone point becomes a bold-term paragraph, long kickers dropped, a card with `code` loses its `imageQuery`). It runs after the deck call and after a landed repair.
   - **The Anthropic structured-output mirror (`ai/deckOutputSchema.ts`) uses loose shapes** (no `min(1)`/`.trim()`), because a mirror failure is a `response` error with no retry or failover. **Its block union is capped at nine variants**: Anthropic refuses a too-large grammar with a 400 (no failover, no deck). So no `image` variant, and `point` shares a variant with `timelineStep`. Probe the live API before adding a variant.
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

## Brief drafts (`src/lib/briefDrafts.ts`)

Unfinished briefs live at `/drafts`. All reads/writes go through this file (moving to Supabase later = rewriting only it).

- `localStorage` key `lekturac:brief-drafts:<uid>`; writes try/catch'd. **Namespaced by user id, load-bearing**: `signOut()` only clears the session. `storageKey()` returns `null` while hydrating and reads/writes skip; never fall back to an un-namespaced key.
- `purgeForeignDrafts()` runs on sign-**in**, never sign-out. Order in that subscription is load-bearing: drop cache → `listDrafts()` (adopts legacy keys) → purge.
- `useDrafts()` is `useSyncExternalStore`; `listDrafts()` caches its array and rebuilds only on mutation/`storage` event (an unstable snapshot re-renders forever). `MAX_DRAFTS = 30`.
- The **user-namespaced, no fallback, null-while-hydrating** pattern is reused by temporary ink, new-item dots and quiz answers.

## Content model & layout engine (`src/engine/`)

### Model

- `contentBlocks.ts`: `ContentBlock` union (`heading`, `paragraph`, `bulletList`, `stat`, `image`, `quote`, `timelineStep`, `comparisonGroup`, and structured `point`, `callout`, `code`; a heading may carry a `kicker`). `Card`: `id`, `orderIndex`, `blocks`, `layout`, `visualStyle`, `textStyle`, `inline`, `adjusts`, `narration`, `overlay`. **`blocks: []` is a real blank card; nothing may assume a card has a block.**
- A block's **index** is its `textRef`, `card.adjusts` key, `data-block-index` and selection. Anything that inserts or removes a block must renumber all of them (see Removal / Add row).
- `card.visualStyle` (`'structured'|'expressive'`) is picked by the AI per card and passed to each layout as `variant`; legacy rows default to `'structured'`.

### Layout choice

- `chooseLayout(blocks, {isFirstCard})` is a rule-based classifier; `resolveLayout` defers to it when `card.layout === 'auto'` (nearly every card). It never awards `section` or `statement`, and awards a variety only for `statSplit`, `photoList` and `termRows` (each on an exact block signature).
- Only three things name a layout: the layout picker, a `title` card added anywhere but the front (`hero`), and ingest (`generatedLayout`: `hero` for card 0, a role hint, then `structuralLayout` → `section`/`statement`, then `varyLayouts`).
- **`section`/`statement` are named at ingest, never by the classifier**: a live card re-resolves on every keystroke, and a length rule there swapped the whole slide (ground, heading size, caret) when a paragraph crossed 140 characters.
- `varyLayouts` may assign a variety so neighbouring `auto` slides don't share an arrangement; it changes only `layout`, never blocks. Other varieties (`checklist`, `statList`, `timelineRow`, `steps`, `comparisonTable`, `beforeAfter`, `twoColumn`, …) are picker-only. `layoutVarieties` lists them.

### Families vs frames

- *Families* (`FLOW_LAYOUTS`: stat/timeline/comparison/list/gallery families, `steps`, `beforeAfter`, `termRows`) render through `FlowLayout`: `inferGroups` → leaves via `BlockRenderer`, runs of same-type blocks via `GroupRenderer` (exhaustive switch). `FlowLayout` gets the **resolved** layout, plus the stored one as `hint`.
- *Frames* (`hero`, `statHero`, `quote`, `textFocus`, `standard`, `standardSplit`, `imageFocus`, `section`, `statement`, `twoColumn`, `statSplit`, `photoList`) have their own components.
- **`hero`, `statHero`, `quote`, `section`, `statement` compose themselves and must end with `<Leftovers blocks consumed />`**, naming exactly the indices they drew (a frame showing only the first of a type names only that one). Everything else draws through `SlideFrame`, whose body draws every index `slotsOf` gives it.
- Heading size is `h2` everywhere except `hero`, `section`, `statement` (`h1`, ignoring a heading's stored `size`). Don't add more per-layout variance.
- **Grouping is derived at render, never stored**: `inferGroups` never reorders, drops or duplicates a block; runs are consecutive only.

### Composition (`engine/composition.ts`, pure)

- `slotsOf(blocks)` → indices for `claim` (first heading), `lead` (paragraph right after it), `aside` (the lone photo) and `body`. **Total**: every index in exactly one slot, so nothing is moved or renumbered.
- `accentOwner(blocks, layout)` names the **one block allowed an accent fill**: first `callout`, else statHero's first `stat`, else a comparison's first group, else none. Accent as text colour or a hairline is free. **No layout draws a fill behind a heading.**
- `SlideFrame` (`layouts/SlideFrame.tsx`): head zone (claim + lead) and body zone; optional `aside` photo beside the text from 640px container width up. Never centres vertically, never fixes a height.
- **Vertical placement belongs to the layout.** `SlideBody` is `flex-1` and centres nothing. Frames ask for it on their own root: `my-auto` (`quote`, `statHero`, `statement`, blank card) or `mt-auto` (hero without photo, `section`). **A new frame must choose its own placement.**
- **Density compositions** (`compositionOf`): `stack` | `sideHead` (short claim, two+ body units, head left / body on a tinted zone panel) | `splitBody` (two units side by side). Counts blocks only, never word weight; never stored; no picker option. Each zone panel is its own `@container` and sets `--zone-width: 100cqi`. The picker wireframes and PPTX still show the stacked form.
- **Type and gap steps** (`lib/theme-tokens.ts`): `SLIDE_SIZE` (`eyebrow`, `lead`, `caption`, ratios of body size) and `SLIDE_GAP` (`tight`, `group`, `section`). **Three gap values only; don't add a fourth.**
- **Redrawn arrangement rules** (both treatments): a lone group fills the body (`fillNode` → `data-fill` + `flex-1`); numerals/figures are accent text ≥ h3, never a disc; rules and space, not boxed cards or side tabs; `itemStep` picks roomy vs body text size.
- **Gotcha: `Adjustable` is `display: contents`** around one child, so `divide-*` and `first:` on a parent of holders never draw. Rules between items are per-element borders.

### Grounds

- `Ground` = `'plain'|'tint'|'deep'`. `groundOfLayout`: `hero`, `section` deep; `quote`, `statHero`, `statement` tint; rest plain. `groundOf(card, context)` resolves like the surface; an empty card is always plain.
- **Every `SlideSurface` caller must pass `ground`, computed with the same first-card flag it hands the layout** (source scan enforces it). `SlideSurface` stamps `data-ground`; `index.css` re-points the `--slide-*` variables inside it, so no layout changes.
- **Text on a deep ground ignores every colour pick** (deck, card, element, character marks), like text on a photo. Picks are kept, not dropped. The Fill bar is disabled with a reason on a deep card.
- **Local deep grounds:** `beforeAfter`'s second half and the `code` panel carry their own `data-ground="deep"`. On a deep slide the code panel instead draws as a light panel (`[data-ground='deep'] [data-code]`).
- **A layout changing ground means changing its wireframe** (`LayoutWireframe` follows `groundOfLayout`).

### Structured blocks

Spec: `2026-11-18-structured-blocks-design.md` (Part 1, hand-made) and `2026-11-19-ai-structured-blocks-design.md` (Part 2, the AI writes them).

- **Kicker** (heading's small label): added by the toolbar's "Add small heading". **An emptied kicker is removed when its editing ends, never stored as `""`**; the read boundary reads `""` as absent.
- **Points** `{label, text}`: a consecutive run of 2+ is one `rows` group / one unit; `pointRuns` folds runs in frames that draw blocks themselves. Rows ruled by a hairline per element in both treatments (user's choice).
- **Callout**: the first owns the accent fill; any other is quiet (tint, `data-callout-quiet`).
- **Code**: monospace panel, `white-space: pre` (scrolls/clips, never wraps or widens the slide). **Marks, font and colour picks are refused on the `code` run** (`refusesMarks`); size applies. **`CODE_FONT` must stay in the video's font probe.**
- Kicker and quiet callout label ink is a 70% accent/foreground mix so it reaches 4.5:1 on every theme (`theme-tokens.test.ts`).

### Photos

- `singlePhoto`: exactly one image; two or more is a gallery and never a background.
- `hero`/`quote` draw it as the slide's ground (`BackgroundPhoto` + `PhotoStage`). The photo is an absolute `Adjustable fixed` at `inset: calc(-1 * var(--slide-pad))`, so it must be a **sibling** of the text, never inside a positioned wrapper. **`SlideSurface` owns padding as `--slide-pad`**; callers pass `padding`, never `p-*`.
- **Text on a photo is white and ignores every colour pick** (`[data-on-photo]` in `index.css`). Code panels and quiet callouts are excluded and keep their own inks.
- `standardSplit` (right on even positions, left on odd) and `imageFocus` put the photo in `SlideFrame`'s `aside` and bleed to the slide edge from 640px up. Families draw a lone photo as a 6:1 band.
- The credit (`PhotoCredit`, "Photo: name / Pexels") is plain text, **never a link** (slides sit inside `aria-hidden` previews and buttons).

### Surface and sizing

- **16:9 floor, not a fixed ratio**: `SlideSurface` is `aspect-video … overflow-clip`; a taller slide grows. **Must be `overflow-clip`, never `overflow-hidden`** (`hidden` makes it a scroll container and pins it to 16:9, cutting content). Don't give the card a fixed height.
- **Every surface lays a slide out at `SLIDE_WIDTH_PX` (976) and scales the picture** (editor, thumbnails, `SlidePreview`, presenter, video). Nudges are fractions of width but text is rem, so another width wraps differently. A new surface must do the same.
- **Layouts never use screen breakpoints**; use container queries (`@min-[640px]:`) against `SlideBody`'s `@container`.
- `Enter` in a run inserts a real `\n`; runs render `white-space: pre-wrap`.

## Editing model

- **Selection drills in**: first press selects the card, second the element, then edit. Escape steps out item → list → card. Scope (`engine/textScope.ts`) is element → card → deck; a character range narrows marks only.
- **Undo/redo** (`presentationStore.ts`) snapshots the whole `cards` array (cap 50), persisted by `persistCardsSync` diffing. The ⌘Z listener ignores inputs **but not a live text run** (the browser's undo only knows typing). `EditableText` repaints a live run whose text differs from the store.
- **Removal** (`engine/removeElement.ts`, pure): removing block N renumbers every later address (`textRef`, `adjusts`, typography keys, runs, item keys). Written **immediately** after dropping the card's pending `blockText:`/`inline:`/`adjusts:` saves (they'd put the element back). Removing the last element leaves a blank card.
- **Append-only adds**: list items (`engine/listItems.ts`, `MAX_LIST_ITEMS` 12) and Insert (`engine/newContent.ts`, `MAX_BLOCKS` 20) append at the end so no position-keyed formatting slides. Same immediate-write rule.
- **Add row** (`engine/insertBlock.ts`): inserts a `point` after its run. `withBlockInserted` is the **exact inverse of `withBlockRemoved`** (shared `remapInline`/`spell`; round-trip pinned at every position).
- **Marks** (`engine/marks.ts`): flags bold/italic/underline; value marks `color`, `fontFamily`, `fontScale` replace in range (no toggle); size is a multiple (`em`). `EditableText` does not clear the reported range on blur (the colour input must take focus).
- **A wider style write clears the same fields at narrower scopes** (`engine/styleOverrides.ts`), or a slide styled once ignores the deck forever. Character marks are never touched.
- **Unreadable colours are dropped** (`engine/readableColor.ts`): a stored text colour under 3:1 on the theme background is removed on `setTheme` and `loadDeck`.
- **Text colour** needs two mechanisms: `data-deck-color` + `--slide-user-color` via an **unlayered** rule in `index.css` (beats Tailwind's layered utilities), and `Adjustable` setting inline `color`.
- **Font preview on hover** (`engine/fontPreview.ts`): derived copies, never stored; shares `applyTextStylePatch` with the real write so they can't diverge.
- **Size** is a percentage of the theme's scale (70–160%; 50–300% for a range), not points.
- **Layout picker** is a grid of `LayoutWireframe`s. **Each wireframe mirrors its component's JSX**; change how a layout looks and you must update its wireframe.
- **Grid** (`engine/gridSnap.ts`): shares the frame's origin and unit (top-left of `SlideBody`, content width ÷ 40); change one side, change the other. Snap is on by default, independent of Show.
- **Zoom** is a CSS transform (`ZoomFrame`, `lib/zoom.ts`): one tree at every zoom; the column is always laid out `COLUMN_MAX_WIDTH_PX` wide and scaled to fit. **Every gesture divides by the drawn scale** (`zoom × fitScale`, from `CanvasZoomContext`). Ctrl+wheel and pinch are native non-passive listeners. Ctrl+drag / right-drag / Move tool pan (`useCanvasPan`, capture phase).
- **`ToolbarMenu` and the font dropdown close on outside press in the capture phase** (the pan hook stops presses in its own capture phase). Panel buttons refuse focus on mousedown so the caret survives.

### Element nudging (`engine/blockAdjust.ts`, `engine/frameGeometry.ts`, `Adjustable.tsx`, `SelectionLayer.tsx`)

- `BlockAdjust = {dx, dy, w?, h?, rotation}` per block index, in **fractions of content width** (height too). A delta, applied as a `transform`. A nudge back to neutral is **deleted**, not stored as zeroes (presence routes the export's per-element path).
- `Adjustable` (`display: contents`) applies the adjustment imperatively to its child; nested holders are guarded (`AdjustedIndexContext`). **Every place a block renders must be wrapped.**
- A resize probes the layout at the new size (`measureAt`) before computing displacement. A height on a column-flex child also sets `flex: none`. **Every gesture is computed from the frame captured at the press.**
- **`BlockDataContext` (data) vs `BlockAdjustContext` (interaction) is a load-bearing split**: every surface provides data so nudges, marks and typography render in presenter and thumbnails. Marks are read from `BlockDataContext`, never editor-only `TextEditingContext`.

### Drawing layer (`engine/overlay.ts`, `components/editor/OverlayLayer.tsx`, `DrawingSurface.tsx`)

- Ink is `card.overlay`: strokes and shapes in content-width fractions, origin top-left of `SlideBody`. Limits 300 items / 1500 points per stroke, enforced at capture, parse and commit. Strokes and shapes commit **once on release** (one undo step).
- **`cardRow` must never name `overlay`** (mutation-checked): it is the upsert every card save uses. Ink is written by `persistOverlay` in its own best-effort update; failure sets `overlayWarning`, never `status: 'error'`.
- Temporary ink lives in `localStorage` (user-namespaced), editor-only, never in DB/undo/export.
- **The PPTX export ignores `card.overlay`.**

### Card types (`engine/cardTemplates.ts`, `CardTypeModal.tsx`)

Add-only: a slide's type cannot be changed later (a reshape moves text to different indices). New cards are placeholder text, never a generation call. `title` names `hero`; `image` is born from a picked photo (`imageFocus`); `gallery` cannot be created.

## Motion (`src/lib/motion.ts`)

GSAP via `useMotion` (inside `gsap.context`, reverted on unmount). Every preset is `gsap.from` with `clearProps` and has a reduced-motion path. **Never animate a slide surface, the editor canvas or anything `SelectionLayer`/`measureBlock` measures**: a leftover transform skews `getBoundingClientRect`.

## Presenter view (`src/present/`, `components/present/`)

Spec: `2026-11-12-presenter-view-design.md`. Console (`PresenterConsole`) + projector window (`SlideWindow`), same route as Present with `?view=presenter|screen&session=<id>`. No network, AI or DB.

- **The console owns all state** (`presenterState.ts`, pure); the slide window renders what it's sent. `BroadcastChannel` `lekturac:present:<session>`; **every message is zod-parsed** (`protocol.ts`).
- The deck is a frozen snapshot message; the slide window never reads Supabase. Only `frameScale` is imported from `src/video`; keep it that way.
- A reload resumes from `sessionStorage`. **Liveness is silence** (`alive` every 1 s, banner after 3 s; 10 s grace while connecting), not `popup.closed`. The slide window never closes on its own (`bye` only blacks it); only `end` closes it.
- **`window.open` runs inside the click**, or pop-up blockers refuse it.
- **Escape must be pressed twice within 2 s to end** (a clicker's button alternates F5/Esc). Console buttons refuse focus on mousedown, or a clicked Pause eats the next Space.

## Theme system (the main styling gotcha)

`src/index.css` defines two CSS-variable namespaces bridged into Tailwind v4 via `@theme inline` (no `tailwind.config.*`).

- **`app-*`**: all app chrome, never changes with a deck theme. Light and dark are separate palettes. `--app-accent-text`/`--app-highlight-text` are for text; `--app-accent`/`--app-highlight` for fills.
- App light/dark (`lib/appTheme.ts`): `mode` (setting) vs `theme` (resolved); paint code reads `theme`. `dark:` is rebound to `[data-theme='dark']`. **`AuthVisualPanel` and `AppSidebar` are always dark.**
- **`slide-*`**: the deck theme, applied only inside a scoped `ThemeProvider` (`applyTheme(theme, ref)`), never on `<html>`. `layouts/*` use `slide-*` only; `components/ui/*` use `app-*` only.
  - **`applyTheme` must stay in `useLayoutEffect`** (a passive effect flashes the `:root` fallback palette).
  - **Read slide fonts as `var(--slide-font-heading)` / `var(--slide-font-body)`** (`SLIDE_HEADING_FONT`/`SLIDE_BODY_FONT`), never a `--font-slide-*` alias (an `@theme inline` alias is substituted once on `:root` and blinds scoped overrides; a test fails on it). **Every element carrying words sets one of the two fonts on its own root.**
- `BUILTIN_THEMES` is the only source; thirteen presets. **`DEFAULT_THEME` is found by id `bordo`**, and the `:root` slide block in `index.css` mirrors Bordo. **Celestial theme ids stay `minimal/editorial/midnight/bold/sage`** (deck rows key on them). New ids are additive. Each theme's colours include `deep`, `deepForeground`, `tint`; no ground/ink/surface/accent-foreground is pure white or black.
- Theme fonts are Fontsource web fonts imported in `main.tsx`. A stack names the real family first and `<Family> Variable` second (the PPTX names a face by the **first** family). **Adding a theme font = the package, the `main.tsx` import, and the font test's table.**
- `loadDeck` runs a stored theme through `resolveTheme` (match on `id`) so old decks pick up redesigns.
- **Celestial backdrops** (`lib/celestial.ts`, `SlideBackdrop.tsx`): CSS/SVG layers, never images. The sky is **seeded on the theme id**; `starPositions` is shared with the PPTX export and **its `rand()` draw order is load-bearing**. The PPTX backdrop draws only `radial-gradient` glow layers.

## App shell

- **Dashboard** (`DashboardShell`, always-dark `AppSidebar`; drawer below `lg`). Search binds ⌘F/Ctrl+F only when the page passes `onQueryChange`. `deckFilters.ts` `selectDecks()` does search+filter+sort.
- **Deck covers** are the first slide rendered live, never a stored screenshot. `listDecks` fetches covers in one query (`order_index = 0`; `cardMutations.ts` keeps orderIndex gapless). The row → `Card` mapping is the shared `cardFromRow`.
- **Narrow windows** (`lib/editorLayout.ts`): <768px `phone` shows read-only `PhoneDeckView`; 768–1099px `compact` opens panels over the canvas. **Drags follow one pointer** (`pointerDrag.ts`); a second finger ends a move.
- **Editor** (`EditorPage`): outline panel left, tools panel right (`ToolsPanel`, Figma-style sections Typography → Fill → Theme, Edit/Narrate tabs above it), floating toolbar top-centre (undo/redo, Select/Move, Layout, Insert, pen, shapes; a sibling of the scrolling `<main>`). `TopBar`: title, save status, zoom, Create & export menu, Present menu, account menu.
- **Outline thumbnails** scale to the rail's measured width; the rail has **no visible scrollbar** (`scrollbar-none`), which is load-bearing (a space-taking scrollbar creates a resize loop). Don't make it visible without `scrollbar-gutter: stable`.

## Persistence (Supabase)

Migrations in `supabase/migrations/`. RLS on deck tables is `owner_id = auth.uid()`. The `themes` table is legacy/unused.

**What each migration gates:**

| Migration | Adds | Gates |
|---|---|---|
| 0006, 0008 | `cards.adjusts`, `cards.narration` | **every card write and deck creation** (`cardRow` names both) |
| 0007 | card write bumps `presentations.updated_at` | dashboard order |
| 0009, 0010 | classroom tables, role pin, `delete_own_account()` | classroom |
| 0011 | `presentations.generation` | nothing (best-effort write) |
| 0012 | quiz code/type/settings + RPCs | quiz generate/take/post **and the teacher classroom reads** (`QUIZ_COLUMNS` selects `code`, `quiz_type`) |
| 0013 | `cards.overlay` | saving ink only (warning) |
| 0014 | `voice_settings` | nothing (voice lasts for the session) |
| 0015 | `presentations.video` + `deck-videos` bucket | videos ("Run migration 0015 in Supabase.") |
| 0016 | quiz test sections, new `create_quiz(p_sections)` | quiz saving/taking/preview |
| 0017 | `cloned_voices` | recording your own voice |
| 0018 | lessons | posting/taking a lesson only |
| 0019, 0020 | `admins`, `admin_overview(p_range)` | admin page only |
| 0021 | `presentations.bookends`, private `face-photos` bucket | talking intro/outro only (own best-effort read/write, never `loadDeck`; written, not yet run) |

- `parseAdjusts`/`parseNarration` map the `{}` column default back to `undefined` ("has the column" ≠ "was adjusted").
- Title/theme are debounced (`scheduleSave`, 500ms); structural changes persist immediately via `persistCardsSync`.
- **A debounced write must never be outrun by a read**: `loadDeck` returns early for the deck it already holds; `flushScheduledSaves()` runs before reading a different deck and on `beforeunload`; a released gesture is written immediately. `store/saveTiming.test.ts` pins all three.
- **A failed read is `loadError`, never `status: 'error'`** (that means a *save* failed). `EditorPage`/`PresentPage` render `DeckLoadError`.

## Narration tab (`NarrationTab.tsx`, `engine/narration.ts`, `ai/narrationPrompt.ts`)

Per-slide spoken script for a cloned voice. Spec: `2026-09-26-narration-tab-design.md`.

- Writes for `selectedCardId ?? activeCardId`. Generating scripts is a background job (`jobs/narrationJob.ts`) that **targets card ids** and applies nothing if the slides changed before the reply (`sameSlides`). On the open deck it applies via `applyGeneratedNarration` (one undo step); otherwise `insertNarration` (write-only).
- `narration` is `{text, generated}`; status is derived. **`mergeNarration` writes only to slides the user selected**, whatever the model returned (the core invariant). Replacing hand-written words asks twice.
- `narrationMaxTokens`: floor 5200, ceiling 7000 (Groq refuses 8192). ~20–25 slides max; above that it's a 400 `request` error that does not fail over.
- Typing debounces 500ms on `narration:<cardId>`. The panel surfaces `status === 'error'` (how a missing 0008 shows).

## Voice (`src/voice/`, `CloneVoiceModal.tsx`)

Cartesia voice: pick premade or record and clone (consent checkbox required), tune settings, preview, then **Generate video**. Spec: `2026-09-27-narration-voice-design.md`.

- **All network calls are in `voice/cartesia.ts`.** The key is a full-account key in the bundle by decision (cloning needs it); a server proxy would replace only this file. Sent as `Authorization: Bearer` (the only credential header Cartesia's CORS allows).
- Every call honours `AbortSignal`, and **an abort stays an `AbortError`** (never a `CartesiaError`). No retry.
- **The microphone is always released** (`voice/recorder.ts`) on stop, cancel, limit, error and unmount. Safari's mp4-only recording is reported as unsupported.
- **Recorded voices have owners** (`voice/clonedVoices.ts`, 0017): all users share one Cartesia account, so ownership comes from our table. **Fails closed**: unknown owner = shown to nobody. Account deletion deletes the user's Cartesia voices first and stops if any fails.
- Settings saved in `voice_settings`, deliberately **not on `profiles`** (teachers can read students' profiles). Store cleared on user change.
- **SSR test quirk:** zustand server rendering reads a hook's *initial* state, so `setState` can't drive what a component reads through a hook; set `getInitialState()` instead.

## Narrated video (`src/video/`)

Spec: `2026-09-27-narrated-video-design.md`. Narrates every slide, draws slides, encodes in the browser, saves to the private `deck-videos` bucket; one video per deck, replaced each time.

- Pure modules (`timeline`, `format`, `paths`, `videoRecord`, `storage`, `pipeline`, …) are tested; `narrate.ts`, `encode.ts`, `renderFrame.tsx`, `generate.ts` are browser-only, keep them thin.
- **Lazy:** `mediabunny` and `html-to-image` are reached only through `import('@/video/generate')`. Check the build's chunk list after touching imports.
- Frames are 1280×720, scaled to fit, never cropped. Audio and video timelines come from the same numbers, so a zero-length clip is refused.
- **The tab must be visible while slides are drawn** (`whenVisible`). **Theme web fonts are embedded** via a probe holding both theme fonts; **a web font added to the toolbar must join the probe**.
- MP4 preferred, WebM fallback; `detectFormat()` runs before any Cartesia request so a browser that can't encode never spends credits.
- **Save order is the safety rule** (`saveVideo`): upload → write record → remove old object if the path differs. Upload takes no `AbortSignal`, so it's the point of no return (`cancellable: false`).
- Deleting a deck deletes the row, then its video. `delete_own_account()` orphans videos.

### Talking intro & outro (`src/avatar/`)

Spec: `2026-11-21-talking-intro-outro-design.md`. An optional lip-synced face clip (WaveSpeed InfiniteTalk 480p, from the user's photo and the narration audio) before slide 1 and after the last slide. Not a card edit: nothing here writes `cards` or calls the deck model.

- **Pipeline** (`video/pipeline.ts`): segments are `[intro?, ...slides, outro?]`. The intro and outro are narrated first and their clips **start before the slides are narrated** (they take minutes), under an internal `AbortController` that follows the caller's signal and is aborted when the run ends. A `null` clip (any non-cancel failure) draws a **title card** and sets `faceFailed`, which becomes `Job.notice`; the video still saves. **`VideoRecord.slides` lists slides only, offset by the intro's length**, so lessons are unchanged (the outro plays after the last question).
- **`wavespeed.ts` holds every WaveSpeed call.** `submitTalk` is billed per job and **never retried**, here or by a caller; polling and download repeat freely. **An abort stays an `AbortError`**, never a `WavespeedError`. The key is in the bundle by decision (a proxy would replace only this file). Cancelling still bills a submitted job; the dialog's cost line (`costLine.ts`) says so.
- **Lazy:** `drawClip.ts` (mediabunny) and `talker.ts` are browser-only and reached only through `import('@/video/generate')`. `openClip` decodes a first picture, so a clip that cannot be decoded falls back to a title card before credits are spent. `clipFrames.ts` (pure) holds the placement rule: picture is clamped/held to the narration's length so sound and later slides keep their timing.
- **Text** (`bookends.ts`, `bookendsRow.ts`, `bookendsStore.ts`): `null` = never edited (the starter is used), `''` = cleared on purpose (no clip). Never conflate them. Stored in `presentations.bookends` by **its own best-effort read/write** (never `loadDeck`'s select or the card upsert); failure sets `warning`, never `status: 'error'`. The store debounces 500 ms, flushes before loading another deck and on `beforeunload`, **`NarrationTab` flushes on unmount**, and it resets on its own `authStore` subscription (an import from `authStore` would be a cycle).
- **Face photo** (`facePhoto.ts`): private `face-photos` bucket, one object at `<uid>/face.<ext>`, consent tick required to upload. **Deleted in `deleteAccount` before the RPC** (a failed removal stops the deletion). A list error counts as no photo, so a project without 0021 is never blocked.
- **Video dialog** (`CloneVoiceModal`, section 3 `FaceStep.tsx`): `faceRequest` (`video/ui.ts`) decides `off` / `blocked` / `on` from the switch and `faceBlocker` at press time; only a face that was on and became impossible blocks. **Generate is disabled while the photo is still being checked.** Job tray rows come from `videoTimeline(p, withFace)` (adds an `Animating your intro & outro` stage).

## Background jobs (`src/jobs/`, `components/jobs/`)

Deck, quiz, video and narration generations run as jobs that outlive their page. Spec: `2026-10-02-background-generation-design.md`.

- **One job per kind** in `jobsStore`; `start` returns false while that kind runs. `jobs/start.ts` is the only place real deps are wired; job specs take injected deps and are tested against fakes.
- **Every write goes through the run-id check** (`current()`), so cancel/replace/reset settle into nothing.
- **A background job must never call `createDeckFromGeneration`** (it replaces the editor's open deck); use `insertGeneratedDeck`. The brief draft is deleted only after the insert.
- `reset()` runs on auth user change. Jobs live in this tab; a reload ends them (a `beforeunload` warning).
- **`src/jobs/*` reaches `@/video/generate` only through `import()`.**
- `newItems.ts` marks unseen results (user-namespaced `localStorage`). `JobTray` sits beside `<Routes>`; on `/deck/:id` that deck's narration and quiz jobs are hidden there (shown in the tab and `QuizJobStrip`).

## Classroom (`src/classroom/`)

Account type (General / Teacher / Student) is chosen at sign-up and pinned in the DB; General → Student only inside `join_class`. **Read "Implementation invariants" in `docs/superpowers/specs/2026-09-14-teacher-classroom-design.md` before touching classroom code, RLS or the profile/role flow.**

## Quizzes (`src/quiz/`, `components/quiz/`)

1–3 tests per quiz, each multiple choice / fill in the blank / true-false, 1–20 items. Spec: `2026-09-24-quiz-generator-design.md` and `2026-10-01-quiz-test-sections-design.md`.

- **One model call per test, in order** (`quiz/sections.ts`); later calls get an `avoidList` (≤40 prompts / 2,000 chars). A failed test keeps earlier ones and Try again resumes there. Saved in **one** `create_quiz` call.
- **Free chain only**: `QUIZ_CHAIN` is Groq `gpt-oss-120b` → `groq/compound`, never Anthropic or Gemini. Shares `runWithFailover` with `FallbackProvider` (capacity-only failover, cancel never hands off).
- Budget `quizMaxTokens(n) = clamp(n*110 + 3800, 5200, 7000)`; deck text capped at 600 chars/slide and ~6,000 total. Raising any cap means revisiting Groq's TPM window.
- **The model is not trusted for structure** (`quiz/build.ts`): drop out-of-range citations and wrong shapes, report shortfall, **shuffle MC choices client-side** with a seeded shuffle.
- **Storage:** `quiz_questions` is **owner-only under RLS**, which makes the answer key and PDF owner-only by data. Students only use `get_quiz_for_taking` (no answers) and `submit_quiz_attempt` (server scoring, one attempt per class). `quiz/quizCode.ts` **must stay in step with `generate_quiz_code()`**.
- **`create_quiz` does not use `INSERT … RETURNING`** (under invoker RLS the SELECT policy can't see the new row yet). Don't "simplify" it back.
- Only Teachers get a code and can post; a code never auto-joins a class. Answers in progress are kept in user-namespaced `localStorage`. Result review shows the student's answer, never the correct one.
- Deleting cascades every attempt (scores leave class stats); the confirm names what is lost.
- **PDF** (`quiz/pdf/`): `jspdf` is lazy-imported; Noto Sans from `/fonts` (Latin, Greek, Cyrillic only).

## Lessons (`src/lesson/`, `pages/LessonPage.tsx`)

A quiz watched as the deck's narrated video, pausing at each question's slide. A `quiz_classes` posting with `mode='lesson'`. Spec: `2026-11-06-lessons-design.md`. No AI call; never touches `cards`.

- Needs a video **with slide timings** (`VideoRecord.slides`); older videos must be made again.
- **`placeCheckpoints` (TS) and `lesson_stops` (SQL) must agree**; both are checked against `lesson/fixtures.ts`. Change one → change both and the fixture.
- **Watching is enforced by the server** (`watched_until` grows by real time only, capped at the next unanswered stop). The player's clamp is convenience only.
- Scoring reuses `submit_quiz_attempt`, so classroom stats count lessons unchanged. `lesson_answers` stores only `correct`.
- Mode is fixed once anyone has *answered*. Lesson code imports only `video/videoRecord.ts` and `video/paths.ts` from `src/video/`.

## Admin (`src/admin/`, `pages/AdminPage.tsx`)

Developer-only site-wide counts at `/admin/<section>` with a time range. **Admin is a row in `admins`**, granted only in the SQL editor. An admin account is for admin work only (`RequireAuth` redirects to `/admin`); admins log in at `/admin/login` and the wrong login kind is signed out before any page sees the session. `admin_overview()` (security definer) refuses non-admins. **Counts and categories only: never return a row, name, email, title or anything typed.**

## PPTX export (`src/export/`)

`exportDeckToPptx(deck)` makes native, editable slides. **Read "Implementation invariants" in `docs/superpowers/specs/2026-09-19-pptx-fit-design.md` (and `2026-08-25-pptx-export-design.md`) before changing anything here.**

- Nothing in `src/export/` imports React. Dashboard export uses `fetchDeck`, not `loadDeck`.
- Fits text itself; exact-point `lineSpacing`, never `lineSpacingMultiple`. Any nudged element routes the card to the `adjusted` path.
- Photos are prefetched once and passed in a `RenderContext`; a failed fetch leaves alt text, never fails the export. Pictures are placed with their real aspect from the header, never stretched.
- Grounds: tint/deep slides get a flat background and a `groundTheme`, so renderers don't know grounds exist.
- **Gaps:** the redrawn arrangements and density compositions aren't exported (old arrangements are drawn); the seven newer layouts map onto old ones (`GROUP_BY_LAYOUT`); `card.overlay` isn't exported.

## Auth

`store/authStore.ts` (zustand, initialised at module load). `realUser()` treats anonymous sessions as none. `applySession()` holds `status: 'loading'` until the profile resolves, **except** a same-user token refresh with a profile loaded (flipping to loading would unmount the editor). An unreadable profile resolves to General.

## Path alias & TypeScript

`@/*` → `src/*`. `verbatimModuleSyntax: true` (type-only imports need `import type`); `erasableSyntaxOnly: true` (no constructor parameter properties).
