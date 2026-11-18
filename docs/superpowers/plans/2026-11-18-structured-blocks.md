# Structured Blocks (Phase 2, part 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a heading eyebrow (`kicker`) and three new blocks (`point`, `callout`, `code`), drawn, edited and exported everywhere, without the AI writing any of them yet.

**Architecture:** New members of the `ContentBlock` zod union (each block its own index/address, like stats and steps). A run of points groups into a new `rows` arrangement and a new family layout `termRows`; callout and code are leaves `BlockRenderer` draws in any layout. A new pure `withBlockInserted` (inverse of `withBlockRemoved`) lets the add-row plus insert mid-card. The generation schema keeps the old eight block types.

**Tech Stack:** React 19, TypeScript, Tailwind v4 container queries, zod, Vitest (`renderToStaticMarkup`, no jsdom), pptxgenjs.

**Spec:** `docs/superpowers/specs/2026-11-18-structured-blocks-design.md` (read it whole; its "controller's call" lines are binding).

## Global Constraints

- Block index = address (`textRef`, `card.adjusts` key, bare-index `inline` key, `data-block-index`, selection); nothing reorders, drops or duplicates a block.
- `Adjustable` is `display: contents`: rules between items are per-element borders, never `divide-*`/`first:`.
- Container queries only (`@min-[640px]:`), never screen breakpoints; no class token glued to `${` in a className template.
- Gaps only from `SLIDE_GAP` (`tight`, `group`, `section`); sizes as `var(--slide-size-*)`/`SLIDE_SIZE.*`.
- At most one `data-accent-owner` per slide; no fill behind a heading or kicker.
- Every `LayoutWireframe` mirrors its component; a new layout joins `everyBlockRenders`.
- `generatedDeckSchema`, every prompt and the generation validators' accepted block types are unchanged: the AI cannot emit `point`, `callout` or `code` in this part.
- Commits name exact paths (never `git add -A`) and end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. A code block with a 120-character line and 30 lines in the editor, a thumbnail and Present: the slide keeps its width (the panel scrolls on the live editor, clips elsewhere); test in Task 5.
2. Add a row in the middle of a card whose later blocks are nudged and bolded, then undo: every nudge and mark is back on its own element; round-trip test in Task 4.
3. A callout and a code panel on the deep title or section slide: both readable (contrast test in Task 5).
4. A kicker edited to empty text: the field is removed, not stored as `""` (Task 2).
5. A model reply containing a `point` block: rejected by the deck schema like any unknown type, so the one retry fires (Task 1).

---

### Task 1: Content model and readers

**Files:** `src/engine/contentBlocks.ts`, `src/generation/schemas.ts`, `src/engine/emphasis.ts`, `src/engine/cardTemplates.ts` (`contentLines`), `src/generation/validation/text.ts`, `src/engine/newContent.ts` (`elementLabel`, `firstEditableField`), `src/engine/groups.ts` (exhaustive switch only), `src/components/layouts/BlockRenderer.tsx`, `src/export/blockBoxes.ts`, `src/export/slideRenderers.ts`, any other exhaustive switch the build names; colocated tests.

**Interfaces (produces):**
- `headingBlockSchema` gains `kicker: z.string().optional()`.
- `pointBlockSchema` `{type:'point', label: string, text: string}`, `calloutBlockSchema` `{type:'callout', label?: string, text: string}`, `codeBlockSchema` `{type:'code', code: string, label?: string, caption?: string}`; exported types `PointBlock`, `CalloutBlock`, `CodeBlock`; all three in `contentBlockSchema`.
- `generatedBlockSchema` in `generation/schemas.ts`: the union of the original eight block schemas (heading without `kicker` is fine either way; strip `kicker` from generated headings), used by `generatedDeckSchema` in place of `contentBlockSchema`.
- `contentLines` lines: kicker before its heading's text; point `"<label>: <text>"`; callout `"<label>: <text>"` or `text`; code each non-empty line; label/caption as their own lines.
- Quiz and narration deck text (`src/ai/quizPrompt.ts`, `src/ai/narrationPrompt.ts`, or whatever they call to flatten a card): include the new text, through `contentLines` if they use it, else in their own flattener; tested.
- Stand-ins until later tasks: `BlockRenderer` draws `point` as `label — text` paragraph, `callout` and `code` as a paragraph of their text (code in a `pre`); export draws each as a body text box with the same strings.

