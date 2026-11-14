# Slide Redraw (Phase 1b, part A: existing layouts) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redraw every existing slide arrangement so its body fills the slide, its numerals and figures are the graphic, and items are separated by rules and space instead of boxes.

**Architecture:** No data, schema, classifier or export change. `FlowLayout` tells a lone group to fill the body zone; `GroupRenderer` redraws each arrangement under the five redraw rules; `hero`, `quote` and the two photo frames get their own redraw. A dev-only gallery (`/dev/slides?deck=gallery`) shows every arrangement in both treatments so each task is checked on screen by the controller.

**Tech Stack:** React 19, TypeScript, Tailwind v4 (container queries only in layouts), Vitest with `renderToStaticMarkup` (no jsdom).

**Spec:** `docs/superpowers/specs/2026-11-13-slide-composition-design.md`, section "Phase 1b: redraw" (the five rules and the per-layout notes). The "Density compositions" and "New layouts" subsections are parts B and C, not this plan.

## Global Constraints

- **A block's index is its address.** No block is reordered, dropped, duplicated or re-indexed. Every block is drawn exactly once under its own index (`everyBlockRenders.test.tsx` must keep passing unchanged except where a task says otherwise).
- **`Adjustable` wraps exactly one element** and nothing sits between an `Adjustable` and its child. Every block keeps its `Adjustable`; every list item keeps `{...itemProps(listIndex, i)}` on its item container; every text run stays an `EditableText` with the same `textRef`.
- Numerals, ticks, tracks and rules are decoration: `aria-hidden="true"`, never an `EditableText`, never a block.
- **Layouts never use screen breakpoints** (`sm:`, `md:`), only `@min-[...]:` container queries (`slideWidthOnly.test.ts`).
- **No fill behind a heading** (`noHeadingFill.test.tsx`). **At most one `data-accent-owner` per slide** (`accentBudget.test.tsx`), set only on the block `accentIndex` names.
- **Rule 3, no boxes:** no arrangement draws a card that is both bordered and filled, and none draws `bg-slide-surface` item cards. Separation is a hairline (`border-slide-border`), a column gap or space.
- **Rule 2, scale contrast:** a numeral, figure or step label is accent-coloured text at h3 size or larger, set in `SLIDE_HEADING_FONT`. No numeral inside a filled disc.
- Colours only through `slide-*` utilities or the `--slide-*` variables, so the deep and tint grounds keep working. The tint is `var(--slide-ground-tint)`.
- Fonts: every element carrying words sets `SLIDE_HEADING_FONT` or `SLIDE_BODY_FONT` on its own root. Sizes are `var(--slide-size-h1|h2|h3|body)` or `SLIDE_SIZE.*` so a user's size pick carries; never a fixed `text-lg`, `text-sm` or px size on slide text.
- Gaps between a slide's zones use `SLIDE_GAP.tight | group | section` (`src/lib/theme-tokens.ts`). Inside an arrangement use the same three values; no other gap value in redrawn code.
- A slide is a 16:9 floor that may grow: nothing gets a fixed height, `overflow-hidden` or a `max-h`. Filling is `flex-1` / `grid-auto-rows: minmax(min-content, 1fr)`, so long content still grows the slide.
- Never animate a slide surface.
- Each wireframe in `src/components/editor/LayoutWireframe.tsx` mirrors its arrangement: a task that redraws an arrangement updates its wireframe (both treatments) in the same commit.
- The PPTX export (`src/export/`) is not touched in this plan.
- `import type` for type-only imports. No em dashes in comments or copy.
- Commits name exact paths, never `git add -A`. Each commit message ends with `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`.
- Verify with `npm run test`, `npm run lint`, `npm run build`. Baseline: 200 test files / 2529 tests pass, lint warnings only, build passes.

## The two treatments

Every arrangement keeps a `structured` and an `expressive` drawing, and they must differ visibly without breaking the rules above:

- **structured:** hairline rules, numerals at the stated size in regular or semibold weight, text at body or lead size.
- **expressive:** no hairlines or fewer, numerals one step larger and extrabold, item text semibold, more air. Never more fills.

