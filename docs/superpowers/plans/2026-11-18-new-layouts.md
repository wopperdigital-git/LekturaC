# New Layouts (Phase 1b-C) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Seven new layouts from existing blocks: `section`, `statement`, `twoColumn`, `statSplit`, `steps`, `photoList`, `beforeAfter`.

**Architecture:** Each is a new `LayoutType`. `section` and `statement` are self-composing frames (like `hero`/`quote`); `twoColumn`, `statSplit` and `photoList` are frames drawn through `SlideFrame`; `steps` and `beforeAfter` are new `GroupRenderer` arrangements drawn through `FlowLayout`. The classifier awards four (`section`, `statement`, `statSplit`, `photoList`) where the block signature is unambiguous; `twoColumn`, `steps` and `beforeAfter` are reached through the picker (and `twoColumn` through `varyLayouts`). Nothing new is stored beyond the existing `layout` string.

**Tech Stack:** React 19, TypeScript, Tailwind v4 container queries, zod, Vitest with `renderToStaticMarkup`.

**Spec:** `docs/superpowers/specs/2026-11-13-slide-composition-design.md`, section "New layouts in Phase 1b (existing blocks only)" (lines 205-221), plus the five redraw rules in "Phase 1b: redraw" and the rulings below.

## Rulings (2026-11-18)