- [ ] **Step 1:** Failing tests: schema round-trip of each new block and of a heading with `kicker`; `generatedDeckSchema` rejects a card holding a `point` (Review Focus 5) and strips/ignores `kicker`; `applyEmphasis` leaves `code` text and its `*` characters untouched (`int *p = &x;` unchanged, no marks); `contentLines` for each new block; `elementLabel`/`firstEditableField` (`point` → `label`, `callout` → `text`, `code` → `code`).
- [ ] **Step 2:** `npx vitest run src/engine src/generation` → FAIL.
- [ ] **Step 3:** Implement; let `npm run build` find every exhaustive switch and add the stand-ins.
- [ ] **Step 4:** `npm run test`, `npm run lint`, `npm run build` → pass.
- [ ] **Step 5:** Commit: `feat(blocks): point, callout and code blocks and heading kicker in the content model`.

### Task 2: Kicker

**Files:** Create `src/components/layouts/Kicker.tsx`; modify `BlockRenderer.tsx` (`Heading`), `HeroLayout.tsx`, `SectionLayout.tsx`, `StatementLayout.tsx`, `src/engine/textScope.ts` or wherever `textRef` fields are validated, `src/components/editor/EditorToolbar.tsx` (action), `src/store/presentationStore.ts` (`setHeadingKicker`), tests (`noHeadingFill.test.tsx`, `EditorToolbar.test.tsx`, a new `Kicker.test.tsx`), `galleryDeck.ts` (+ test).

**Interfaces (produces):** `Kicker({text, textRef, variant})` drawn as `aria`-plain small capitals (`text-transform: uppercase`, letter-spacing `0.12em`, accent colour `text-slide-accent`, `SLIDE_SIZE.eyebrow`, heading font weight 600, `SLIDE_GAP.tight` below), wrapped in `EditableText` under `textRef(index, 'kicker')` inside the heading's own `Adjustable` holder (the kicker is part of the heading element, not its own element). `store.setHeadingKicker(cardId, blockIndex, text: string | null)`: one undo step; empty or whitespace-only text deletes the field (Review Focus 4). Floating-toolbar action "Add small heading" shown only for a selected heading without a kicker; it sets placeholder `Small heading` and opens that run for editing.

- [ ] **Step 1:** Failing tests: `Heading` with a kicker draws it before the title text, uppercase class, accent class, no `bg-slide-accent` (extend `noHeadingFill`); hero, section and statement draw it; editing to `""` or `"  "` removes the field (pure helper `withKicker(block, text)` in `engine/` tested); the toolbar shows the action only for a heading without a kicker.
- [ ] **Step 2–4:** fail, implement, `npm run test`/`lint`/`build` pass.
- [ ] **Step 5:** Gallery card `g-kicker` (heading with kicker + paragraph). Commit: `feat(blocks): kicker above headings`.

### Task 3: Term rows

**Files:** `src/engine/groups.ts`, `src/engine/layoutEngine.ts`, `src/engine/composition.ts`, `src/engine/contentBlocks.ts` (`layoutTypeSchema` + `termRows`), `src/components/layouts/LayoutRenderer.tsx` (`FLOW_LAYOUTS`), `GroupRenderer.tsx` (`rows` case), `BlockRenderer.tsx` (lone point as one row), `src/components/editor/LayoutWireframe.tsx`, `LayoutPicker.tsx` (label "Term rows"), `src/export/slideGroup.ts` (`termRows` → `body`), `src/generation/validation/structure.ts` (`LAYOUT_FAMILY` `termRows` → `list`), tests, `galleryDeck.ts` (+ test, + the master-baseline stability test in `layoutEngine.test.ts`).

**Interfaces (produces):** `GroupNode` arrangement `'rows'` for a consecutive run of ≥2 `point` blocks (any layout). Layout `termRows` (family): awarded by `chooseLayout` exactly per spec (one run of ≥2 points, otherwise only headings/paragraphs, not the first card); `cardKind` returns `'list'` for a card whose typed content is only points; `componentsForKind('list')` includes `termRows` only when the card has a point run. `compositionOf`: a point run is one unit. Rows markup: a two-column grid per row (`minmax(0,1fr)` 1/3 : 2/3 from 640px, stacked below), term in the heading font at `SLIDE_SIZE.lead` or larger, accent text; meaning at body size (`itemStep` decides lead vs body for the meaning texts); `border-t` hairline on each row and `border-b` on the last (per-element); hooks `data-term-rows`, `data-term`, `data-term-text`; `fill` stretches rows.