## Review Focus

1. A list of 9 to 12 long items must not overflow or shrink into illegible columns: past the stated item count an arrangement falls back to rows or two columns, and the slide grows (Task 3 tests).
2. A slide with a group plus other body blocks (a paragraph after a list, two groups) must still draw everything once in order; only a lone group fills (Task 2 tests).
3. A single-item list, a single stat in a grid, a one-step timeline and a one-group comparison each still draw sensibly (Tasks 3 to 6 tests render them).
4. A very long stat value ("1,250,000 km") must not collide with its neighbour or its label (Task 4 keeps `figureSize`).
5. On the deep ground (a hero holding leftover lists or stats) redrawn arrangements stay readable: no hard-coded colour, only `slide-*` tokens (Global Constraints; Task 7 gallery card).

---

### Task 1: The dev gallery

**Files:**
- Create: `src/engine/fixtures/galleryDeck.ts`, `src/engine/fixtures/galleryDeck.test.ts`
- Modify: `src/pages/DevSlidesPage.tsx`

**Interfaces:**
- Consumes: `CPP_DECK`, `withStyle` (`src/engine/fixtures/cppDeck.ts`); `cardSchema` (`src/engine/contentBlocks.ts`); `resolveLayout`, `layoutVarieties` (`src/engine/layoutEngine.ts`).
- Produces: `export const GALLERY_DECK: Card[]` and `export const FIXTURE_PHOTO: string` (an inline SVG data URI, 1200x800, a soft two-colour gradient with a few shapes, so a photo slide needs no network).

`GALLERY_DECK` holds one card per arrangement the redraw touches, each with a claim heading, realistic C++ teaching text, ids `g-<name>`, gapless `orderIndex`, `visualStyle: 'structured'`, and an explicit `layout` wherever the classifier would not award it:

| id | layout | blocks |
|----|--------|--------|
| `g-hero` | `hero` | heading, paragraph |
| `g-icons3` | `iconGrid` | heading, paragraph, list of 3 short items |
| `g-icons6` | `iconGrid` | heading, list of 6 short items |
| `g-numbered` | `numberedList` | heading, paragraph, list of 5 sentence-length items |
| `g-numbered10` | `numberedList` | heading, list of 10 items |
| `g-checklist` | `checklist` | heading, list of 4 items |
| `g-split` | `splitList` | heading, list of 8 items |
| `g-stats3` | `statGrid` | heading, 3 stats |
| `g-stats5` | `statGrid` | heading, 5 stats, one with a long value (`1,250,000`) |
| `g-statlist` | `statList` | heading, paragraph, 4 stats with sentence labels |
| `g-stathero` | `statHero` | heading, one stat, paragraph |
| `g-timeline` | `timeline` | heading, paragraph, 4 steps |
| `g-timelinerow` | `timelineRow` | heading, 4 steps |
| `g-timelinerow6` | `timelineRow` | heading, 6 steps |
| `g-compare` | `comparison` | heading, 2 groups of 3 items |
| `g-compare3` | `comparison` | heading, 3 groups of 3 items |
| `g-table` | `comparisonTable` | heading, 3 groups of 4 items |
| `g-quote` | `quote` | heading, quote with attribution |
| `g-text` | `textFocus` | heading, 3 paragraphs |
| `g-standard` | `standard` | heading, paragraph, list, paragraph (a group plus other body blocks) |
| `g-split-photo` | `standardSplit` | heading, paragraph, paragraph, image (`FIXTURE_PHOTO`) |
| `g-image` | `imageFocus` | heading, paragraph, image |
| `g-list-photo` | `iconGrid` | heading, list of 4, image (the photo band) |
| `g-hero-extra` | `hero` | heading, paragraph, list of 3, 2 stats (leftovers on the deep ground) |

