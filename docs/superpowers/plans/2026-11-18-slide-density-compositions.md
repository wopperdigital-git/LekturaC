# Slide Density Compositions (Phase 1b-B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A slide with two or more separate content blocks below its intro is drawn in zones (side head or split body) instead of one long stack.

**Architecture:** A pure `compositionOf` in `engine/composition.ts` reads a card's body units (index lists) and returns `stack | sideHead | splitBody`. `SlideFrame` takes the composition and places the head beside or above the body; a small `BodyUnits` component in `SlideFrame.tsx` lays the units out (stacked, or two columns with the first on a tint panel). `FlowLayout`, `StandardLayout` and `TextFocusLayout` compute the units and pass them. Nothing is stored; every block keeps its index.

**Tech Stack:** React 19, TypeScript, Tailwind v4 container queries, Vitest with `renderToStaticMarkup`.

**Spec:** `docs/superpowers/specs/2026-11-13-slide-composition-design.md`, section "Density compositions" (lines 173 to 203), plus the rulings below.

## Rulings for this phase (made 2026-11-18, the user picked "blocks only")

- **Blocks only.** A composition is chosen from the count of body units, never from word weight. A slide with one heavy list stays a stack. (User's choice: option 2.)
- **No picker option.** The spec's "the picker offers the compositions as varieties" is deferred: a choice would need a stored field and a migration. Compositions are automatic.
- **No zone text step-down.** The spec allows zone text down to 0.85 of body; this phase keeps body size (a CSS variable cannot scale itself without breaking size picks). Room comes from columns.
- **Wireframes unchanged.** The picker draws layouts, not compositions; a zoned slide's wireframe shows the stacked form. Noted in CLAUDE.md.
- **PPTX unchanged.** The export keeps its own arrangements.

## Global Constraints

- Every block is drawn exactly once under its own index; zone wrappers are not elements (no `Adjustable`, no `data-block-index`).
- Layouts use container queries (`@min-[640px]:`), never screen breakpoints (`slideWidthOnly.test.ts`).
- Gaps come from `SLIDE_GAP` only (`tight`, `group`, `section`); no fourth value. Panel padding is `SLIDE_GAP.group`; the gap between zones is `SLIDE_GAP.section`.
- At most one `data-accent-owner` per slide; no fill behind a heading.
- The claim keeps the same size and the same `Heading` component in every composition.
- Commits name exact paths (never `git add -A`) and end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. A comparison inside a tint zone panel: its featured panel is also tint, so it would vanish. Expect `[data-zone-panel] [data-accent-panel]` to re-point `--slide-panel-bg` to the surface (Task 2 stylesheet test).
2. A card with no heading, or with a photo, or on the gallery layout: must stay `stack` (Task 1 table).
3. A slide whose body is only paragraphs: stays `stack`; prose side by side is `twoColumn`'s job in Phase 1c (Task 1 table).
4. A zoned slide must still draw every block once, in both treatments (Task 2, `everyBlockRenders` image-free cases).
5. A heading that is not block 0 still heads the left column, and blocks before it stay in the body (Task 2 render test).

---

### Task 1: `compositionOf`

**Files:**
- Modify: `src/engine/composition.ts`
- Test: `src/engine/composition.test.ts`

**Interfaces:**
- Produces: `export type Composition = 'stack' | 'sideHead' | 'splitBody'` and `export function compositionOf(blocks: ContentBlock[], units: number[][], layout: Exclude<LayoutType, 'auto'>): Composition`. `units` is the body's drawn units in order, each the block indices it holds (a leaf is `[i]`, a group its items' indices). Exported constants `SIDE_HEAD_MAX_CLAIM = 60` and `SIDE_HEAD_MAX_LEAD = 140` (characters).

Rules, in order (first match wins):
1. `stack` when `layout` is `gallery` or `timelineRow` (a horizontal row needs the full width), when any block in `blocks` is an `image`, when `slotsOf(blocks).claim` is null, when `units.length < 2`, or when every unit is a single `paragraph` block.
2. `sideHead` when the claim's text is at most `SIDE_HEAD_MAX_CLAIM` characters and the lead (if any) is at most `SIDE_HEAD_MAX_LEAD` characters.
3. `splitBody` when `units.length === 2`.
4. Otherwise `stack`.