- **Section number** is the slide's position (`position + 1`, two digits, e.g. `04`): a deck-wide section count needs deck context that thumbnails and covers do not have.
- **Classifier awards**, each only on its exact signature, never for the first card (the first card stays `hero`):
  - `section`: the card's only block is one heading.
  - `statement`: exactly one heading then one paragraph of at most `STATEMENT_MAX_LEAD` (140) characters, nothing else.
  - `statSplit`: exactly one `stat` and exactly one `bulletList`, plus any headings/paragraphs, and no image, quote, timeline step or comparison group. (Today this is `statHero` with the list as a leftover.)
  - `photoList`: exactly one image and exactly one `bulletList`, plus any headings/paragraphs, and nothing else. (Today the list's own layout with a thin photo band.)
- **Picker only:** `twoColumn` (text kind, two or more paragraphs), `steps` (timeline kind), `beforeAfter` (comparison kind, exactly two groups). `varyLayouts` gains `textFocus → twoColumn`.
- **Grounds:** `section` deep, `statement` tint, the rest plain. `beforeAfter` draws its second half as a local deep ground by putting `data-ground="deep"` (the `GROUND_ATTR` value) on that half, so `index.css` re-points the colours inside it; picked text colours there are ignored like on any deep ground.
- **Accent owner:** none of the seven owns an accent fill (`accentOwner` returns null). Figures and numerals are accent text.
- **Compositions:** `compositionOf` returns `stack` for all seven (each arranges its own width).
- **PPTX:** mapping only, no new renderers: `section`, `statement` → `title`; `twoColumn`, `steps`, `photoList` → `body`; `statSplit` → `stat`; `beforeAfter` → `twoCol`. The export's grounds already follow `groundOfLayout`.
- **Validation family** (`LAYOUT_FAMILY` in `generation/validation/structure.ts`): `section` hero, `statement` text, `twoColumn` text, `statSplit` data, `steps` timeline, `photoList` list, `beforeAfter` comparison.
- **Card kinds:** `section` → `title` (and a lone heading not first is kind `title`, so the picker offers `hero` and `section`); `statement`, `twoColumn` → `text`; `statSplit` → `stats`; `steps` → `timeline`; `photoList` → `list`; `beforeAfter` → `comparison`.

## Global Constraints

- Every block drawn exactly once under its own index; self-composing frames end with `<Leftovers blocks consumed />`.
- Container queries only (`@min-[640px]:`), never screen breakpoints.
- Gaps only from `SLIDE_GAP` (`tight`, `group`, `section`); sizes as `var(--slide-size-*)` or `SLIDE_SIZE.*`, so size picks carry.
- No fill behind a heading; no `border` + `bg-slide-surface` boxes; numerals and figures are accent text at h3 or larger, never discs.
- Each frame chooses its own vertical placement (`my-auto` to centre, `mt-auto` for the foot, nothing for top).
- Each layout gets a `LayoutWireframe` (both treatments) mirroring its JSX, and a picker label.
- Commits name exact paths (never `git add -A`) and end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. A `statSplit` or `photoList` card with a second paragraph after the list: still drawn once, in the body (render tests with a trailing paragraph).
2. A `section` or `statement` named explicitly on a card with more blocks (picker or undo): leftovers drawn once (Leftovers test).
3. `beforeAfter` with three comparison groups (named by hand, then a group added): falls back to `columns`, nothing dropped.
4. `steps` with seven steps: wraps to two rows, every step once.
5. Classifier stability: every existing gallery card (`GALLERY_DECK`) and `CPP_DECK` card still resolves as before except the ones a ruling above deliberately moves (assert the exact list).

---

### Task 1: Engine and stand-ins

**Files:** `src/engine/contentBlocks.ts`, `src/engine/layoutEngine.ts`, `src/engine/composition.ts`, `src/engine/groups.ts`, `src/engine/varyLayouts.ts`, `src/export/slideGroup.ts`, `src/generation/validation/structure.ts`, `src/components/layouts/LayoutRenderer.tsx`, `src/components/layouts/GroupRenderer.tsx`, `src/components/editor/LayoutWireframe.tsx`, `src/components/editor/LayoutPicker.tsx`, and their colocated tests (`layoutEngine.test.ts`, `composition.test.ts`, `groups.test.ts`, `varyLayouts.test.ts`, `slideGroup.test.ts`).

**Interfaces (produces):**
- `layoutTypeSchema` gains `'section' | 'statement' | 'twoColumn' | 'statSplit' | 'steps' | 'photoList' | 'beforeAfter'` (appended, order otherwise unchanged).
- `export const STATEMENT_MAX_LEAD = 140` in `layoutEngine.ts`.
- `GroupNode` gains arrangements `'steps'` (timelineStep runs, from hint `steps`) and `'beforeAfter'` (comparisonGroup runs of exactly two, from hint `beforeAfter`; any other count falls back to `'columns'`). `listArrangement(list, 'photoList')` returns `'numbered'`.
- `FLOW_LAYOUTS` gains `steps` and `beforeAfter`; `LAYOUT_COMPONENTS` gains the five frames, temporarily all `StandardLayout` (Tasks 2-3 replace them). `GroupRenderer` draws `steps` as `timelineRow` and `beforeAfter` as `columns` temporarily (Task 4 replaces them). `LayoutWireframe` draws the seven temporarily as its `standard` wireframe. `LayoutPicker` labels: Section, Statement, Two columns, Stat with list, Steps, Photo with list, Before and after.

- [ ] **Step 1: failing tests.** `layoutEngine.test.ts`: each classifier award and non-award from the Rulings (lone heading first card → `hero`, not first → `section`; heading + 140-char paragraph → `statement`, 141 → not; heading + paragraph + quote → not `statement`; stat + list → `statSplit`, stat + list + quote → not; photo + list → `photoList`, photo + list + stat → not; heading + 2 paragraphs → `textFocus` still); `cardKindOf`/`componentsForKind` for each kind above (title offers `hero`,`section`; text offers `statement` only for heading + one paragraph, `twoColumn` only with 2+ paragraphs; stats with one stat and a list offers `statHero`,`statSplit`; timeline adds `steps`; comparison with exactly 2 groups adds `beforeAfter`; list with exactly one image adds `photoList`); `groundOfLayout` (section deep, statement tint, the other five plain); `accentOwner` null for all seven; `compositionOf` stack for all seven given two units; `inferGroups` with hints `steps`/`beforeAfter`/`photoList` (and `beforeAfter` with three groups → `columns`); `varyLayouts` textFocus pair → second `twoColumn`; `slideGroup` mapping. Plus the Review Focus 5 stability test over `GALLERY_DECK` and `CPP_DECK`: record each card's resolved layout on master in the test and assert only the cards a ruling moves differ (list them).
- [ ] **Step 2:** `npx vitest run src/engine src/export/slideGroup.test.ts` → FAIL.
- [ ] **Step 3:** implement; `npm run build` must type-check (exhaustive records force every mapping).
- [ ] **Step 4:** `npm run test`, `npm run lint`, `npm run build` → pass. Some existing render tests may assert a card's old layout; if a test fails only because a ruling moved that card, update it and name it in the report.
- [ ] **Step 5:** commit the files by path: `feat(engine): seven new layout types, classifier awards and stand-in renderers`.

### Task 2: `section` and `statement`

**Files:** Create `src/components/layouts/SectionLayout.tsx`, `src/components/layouts/StatementLayout.tsx`; modify `LayoutRenderer.tsx`, `LayoutWireframe.tsx`, `src/engine/fixtures/galleryDeck.ts` (+ test), `selfCentring.test.tsx`, `slideGround.test.tsx`, `LayoutWireframe.test.tsx`; create `src/components/layouts/newLayouts.test.tsx`.

**Markup:**
- `section`: deep ground (from `groundOfLayout`). Root `mt-auto` (bottom-left, like the hero), left-aligned. The numeral `String(position + 1).padStart(2, '0')` as `aria-hidden` accent text at `calc(var(--slide-size-h1) * 2)`, then an accent hairline rule, then the heading at h1 (`Heading size="h1"` path the hero uses). Ends with `<Leftovers>`.
- `statement`: tint ground. Root `my-auto`, left-aligned, max width about 22em of the heading size. The heading at h1, the paragraph below at `SLIDE_SIZE.lead` with `SLIDE_GAP.group` between. Ends with `<Leftovers>`.
- Hooks: `data-section-number`, `data-statement-root`.
- Wireframes: section on a filled (deep) ground with a large numeral bar and a title bar bottom-left; statement on a tint with one thick bar and a thin bar, vertically centred. `data-wire-ground` set accordingly.

- [ ] Tests first in `newLayouts.test.tsx` (both treatments): section draws `04` for `position` 3, `aria-hidden`, accent text, heading once; statement draws heading and paragraph once with `my-auto` on its root; a section card with an extra paragraph draws it once (leftovers). Update `selfCentring` (statement `my-auto`; section `mt-auto`, never `my-auto`), `slideGround` (section deep, statement tint), `LayoutWireframe.test` (section deep, statement tint wireframes). Gallery cards `g-section` (heading alone, not first) and `g-statement` with `EXPECTED` entries.
- [ ] Run focused tests (fail), implement, `npm run test`/`lint`/`build` (pass), commit by path: `feat(layouts): section and statement`.

### Task 3: `twoColumn`, `statSplit`, `photoList`

**Files:** Create `TwoColumnLayout.tsx`, `StatSplitLayout.tsx`, `PhotoListLayout.tsx` in `src/components/layouts/`; modify `LayoutRenderer.tsx`, `LayoutWireframe.tsx`, `galleryDeck.ts` (+ test), `newLayouts.test.tsx`, `LayoutWireframe.test.tsx`.

**Markup (all through `SlideFrame`, head top-left):**
- `twoColumn`: body blocks in two columns from 640px (`@min-[640px]:columns-2`, `column-gap` `SLIDE_GAP.section`, each block `break-inside-avoid`), one column below. Keeps author order down then across.
- `statSplit`: body as a grid `@min-[640px]:grid-cols-[2fr_3fr]` with gap `SLIDE_GAP.section`: left the stat figure (accent text, `figureSize` sizing as `StatColumns` uses, label below at `SLIDE_SIZE.lead`), right the list as ruled rows (`GroupRenderer` with the list's node, arrangement `numbered` or the list's own). Any other body blocks follow below the grid in order.
- `photoList`: `SlideFrame` `aside` with the card's photo (`side` by `position` like `standardSplit`, `width: 'half'`, `bleed: true`); the body wrapper is a `@container` with `--zone-width: 100cqi` so the numbered rows' numeral column caps to the column (the cap from Phase 1b-B); the list drawn through `GroupRenderer` (`numbered` from the `photoList` hint).
- Hooks: `data-two-column`, `data-stat-split`, `data-photo-list` on each body root.

- [ ] Tests first (both treatments): each draws every block once; twoColumn's body carries `columns-2` and each paragraph `break-inside-avoid`; statSplit has the figure as accent text with no `bg-slide-accent` and the list's items once; a statSplit with a trailing paragraph draws it once below; photoList has `data-bleed` on the side for even/odd positions and the list once; wireframes for the three (photoList and statSplit drawn with a photo/figure block on their side). Gallery cards `g-twocol` (explicit `twoColumn`, three paragraphs), `g-statsplit`, `g-photolist`.
- [ ] Run focused tests (fail), implement, full suite/lint/build (pass), commit by path: `feat(layouts): two columns, stat split and photo list`.

### Task 4: `steps` and `beforeAfter` arrangements

**Files:** modify `GroupRenderer.tsx`, `LayoutWireframe.tsx`, `galleryDeck.ts` (+ test), `newLayouts.test.tsx`, `redrawRules.test.tsx` (if it enumerates arrangements), `LayoutWireframe.test.tsx`.

**Markup:**
- `steps`: a row of steps across the full width, each step a column with its number as accent text at h3 (`aria-hidden`), its label at h3 weight and text at body; between steps an `aria-hidden` chevron (inline SVG, `currentColor` accent, stroke only). Six or more steps wrap to two rows of `ceil(n/2)`, the chevron dropped at a row's end. No boxes; `fill` stretches rows like the timeline row.
- `beforeAfter`: two halves side by side from 640px (stacked below) with an `aria-hidden` arrow between (inline SVG pointing right, down when stacked); the first half plain, the second half `data-ground="deep"` with background `var(--slide-background)` (re-pointed by the ground rule), padding `SLIDE_GAP.group`, `rounded-slide`. Each half: group heading (`data-group-heading`) then its items as ruled rows.
- Hooks: `data-steps`, `data-step-chevron`, `data-before-after`, `data-before-after-arrow`.

- [ ] Tests first (both treatments): every step and group item once; chevrons = steps − rows; seven steps → two rows; the second beforeAfter half carries `data-ground="deep"` and the first does not; no `data-accent-owner`; wireframes for both. Gallery cards `g-steps` (explicit `steps`, four steps) and `g-beforeafter` (explicit `beforeAfter`, two groups).
- [ ] Run focused tests (fail), implement, full suite/lint/build (pass), commit by path: `feat(layouts): steps and before-and-after arrangements`.

### Task 5: Coverage, docs, browser check

**Files:** `src/components/layouts/everyBlockRenders.test.tsx`, `CLAUDE.md`.

- [ ] `everyBlockRenders.test.tsx`: add the seven layouts to `LAYOUTS` so the kitchen sink (and the image-free sink) runs through each, forced, both treatments, exactly once. Run; fix any layout that drops or duplicates.
- [ ] `CLAUDE.md`: a **New layouts** bullet under Content model & layout engine (what each is, the classifier awards and thresholds, picker-only ones, grounds, section number = position, beforeAfter's local deep half, PPTX mapping), update the classifier list in the `chooseLayout` bullet, the Extra varieties bullet, the Grounds bullet (section deep, statement tint), the wireframe-ground sentence, and add `newLayouts.test.tsx` to Testing. Browser line filled in by the controller after the check.
- [ ] `npm run test`, `npm run lint`, `npm run build` (pass); commit by path: `docs: new layouts in CLAUDE.md; every layout in everyBlockRenders`.
- [ ] Controller, by hand: `/dev/slides?deck=gallery&only=<id>` for the seven new cards in Bordo (both treatments), Deep Space and Chalkboard (expressive); fix what reads wrong; record the result in CLAUDE.md.