- [ ] **Step 1: Write the failing test** `galleryDeck.test.ts`: every card parses with `cardSchema`; ids unique; `orderIndex` is 0..n-1; each card's `resolveLayout(card.layout, card.blocks, { isFirstCard: i === 0 })` equals the layout named in the table; `FIXTURE_PHOTO` starts with `data:image/svg+xml`.
- [ ] **Step 2: Run** `npx vitest run src/engine/fixtures`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** the fixture. Check `layoutTypeSchema` for the exact layout names and correct the table's names to the real ones if any differs (report it).
- [ ] **Step 4: Extend `DevSlidesPage`**: `?deck=gallery` draws `GALLERY_DECK` instead of `CPP_DECK`; `?only=<id>` draws one card; each slide gets a small caption above it (`id · resolved layout · style`) in app-chrome text; `data-dev-slide` becomes the card id for the gallery. The nav gains links for the two decks. Keep `?theme`, `?style`, `?all`.
- [ ] **Step 5: Run** `npm run test`, `npm run lint`, `npm run build`. Expected: PASS. Confirm the production build's entry chunk does not contain `galleryDeck` (the page is lazy and dev-only): search the built `dist/assets` for the string `g-timelinerow6` and expect no match.
- [ ] **Step 6: Commit**

```bash
git add src/engine/fixtures/galleryDeck.ts src/engine/fixtures/galleryDeck.test.ts src/pages/DevSlidesPage.tsx
git commit -m "chore(dev): a gallery deck with one slide per arrangement"
```

---

### Task 2: A lone group fills the body zone

**Files:**
- Modify: `src/engine/composition.ts`, `src/components/layouts/FlowLayout.tsx`, `src/components/layouts/GroupRenderer.tsx`, `src/components/layouts/SlideFrame.tsx` (only if its body zone does not already let a child stretch)
- Test: `src/engine/composition.test.ts`, new `src/components/layouts/fillsBody.test.tsx`

**Interfaces:**
- Produces:
  - `export type ItemStep = 'roomy' | 'normal'` and `export function itemStep(texts: string[]): ItemStep` in `composition.ts`: `'roomy'` when there are at most 4 texts and the longest is at most 48 characters, else `'normal'`. Arrangements draw item text at `SLIDE_SIZE.lead` for `roomy` and `var(--slide-size-body)` for `normal`.
  - `export function fillNode(nodes: RenderNode[], bodyIndices: number[], photoIndex: number | null): string | null` in `composition.ts` (import the node type and `nodeKey` from `src/engine/groups.ts`; use the real type name): the `nodeKey` of the one group node in the body when the body holds **exactly one group node and no other body node** apart from the lone photo's leaf; otherwise `null`.
  - `GroupRenderer` prop `fill?: boolean`. When true the arrangement's root carries `data-fill=""` and `flex-1`, and lays its rows or columns out to share the height (Tasks 3 to 6 give each arrangement's filled form; in this task every arrangement gets the attribute and `flex-1` on its root and a `min-h-0`-free stretch: columns `items-stretch`, rows `flex-1` each).
  - `FlowLayout`'s body wrapper is `flex flex-1 flex-col` and passes `fill` to the node `fillNode` names.

- [ ] **Step 1: Write the failing tests.**

`composition.test.ts`:

```ts
describe('itemStep', () => {
  it('is roomy for a few short items', () => expect(itemStep(['if', 'switch', 'ternary'])).toBe('roomy'))
  it('is normal past four items', () => expect(itemStep(['a', 'b', 'c', 'd', 'e'])).toBe('normal'))
  it('is normal when one item is long', () => expect(itemStep(['a', 'x'.repeat(49)])).toBe('normal'))
  it('is roomy for none', () => expect(itemStep([])).toBe('roomy'))
})
```

and `fillNode` over `GALLERY_DECK`: `g-icons3`, `g-stats3`, `g-timeline`, `g-compare`, `g-list-photo` name their group; `g-standard` (list between paragraphs) and `g-hero-extra` return `null`; a card with two groups returns `null`; a card with no group returns `null`.

`fillsBody.test.tsx` (render through `LayoutRenderer` inside `SlideBody`, the way `SlideFrame.test.tsx` does): each of the fill cards above has exactly one `data-fill`; `g-standard` has none; both treatments.