- [ ] **Step 1:** Failing tests: `inferGroups` exhaustive invariant extended with `point`; a run of 2+ points → `rows`, a single point → leaf; classifier award and non-awards (points + stat → not `termRows`; points on the first card → `hero` path; points + photo → photo path, run drawn as rows); stability test: no existing gallery/CPP card moves; render (both treatments): every term and text once, hairlines per row, accent term, no `data-accent-owner`; wireframe test.
- [ ] **Step 2–4:** fail, implement, full suite/lint/build pass.
- [ ] **Step 5:** Gallery card `g-termrows`. Commit: `feat(layouts): term rows`.

### Task 4: Inserting blocks and the add-row plus

**Files:** Create `src/engine/insertBlock.ts` (+ test); modify `src/engine/newContent.ts` (`CONTENT_TYPES`/`CONTENT_OPTIONS`/`newBlock` for `point`, `callout`, `code`), `src/store/presentationStore.ts` (`insertBlockAfter`), `src/components/editor/ElementActions.tsx`, `SelectionLayer.tsx`/`adjustContext.ts` plumbing, `ContentGrid` (Insert menu), tests (`ElementActions.test.tsx`, `newContent.test.ts`).

**Interfaces (produces):**
- `withBlockInserted(card: Pick<Card,'blocks'|'inline'|'adjusts'>, at: number, block: ContentBlock): Insertion | null` (`Insertion = {blocks, inline, adjusts}`): inserts at index `at` (0 ≤ at ≤ length), shifting every address ≥ `at` up by one (same key rules as `withBlockRemoved`: bare index, `textRef` with field/item, non-address keys kept); `null` past `MAX_BLOCKS` or out of range.
- `pointRun(blocks, index): {start: number, end: number} | null` (the consecutive run containing `index`).
- `store.insertBlockAfter(cardId, afterIndex, block)`: drops the card's pending `blockText:`/`inline:`/`adjusts:` saves, writes immediately, one undo step, selects the new block and opens its first run.
- `ElementActions`: with any point of a run selected, a plus under the run's last row (`canAddRow`/`addRow` on `BlockAdjusting`), inserting a `point` with placeholders `Term` / `What it means` at `end + 1`.
- Insert menu: Term row, Callout, Code (placeholders: callout `Key idea` / `The one thing to remember.`; code `Short example` / `int x = 0;` / caption absent). Appended at the end (existing rule); a Term row appended right after an existing trailing run extends it naturally.

- [ ] **Step 1:** Failing tests: `withBlockInserted` shifts `textRef`s, bare-index keys, list-item keys and `adjusts` (insert at 0, middle, end); `withBlockRemoved(withBlockInserted(card, i, b), i)` equals the original card for every `i` on a fixture with marks, typography and nudges on every block (Review Focus 2); `MAX_BLOCKS` cap; `pointRun`; `ElementActions` shows the row plus for a selected point and not for a paragraph; Insert options list the three new types.
- [ ] **Step 2–4:** fail, implement, full suite/lint/build pass.
- [ ] **Step 5:** Commit: `feat(editor): insert a block mid-card, add-row plus, insert term rows, callouts and code`.

### Task 5: Callout and code drawing

**Files:** Create `src/components/layouts/CalloutBlock.tsx`, `CodeBlock.tsx`; modify `BlockRenderer.tsx`, `src/engine/composition.ts` (`accentOwner`), the frames' `accentIndex` fallbacks (`StatHeroLayout.tsx`, `GroupRenderer.tsx` comparison), `Adjustable.tsx` (code typography opt-out), the editor's mark/typography writers for the `code` field, `src/index.css` (code panel colours on a deep slide), `src/video/renderFrame.tsx` font probe (JetBrains Mono), tests (`accentBudget.test.tsx`, new cases in `newLayouts.test.tsx` or a new `structuredBlocks.test.tsx`, `lib/theme-tokens.test.ts` for the code panel contrast).