The two constants are starting values; Task 3 tunes them on screen and records any change.

- [ ] **Step 1: Write the failing tests** (a `describe('compositionOf')` table in `composition.test.ts`):
  - heading + paragraph + bulletList, units `[[2]]` → `stack`
  - heading 'Loops' + paragraph + bulletList + paragraph, units `[[2],[3]]`, layout `numberedList` → `sideHead`
  - same blocks with a 61-character heading → `splitBody`
  - 61-character heading, three units (list, paragraph, quote) → `stack`
  - short heading, lead of 141 characters, two units → `splitBody`
  - heading + paragraph + paragraph + paragraph, units `[[2],[3]]` → `stack` (prose only)
  - two units but an `image` anywhere in blocks → `stack`
  - two units, layout `gallery` → `stack`; layout `timelineRow` → `stack`
  - no heading (paragraph + bulletList + paragraph), units `[[0],[1],[2]]` → `stack`
  - empty blocks, units `[]` → `stack`
  - mutation check: flip rule 2's `<=` to `<` and confirm a 60-character heading case fails, then restore.
- [ ] **Step 2:** Run `npx vitest run src/engine/composition.test.ts`. Expected: FAIL (`compositionOf` not exported).
- [ ] **Step 3:** Implement `compositionOf` and the type and constants in `composition.ts` with a doc comment naming the rules and that nothing is stored.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5: Commit** `src/engine/composition.ts src/engine/composition.test.ts`, message `feat(engine): compositionOf picks stack, side head or split body from body units`.

### Task 2: Draw the compositions

**Files:**
- Modify: `src/components/layouts/SlideFrame.tsx`, `src/components/layouts/FlowLayout.tsx`, `src/components/layouts/StandardLayout.tsx`, `src/components/layouts/TextFocusLayout.tsx`, `src/index.css`
- Create: `src/components/layouts/densityCompositions.test.tsx`
- Modify (tests): `src/components/layouts/everyBlockRenders.test.tsx`

**Interfaces:**
- Consumes: `compositionOf`, `Composition` from Task 1.
- Produces:
  - `SlideFrame` gains `composition?: Composition` (default `'stack'`; ignored, i.e. treated as `stack`, when `aside` is set). The frame root carries `data-composition={composition}` in every case.
  - `export function BodyUnits({ composition, units }: { composition: Composition; units: ReactNode[] }): ReactElement` in `SlideFrame.tsx`.