- [ ] **Step 2: Run** `npx vitest run src/engine/composition.test.ts src/components/layouts/fillsBody.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.** `SlideFrame`'s body zone is already `flex-1`; make sure it is also a flex column so its child can stretch, without changing what it draws.
- [ ] **Step 4: Run** `npm run test`. Expected: PASS, `everyBlockRenders` unchanged.
- [ ] **Step 5: Commit**

```bash
git add src/engine/composition.ts src/engine/composition.test.ts src/components/layouts/FlowLayout.tsx src/components/layouts/GroupRenderer.tsx src/components/layouts/fillsBody.test.tsx
git commit -m "feat(layouts): a lone group fills the body zone"
```

(Add `SlideFrame.tsx` if touched.)

---

### Task 3: Lists (`chips`, `numbered`, `checklist`, `split`)

**Files:**
- Modify: `src/components/layouts/GroupRenderer.tsx`, `src/components/editor/LayoutWireframe.tsx`
- Test: new `src/components/layouts/redrawRules.test.tsx` (shared by Tasks 3 to 6), `src/components/layouts/everyBlockRenders.test.tsx` only if an assertion about list markup must follow

**Interfaces:**
- Consumes: `itemStep`, the `fill` prop (Task 2), `SLIDE_SIZE`, `SLIDE_GAP`.

The four arrangements, each as one `Adjustable` around the list root, each item container carrying `itemProps`:

- **`chips` (the `iconGrid` layout).** Up to 4 items: one row of equal columns (`grid`, `repeat(n, minmax(0, 1fr))`, gap `SLIDE_GAP.section`); 5 or 6 items: 3 columns in two rows; 7 or more: falls back to the `numbered` drawing. Each column: a top hairline (structured) or none (expressive), then the numeral `01`, `02` at `var(--slide-size-h1)` (structured, semibold) or `calc(var(--slide-size-h1) * 1.25)` (expressive, extrabold) in `text-slide-accent`, then the item text at the `itemStep` size (semibold when expressive). When `fill`, columns stretch to the zone's height with the text directly under the numeral (content starts at the top of the column; the rule and the column's full height carry the fill).
- **`numbered` (`numberedList`).** Ruled rows: a fixed numeral column (`3.5em` wide at the numeral's own size) with `01` at `var(--slide-size-h2)` (structured) or `var(--slide-size-h1)` extrabold (expressive) in accent, item text beside it at the `itemStep` size, vertically centred in the row. A hairline between rows (structured) or `SLIDE_GAP.tight` of space and no rule (expressive). When `fill`, every row is `flex-1`. Past 6 items the numeral drops to `var(--slide-size-h3)` and the list becomes two columns of rows (`@min-[640px]:grid-cols-2`, column gap `SLIDE_GAP.section`, items flowing down the first column then the second via `grid-auto-flow: column` with `grid-template-rows: repeat(ceil(n/2), auto)`).
- **`checklist`.** The `numbered` rows with a tick in place of the numeral: the existing `CheckMark` SVG drawn at `1.4em` in accent (structured), or inside a ring (`border-2 border-slide-accent rounded-full`, no fill) when expressive.
- **`split` (`splitList`).** Two columns of ruled rows, same row drawing as `numbered` but with a small square marker (structured) or a numeral at `var(--slide-size-h3)` (expressive); rows share the height when `fill`.

Remove the `bg-slide-surface` cards, the bordered tiles, the accent discs and the `border-l-4` edge. Update the four wireframes (and their expressive forms) to the new drawings.

- [ ] **Step 1: Write the failing tests** in `redrawRules.test.tsx`, over the list cards of `GALLERY_DECK` in both treatments (render like `fillsBody.test.tsx`):

```ts
const BOXED = /class="[^"]*\bborder\b[^"]*\bbg-slide-surface\b|class="[^"]*\bbg-slide-surface\b[^"]*\bborder\b/
const NUMERAL_DISC = /class="[^"]*rounded-full[^"]*bg-slide-accent[^"]*"[^>]*>\s*\d/
const FIXED_TEXT_SIZE = /class="[^"]*\btext-(xs|sm|base|lg|xl|2xl)\b/