**Interfaces (produces):** `accentOwner` returns the first `callout` index in any layout before its existing rules. Callout: `data-callout`, rounded `rounded-slide`, padding `SLIDE_GAP.group`, `bg-slide-accent` + `text-slide-accent-foreground`, label small capitals above (`data-callout-label`), text at `SLIDE_SIZE.lead`, `data-accent-owner` when it is the owner. Code: `data-code`, rounded panel, padding `SLIDE_GAP.group`; on a plain or tint slide the panel carries `data-ground="deep"`; on a deep slide (`[data-ground='deep'] [data-code]`) `index.css` gives it a light panel and dark ink drawn from tokens the deep re-pointing does not touch; `pre` with `white-space: pre`, `overflow-x: auto` in the editor and `overflow: hidden` elsewhere (the panel is `min-w-0 max-w-full`), font `'JetBrains Mono', 'JetBrains Mono Variable', ui-monospace, monospace`, size `calc(var(--slide-size-body) * 0.85)`; label above, caption below (muted). Code field: marks refused and never rendered; font and colour picks at element/card/deck never reach the `pre`; `fontScale` applies.

- [ ] **Step 1:** Failing tests: callout owns the accent on a `statHero` card (stat loses `data-accent-owner`, figure drawn as accent text without a panel) and on a `comparison` card (featured panel without owner), still one owner per slide (both treatments); code renders text once with whitespace preserved, the panel `data-ground="deep"` on a plain slide and not on a deep one; a 120-character line keeps the surface width (`max-w-full`, overflow class) (Review Focus 1); contrast: code ink on its panel ≥ 4.5:1 and callout text on accent ≥ 4.5:1 in every theme on plain and deep grounds (Review Focus 3); applying bold or a colour mark to `code` is refused by the pure writer.
- [ ] **Step 2–4:** fail, implement, full suite/lint/build pass.
- [ ] **Step 5:** Gallery cards `g-callout`, `g-code` (and one `g-code-deep`: section with a code leftover). Commit: `feat(blocks): callout and code panel drawing`.

### Task 6: PPTX export

**Files:** `src/export/blockBoxes.ts`, `src/export/slideRenderers.ts`, `src/export/slideGroup.ts`, `textFit.ts` users as needed, tests (`slideRenderers.test.ts`, `blockBoxes.test.ts`). Read `docs/superpowers/specs/2026-09-19-pptx-fit-design.md` and `2026-08-25-pptx-export-design.md` "Implementation invariants" first.

**Interfaces (produces):** Kicker: small accent paragraph above its heading. Point run: two aligned text columns (term accent, meaning body) with a thin rule line between rows. Callout: accent-filled rounded rectangle, text in accent-foreground. Code: rectangle in the deep ground colour (light panel on a deep slide) with a monospace text box (`Consolas`), label above, caption below, no text fitting below the theme's caption size (truncate with the fitter). Both the plain arrangements and the `adjusted` path draw all four.

- [ ] **Step 1:** Failing tests: for a body card and a nudged card, each new block produces its shapes with the expected text, fonts (`Consolas` for code) and fills; a deep slide's code panel uses the light colours; nothing else in existing renderer tests changes.
- [ ] **Step 2–4:** fail, implement, full suite/lint/build pass.
- [ ] **Step 5:** Commit: `feat(export): kicker, term rows, callout and code in PPTX`.

### Task 7: Coverage, docs, browser check

**Files:** `src/components/layouts/everyBlockRenders.test.tsx`, `CLAUDE.md`.

- [ ] `everyBlockRenders`: the kitchen-sink card gains a point run, a callout, a code block and a heading kicker; every layout, forced and automatic, both treatments, each text exactly once. Fix any layout that drops or duplicates.
- [ ] `CLAUDE.md`: Content model (the three blocks, kicker, generation schema excludes them), Editing model (`withBlockInserted`, the row plus, kicker action, code typography), Composition (`accentOwner` callout priority, `termRows`, `rows`), Grounds (code panel local deep, light on a deep slide), PPTX, Testing (new tests, gallery count). Browser line left for the controller.
- [ ] `npm run test`, `npm run lint`, `npm run build`; commit by path: `docs: structured blocks in CLAUDE.md; every block in everyBlockRenders`.
- [ ] Controller: `/dev/slides?deck=gallery&only=<id>` for the new cards in Bordo (both treatments), Deep Space and Chalkboard (expressive); record in CLAUDE.md.