Markup:
- `stack`: as today.
- `sideHead`: from the 640px container width up, a grid `@min-[640px]:grid-cols-[2fr_3fr]` with gap `SLIDE_GAP.section`: the head zone in the left cell (top-aligned), the body zone in the right cell, stretched to the row's full height and drawn as the zone panel. Below 640px, today's stack.
- `splitBody`: the head across the top as today; `BodyUnits` draws the two units in a `@min-[640px]:grid-cols-2` grid with gap `SLIDE_GAP.section`, the first wrapped in a zone panel, the second plain with the same padding so their text tops line up.
- The zone panel: `data-zone-panel=""`, background `var(--slide-ground-tint)`, `rounded-slide`, padding `SLIDE_GAP.group`, `@container` (so the arrangements inside lay out for the panel's width), a flex column with gap `SLIDE_GAP.group`.
- `BodyUnits` for `stack` and `sideHead`: a flex column with gap `SLIDE_GAP.group` (today's body wrapper).
- `index.css`: an unlayered rule `[data-zone-panel] [data-accent-panel] { --slide-panel-bg: var(--slide-surface); }` beside the existing `[data-ground] [data-accent-panel]` rule, with a comment.

Callers:
- `FlowLayout`: units are the body's drawn nodes (the lone photo's band is never a unit; a card with a photo resolves to `stack` anyway). Pass `compositionOf(blocks, units, layout)` to `SlideFrame` and draw the nodes through `BodyUnits`. `fill` is unchanged (it is already null with two or more units).
- `StandardLayout` and `TextFocusLayout`: each body index is one unit. `TextFocusLayout` keeps `max-w-prose` only in `stack`.

- [ ] **Step 1: Write the failing render tests** in `densityCompositions.test.tsx`, rendering through `LayoutRenderer` (both `structured` and `expressive`):
  - heading 'Loops' + paragraph + bulletList (3 items) + paragraph → `data-composition="sideHead"`; the head zone comes before `data-zone-panel`; the list items and the trailing paragraph appear after `data-zone-panel`; the lead does not.
  - same with a 61-character heading → `data-composition="splitBody"`, exactly one `data-zone-panel`, the list (first unit) inside it.
  - heading + paragraph + bulletList → `data-composition="stack"`, no `data-zone-panel`.
  - heading + 2 comparison groups + paragraph (layout `comparison`) → `sideHead`, exactly one `data-accent-owner`.
  - a paragraph before the heading, then heading + list + paragraph → the first paragraph's text is inside the zone panel, the heading in the head.
  - stylesheet: `src/index.css` contains `[data-zone-panel] [data-accent-panel]` setting `--slide-panel-bg: var(--slide-surface)` (read the file with `readFileSync`, as `slideGround.test.tsx` does).
- [ ] **Step 2: Extend `everyBlockRenders.test.tsx`** with an image-free kitchen sink (the existing one minus both image blocks) run through every layout, forced and automatic, both treatments, with the same exactly-once assertion; and assert that at least one of those runs renders `data-composition="sideHead"` so the case is really exercised.
- [ ] **Step 3:** Run `npx vitest run src/components/layouts/densityCompositions.test.tsx src/components/layouts/everyBlockRenders.test.tsx`. Expected: FAIL.
- [ ] **Step 4:** Implement the markup, callers and CSS above.
- [ ] **Step 5:** Run `npm run test`, `npm run lint`, `npm run build`. Expected: all pass (existing `SlideFrame`, `fillsBody`, `accentBudget`, `redrawRules`, `slideWidthOnly`, `selfCentring` tests unchanged and green).
- [ ] **Step 6: Commit** the seven files above by path, message `feat(layouts): side head and split body compositions for slides with several body units`.

### Task 3: Gallery cards, docs and the screen check

**Files:**
- Modify: `src/engine/fixtures/galleryDeck.ts`, `src/engine/fixtures/galleryDeck.test.ts`, `CLAUDE.md`
- Possibly modify: `src/engine/composition.ts` (constants only, if tuned)

**Interfaces:**
- Consumes: Tasks 1 and 2.

- [ ] **Step 1:** Append three structured cards to `GALLERY_DECK` (after `g-hero-extra`, order indices continuing): `g-sidehead` (short heading, lead, numbered list of 4 items, closing paragraph → `numberedList`), `g-sidehead-stats` (short heading, lead, three stats, closing paragraph → `statGrid`), `g-splitbody` (heading over 60 characters, lead, bullet list, comparison pair → `iconGrid` or whatever it resolves to; record the resolved name in `EXPECTED`). Add each to `EXPECTED` and a test that `compositionOf` gives `sideHead`, `sideHead`, `splitBody` for them.
- [ ] **Step 2:** Run `npx vitest run src/engine/fixtures`. Expected: PASS.
- [ ] **Step 3 (controller, by hand):** `npm run dev`, open `/dev/slides?deck=gallery&only=g-sidehead`, then `g-sidehead-stats`, `g-splitbody`, both treatments, in Bordo, Deep Space and Chalkboard. Check: panel visible, head top-left, nothing clipped, comparison featured panel readable inside the zone panel. Tune `SIDE_HEAD_MAX_CLAIM`/`SIDE_HEAD_MAX_LEAD` if a head wraps badly, updating Task 1's tests to match.
- [ ] **Step 4:** In `CLAUDE.md`, under Content model & layout engine, add a **Density compositions** bullet: `compositionOf` rules, blocks only (no weight), the three markups and `data-composition` / `data-zone-panel` hooks, the panel's `@container`, the CSS re-point, no picker option, wireframes and PPTX unchanged, and which themes were checked in a browser. Add `densityCompositions.test.tsx` to the Testing list.
- [ ] **Step 5:** Run `npm run test`, `npm run lint`, `npm run build`. Expected: all pass.
- [ ] **Step 6: Commit** the changed files by path, message `docs: density compositions in CLAUDE.md; gallery cards for side head and split body`.