it.each(LIST_IDS)('%s draws no boxed card, no numeral disc and no fixed text size', ...)
it('draws a large accent numeral per item', ...)   // g-icons3: three aria-hidden numerals 01, 02, 03 with text-slide-accent
it('falls back to rows past six chips', ...)        // a 7-item iconGrid card has no single-row column grid; every item drawn once
it('puts a long numbered list in two columns', ...) // g-numbered10: grid-auto-flow column, all ten items once, numerals 01..10 in order
it('uses the roomy step for a few short items and the normal step otherwise', ...) // g-icons3 item text size is SLIDE_SIZE.lead; g-numbered10 is var(--slide-size-body)
it('draws a one-item list', ...)                    // each of the four arrangements with a single item: the item once, one numeral or tick
```

`LIST_IDS` = `g-icons3`, `g-icons6`, `g-numbered`, `g-numbered10`, `g-checklist`, `g-split`.

- [ ] **Step 2: Run** `npx vitest run src/components/layouts/redrawRules.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** the four arrangements and their wireframes.
- [ ] **Step 4: Run** `npm run test`, `npm run lint`, `npm run build`. Expected: PASS (`everyBlockRenders`, `accentBudget`, `noHeadingFill`, `slideWidthOnly`, `ToolsPanel` and wireframe tests included).
- [ ] **Step 5: Commit**

```bash
git add src/components/layouts/GroupRenderer.tsx src/components/layouts/redrawRules.test.tsx src/components/editor/LayoutWireframe.tsx
git commit -m "feat(layouts): lists as numeral columns and ruled rows"
```

---

### Task 4: Stats (`boxes`, `statRows`, and `StatHeroLayout`)

**Files:**
- Modify: `src/components/layouts/GroupRenderer.tsx`, `src/components/layouts/StatHeroLayout.tsx`, `src/components/layouts/BlockRenderer.tsx` (`StatBlockView`, only if a prop is needed), `src/components/editor/LayoutWireframe.tsx`
- Test: `src/components/layouts/redrawRules.test.tsx`

- **`boxes` (`statGrid`).** Equal columns, each under a top hairline in `border-slide-accent` (structured) or with no rule (expressive). The figure in accent at the size `figureSize` already returns for the column count, one step larger than today where it fits: h1 base for up to 3 columns becomes `calc(var(--slide-size-h1) * 1.4)` as the base passed to `figureSize` if that helper takes a base step; otherwise keep its result and scale the wrapper. Read `figureSize.ts` first and keep its fitting behaviour: a long value must still fit its column. Figures sit on a shared baseline (the figure row is one grid row; labels are the next row, so a wrapped label never pushes a figure). Labels at body size in `text-slide-muted`. When `fill`, the grid stretches and the figure-and-label pair sits at the top of each column. Past 4 stats: two rows.
- The expressive accent-owner panel in `boxes` is unreachable (a stat grid has no accent owner): remove that branch and the `panel` use there; keep `StatBlockView`'s `panel` prop only if `StatHeroLayout` still uses it.
- **`statRows` (`statList`).** A ledger: a right-aligned figure column (`text-right`, width `34%`) at `var(--slide-size-h2)` (structured) or `var(--slide-size-h1)` extrabold (expressive) in accent, the label beside it at the `itemStep` size of the labels, a hairline between rows (structured) or space (expressive). No `bg-slide-surface` cards. Rows are `flex-1` when `fill`.
- **`StatHeroLayout`.** The figure is the focal point: at least `calc(var(--slide-size-h1) * 2.2)` through `figureSize` so a long value still fits, in accent, `lineHeight: 0.95`, with its label at lead size under it. If the expressive treatment draws the figure on an accent panel today, keep exactly one panel and keep `data-accent-owner` on it (`accentBudget.test.tsx` pins one owner for the expressive stat hero). The layout keeps `my-auto`, its photo halves, and `Leftovers`.

Update the three wireframes.

- [ ] **Step 1: Write the failing tests** in `redrawRules.test.tsx`: `g-stats3`, `g-stats5`, `g-statlist` draw no boxed card and no fixed text size (both treatments); `g-stats5` draws all five figures once and its long value once; in `g-stats3` every figure element comes before every label element in markup order within the grid (shared baseline rows); `g-statlist` figures carry `text-right`; a one-stat `statGrid` card draws its figure once; `g-stathero` has exactly one `data-accent-owner` when expressive and at most one when structured.
- [ ] **Step 2: Run** the file. Expected: FAIL.
- [ ] **Step 3: Implement.** If putting figures and labels in separate grid rows means a stat block is no longer one element under one `Adjustable`, use `grid-template-rows: subgrid` on each stat's own element (the way the `table` arrangement keeps a column one element) so each stat stays a single adjusted node.
- [ ] **Step 4: Run** `npm run test`, `npm run lint`, `npm run build`. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add src/components/layouts/GroupRenderer.tsx src/components/layouts/StatHeroLayout.tsx src/components/layouts/redrawRules.test.tsx src/components/editor/LayoutWireframe.tsx
git commit -m "feat(layouts): stats as figures on a baseline and a ledger"
```

(Add `BlockRenderer.tsx` if touched.)

---

### Task 5: Timelines (`timeline`, `timelineRow`)

**Files:**
- Modify: `src/components/layouts/GroupRenderer.tsx`, `src/components/editor/LayoutWireframe.tsx`
- Test: `src/components/layouts/redrawRules.test.tsx`

- **`timeline` (vertical).** One continuous track down the left edge for the full height of the arrangement (a single `aria-hidden` line, `bg-slide-accent/40`, no gradient fade), a node on it per step (a `0.75em` dot in accent; expressive: a ring with the step number at `var(--slide-size-h3)` beside the track instead of a dot). Each step: label at `var(--slide-size-h3)` in `SLIDE_HEADING_FONT`, accent, semibold; text under it at the `itemStep` size of the step texts. Steps are `flex-1` when `fill`, so nodes are evenly spaced down the slide. No `bg-slide-surface` cards, no numbered disc.
- **`timelineRow` (horizontal).** One continuous track across the full width (a single line spanning the whole row, not a segment per step), nodes evenly spaced on it at each column's left edge, then per step the label at h3 and its text. Up to 5 steps in one row; 6 or more wrap into two rows, each row with its own full-width track. Expressive: the step number at `var(--slide-size-h1)` extrabold in accent above the label, and the track drawn 2px thicker. When `fill`, the row block sits at the top and the columns stretch.

Update the two wireframes.

- [ ] **Step 1: Write the failing tests**: `g-timeline`, `g-timelinerow`, `g-timelinerow6` draw no boxed card, no numeral disc, no fixed text size (both treatments); each has exactly one track element per row of steps (give the track `data-track=""`: one for `g-timeline`, one for `g-timelinerow`, two for `g-timelinerow6`); step labels are drawn at `var(--slide-size-h3)`; a one-step timeline draws its step once in both arrangements.
- [ ] **Step 2: Run** the file. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm run test`, `npm run lint`, `npm run build`. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add src/components/layouts/GroupRenderer.tsx src/components/layouts/redrawRules.test.tsx src/components/editor/LayoutWireframe.tsx
git commit -m "feat(layouts): timelines on one continuous track"
```

---

### Task 6: Comparisons (`columns`, `table`)

**Files:**
- Modify: `src/components/layouts/GroupRenderer.tsx`, `src/components/editor/LayoutWireframe.tsx`
- Test: `src/components/layouts/redrawRules.test.tsx`, `src/components/layouts/accentBudget.test.tsx` (only if an owner assertion must follow the new markup)

- **`columns` (`comparison`).** Side-by-side panels in both treatments (the expressive stacked rows go away), equal columns, stretched to the zone's height when `fill`. The accent owner's panel is drawn on the tint: `background: var(--slide-ground-tint)`, `rounded-slide-sm`, padding `SLIDE_GAP.group`, no border, and carries `data-accent-owner`. Every other group has no background and no border, the same padding (so headings and rows line up across panels), and a vertical hairline between two unowned neighbours. Group heading at `var(--slide-size-h3)` in `SLIDE_HEADING_FONT`, accent for the owner and foreground otherwise. Items as ruled rows (hairline above each, structured) or spaced rows with a small accent square marker (expressive), at the `itemStep` size of all the groups' items together. On a slide whose ground is already the tint or deep, the owner panel uses `bg-slide-surface` instead, so it still reads as a panel: decide with a CSS-only rule (`[data-ground] [data-accent-panel]` in `src/index.css` re-pointing the panel's background variable), not with a prop.
- **`table` (`comparisonTable`).** Keep the subgrid rows and one element per column. Header at `var(--slide-size-h3)`, semibold, with a 2px accent rule under it; the accent owner's header in accent (expressive: on the tint panel background, the single `data-accent-owner`; no solid accent fill). Cells keep a hairline under each and lose `bg-slide-surface`. When `fill`, body rows share the height (`grid-auto-rows: minmax(min-content, 1fr)` on the outer grid for the item rows; the header row stays `auto`).

Update the two wireframes.

- [ ] **Step 1: Write the failing tests**: `g-compare`, `g-compare3`, `g-table` draw no boxed card and no fixed text size (both treatments); each has exactly one `data-accent-owner`; the expressive `g-compare` draws its groups in a column grid (no stacked `divide-y`); no `bg-slide-accent` solid fill appears in `g-table` (the class `bg-slide-accent` not followed by `/`); a one-group comparison draws its group once.
- [ ] **Step 2: Run** the file. Expected: FAIL.
- [ ] **Step 3: Implement.** Keep `accentBudget.test.tsx` passing; update only assertions that name removed markup.
- [ ] **Step 4: Run** `npm run test`, `npm run lint`, `npm run build`. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add src/components/layouts/GroupRenderer.tsx src/components/layouts/redrawRules.test.tsx src/components/editor/LayoutWireframe.tsx src/index.css
git commit -m "feat(layouts): comparisons as toned panels, the first on the tint"
```

(Add `accentBudget.test.tsx` if touched.)

---

### Task 7: Hero and quote

**Files:**
- Modify: `src/components/layouts/HeroLayout.tsx`, `src/components/layouts/QuoteLayout.tsx`, `src/components/editor/LayoutWireframe.tsx`
- Test: `src/components/layouts/selfCentring.test.tsx`, `src/components/layouts/redrawRules.test.tsx`

- **`hero` without a photo.** The text block sits at the **bottom-left** of the slide: the root drops `my-auto` for `mt-auto` (both treatments). An eyebrow rule above the title (the existing short accent bar: 4rem wide, 3px), the title at `calc(var(--slide-size-h1) * 1.2)` with `lineHeight: 1`, the subtitle (the paragraph after it) at `SLIDE_SIZE.lead` at most 62% wide. Expressive: the title at `calc(var(--slide-size-h1) * 1.45)` extrabold, and one large decorative circle (`aria-hidden`, absolutely placed toward the top-right corner, `bg-slide-accent` at 30% opacity, `pointer-events-none`, drawn as a **sibling** of the text and behind it, bleeding past the padding with `calc(-1 * var(--slide-pad))` offsets). `Leftovers` stay below the subtitle. With a background photo nothing changes.
- **`quote` without a photo.** Stays centred (`my-auto`) and left-aligned on the frame's left edge instead of centred text: an oversized opening quotation mark (`aria-hidden`, `SLIDE_HEADING_FONT`, `calc(var(--slide-size-h1) * 2.4)`, accent, `lineHeight: 0.8`), the quote text at `var(--slide-size-h2)` (structured, regular weight, not italic) or `calc(var(--slide-size-h2) * 1.15)` semibold (expressive), at most 85% wide, then the attribution as an eyebrow: `SLIDE_SIZE.eyebrow`, uppercase, `tracking-[0.14em]`, muted, with a 2rem accent rule before it. The slide's heading, when present, is drawn above the mark as an eyebrow-sized label is **not** allowed (a heading keeps its heading size and its `Heading` component); keep it where it is, above the quote, at its normal size. With a background photo nothing changes except the same left alignment if that branch shares the markup; if it does not, leave the photo branch alone.

Update the hero and quote wireframes.

- [ ] **Step 1: Update and add tests.** `selfCentring.test.tsx`: a hero without a photo now has `mt-auto` and not `my-auto` (both treatments); quote and statHero assertions unchanged. `redrawRules.test.tsx`: `g-hero` title is drawn at the larger size and the subtitle at `SLIDE_SIZE.lead`; `g-quote` has one `aria-hidden` quotation mark, the quote text once, the attribution once with the uppercase eyebrow class; `g-hero-extra` (leftovers on the deep ground) draws every block once and contains no hard-coded colour (`#` followed by 3 or 6 hex digits inside a `style` or `class` attribute).
- [ ] **Step 2: Run** `npx vitest run src/components/layouts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm run test`, `npm run lint`, `npm run build`. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add src/components/layouts/HeroLayout.tsx src/components/layouts/QuoteLayout.tsx src/components/layouts/selfCentring.test.tsx src/components/layouts/redrawRules.test.tsx src/components/editor/LayoutWireframe.tsx
git commit -m "feat(layouts): title at the bottom-left, quote with an oversized mark"
```

---

### Task 8: The photo bleeds to the slide edge

**Files:**
- Modify: `src/components/layouts/SlideFrame.tsx`, `src/components/layouts/StandardSplitLayout.tsx`, `src/components/layouts/ImageFocusLayout.tsx`, `src/components/editor/LayoutWireframe.tsx`
- Test: `src/components/layouts/SlideFrame.test.tsx`

From the 640px container width up, the frame's `aside` photo reaches the slide's edge on its own side and its top and bottom: the aside cell gets negative margins of `var(--slide-pad)` on the outer side, the top and the bottom (the same variable `BackgroundPhoto` insets by; read `BackgroundPhoto.tsx` and `SlideSurface.tsx` first), and the photo fills the cell's height (`h-full object-cover`, no aspect ratio, no border, no radius on the bled sides). Below 640px the photo stays stacked inside the padding as today. The text column keeps its padding and the frame's gap. The photo's `Adjustable` and its figure stay one element; the credit stays inside the figure.

The slide must still be able to grow: the aside stretches with the row (`align-self: stretch`) and never sets the row's height.

- [ ] **Step 1: Write the failing tests** in `SlideFrame.test.tsx`: for `g-split-photo` and `g-image` (both treatments) the aside element carries `data-bleed="right"` or `data-bleed="left"` matching its side; the image is drawn once with `object-cover`; the text column's blocks each appear once; a card with the photo on an odd position bleeds left.
- [ ] **Step 2: Run** the file. Expected: FAIL.
- [ ] **Step 3: Implement**, and update the two wireframes so the photo reaches the tile's edge.
- [ ] **Step 4: Run** `npm run test`, `npm run lint`, `npm run build`. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add src/components/layouts/SlideFrame.tsx src/components/layouts/StandardSplitLayout.tsx src/components/layouts/ImageFocusLayout.tsx src/components/layouts/SlideFrame.test.tsx src/components/editor/LayoutWireframe.tsx
git commit -m "feat(layouts): split and image photos bleed to the slide edge"
```

---

### Task 9: `CLAUDE.md`

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1:** In the file's compact style, update "Content model & layout engine": a lone group fills the body (`fillNode`, the `fill` prop, `data-fill`), `itemStep`, the redraw rules as invariants (no boxed cards, numerals as accent text at h3 or larger, one track per timeline row, comparison owner on the tint), the hero at the bottom-left (`mt-auto`), the quote's left alignment and mark, the photo bleed (`data-bleed`, `--slide-pad`), and that the PPTX export still draws the old plainer arrangements.
- [ ] **Step 2:** Update the Testing list: `redrawRules.test.tsx`, `fillsBody.test.tsx`, `galleryDeck.test.ts`, the changed `selfCentring` assertion; add the dev gallery (`/dev/slides`, `?deck=gallery`, `?theme`, `?style`, `?only`, `?all`; development builds only) as the way to look at every arrangement without an account.
- [ ] **Step 3:** State what was checked in a browser and what was not, with the date.
- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: the redrawn arrangements and the dev gallery in CLAUDE.md"
```
