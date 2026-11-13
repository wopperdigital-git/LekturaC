# Slide Composition Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every slide is drawn through shared composition rules: a claim and lead anchored top-left on one edge, three gap sizes, no fill behind a heading, and at most one accent-filled panel.

**Architecture:** A pure module (`engine/composition.ts`) derives slots and the accent owner from a card's blocks at render, by index, the way `inferGroups` derives groups; nothing is stored. One `SlideFrame` component draws the head and body zones, and `FlowLayout`, `StandardLayout`, `TextFocusLayout`, `StandardSplitLayout` and `ImageFocusLayout` render through it. `SlideBody` stops centring; layouts that centre themselves (`hero`, `quote`, `statHero`) do it at their own root.

**Tech Stack:** React 19, TypeScript, Tailwind v4 (container queries only inside layouts), Vitest with `react-dom/server` render tests (no jsdom).

**Spec:** `docs/superpowers/specs/2026-11-13-slide-composition-design.md` (sections "The seven principles", "Constraints", "Phase 1"). Phases 1c, 1b and 2 get their own plans.

## Global Constraints

- A block's index is its `textRef`, its `card.adjusts` key and its selection. No task may reorder, drop, duplicate or re-index a block. Slots are indices.
- Nothing is stored: no change to `cardSchema`, `cardRow`, migrations or any AI prompt.
- Layouts never use screen breakpoints (`sm:`, `md:`); only `@min-[...]:` container queries (`slideWidthOnly.test.ts`).
- Slide fonts are read as `SLIDE_HEADING_FONT` / `SLIDE_BODY_FONT`, never a `--font-slide-*` alias; every element carrying words sets one on its own root.
- `SlideSurface` keeps `overflow-clip` and `aspect-video`; a slide with more content than 16:9 must still grow.
- Every place a block renders is wrapped in `Adjustable` (or renders through `BlockRenderer` / `Heading`, which wrap themselves).
- Each layout's `LayoutWireframe` case (`src/components/editor/LayoutWireframe.tsx`) is updated in the task that changes how that layout looks.
- `verbatimModuleSyntax`: type-only imports use `import type`.
- Gap values in layouts are only `var(--slide-gap-tight)` (0.5rem), `var(--slide-gap-group)` (1.25rem), `var(--slide-gap-section)` (2.25rem).
- Commits name exact paths (`git add <paths>`); never `git add -A`. The working tree holds the user's own uncommitted edits (see Task 0).
- After every task: `npm run test`, `npm run lint`, `npm run build` all pass.

## Review Focus

1. **A card with no heading, or a heading that is not block 0** (hand-edited cards): everything still draws once, in author order, with no empty head zone. Pinned in Task 2 and Task 5.
2. **A slide taller than 16:9**: with the body zone `flex-1`, a long card must grow the surface, not clip or squash. Pinned by hand in Task 8 (no jsdom); Task 5 keeps `min-h-0` off the frame root.
3. **A nudged or resized lead or claim**: the element is still the `Adjustable` child, so its delta and size still apply. Pinned in Task 5 (the lead `<p>` is the direct child of `Adjustable`).
4. **A user's size percentage on a lead paragraph**: the lead must scale with the element's `fontScale`. Pinned in Task 3 (ratio of `--slide-size-body` at the use site).
5. **Hero or quote with a background photo** once `SlideBody` stops centring: the photo still covers the slide and text stays in `PhotoStage`. Pinned by the existing `BackgroundPhoto.test.tsx` plus by hand in Task 8.

---

### Task 0: Branch and clean tree (needs the user)

The tree on `presenter-ink` has about 90 uncommitted files, including `src/index.css` and `CLAUDE.md`, which this plan edits.

- [ ] **Step 1:** Ask the user to commit or stash their work, then create the branch: `git switch -c slide-composition`.
- [ ] **Step 2:** Run `npm run test && npm run lint && npm run build`. Expected: all pass. Record any pre-existing failure before starting.

### Task 1: Fixture deck

**Files:**
- Create: `src/engine/fixtures/cppDeck.ts`
- Test: `src/engine/fixtures/cppDeck.test.ts`

**Interfaces:**
- Produces: `export const CPP_DECK: Card[]` (7 cards, `orderIndex` 0..6, `layout: 'auto'` except card 0 `'hero'`, `visualStyle: 'structured'`), and `export function withStyle(cards: Card[], style: VisualStyle): Card[]`.

Cards, in order (all start with a heading): title (heading + one paragraph); list (heading, paragraph, `bulletList` of 4 short items); stats (heading, 3 `stat`); timeline (heading, paragraph, 4 `timelineStep`); comparison (heading, 2 `comparisonGroup` of 3 items); quote (heading, `quote` with attribution); photo split (heading, 2 paragraphs, one `image` with `url: 'https://example.com/p.jpg'`). Topic: Control Structures in C++.

- [ ] **Step 1: Write the failing test**

```ts
import { cardSchema } from '@/engine/contentBlocks'
import { resolveLayout } from '@/engine/layoutEngine'
import { CPP_DECK } from './cppDeck'

it('is seven valid cards covering seven layouts', () => {
  expect(CPP_DECK).toHaveLength(7)
  for (const card of CPP_DECK) expect(cardSchema.safeParse(card).success).toBe(true)
  const layouts = CPP_DECK.map((c, i) => resolveLayout(c.layout, c.blocks, { isFirstCard: i === 0 }))
  expect(layouts).toEqual(['hero', 'iconGrid', 'statGrid', 'timeline', 'comparison', 'quote', 'standardSplit'])
})
```

- [ ] **Step 2:** Run `npx vitest run src/engine/fixtures`. Expected: FAIL, module not found.
- [ ] **Step 3:** Write `cppDeck.ts`. If a card resolves to another layout, change the card's blocks, not the expectation.
- [ ] **Step 4:** Run the test. Expected: PASS.
- [ ] **Step 5:** `git add src/engine/fixtures && git commit -m "test: C++ fixture deck for composition work"`

### Task 2: Slots and the accent owner (pure)

**Files:**
- Create: `src/engine/composition.ts`
- Test: `src/engine/composition.test.ts`

**Interfaces:**
- Consumes: `singlePhoto(blocks)` from `src/engine/blockPartition.ts`.
- Produces:

```ts
export interface Slots { claim: number | null; lead: number | null; aside: number | null; body: number[] }
export function slotsOf(blocks: ContentBlock[]): Slots
export function accentOwner(blocks: ContentBlock[], layout: Exclude<LayoutType, 'auto'>): number | null
```

Rules: `claim` = index of the first `heading`. `lead` = `claim + 1` when that block is a `paragraph`, else `null`. `aside` = `singlePhoto(blocks)?.index ?? null`. `body` = every other index, ascending. `accentOwner`: `statHero` → index of the first `stat`; `comparison` or `comparisonTable` → index of the first `comparisonGroup`; anything else → `null`.

- [ ] **Step 1: Write the failing tests**

```ts
const h = { type: 'heading', text: 'H' } as const
const p = { type: 'paragraph', text: 'P' } as const
const img = { type: 'image', url: 'u' } as const
const stat = { type: 'stat', value: '4', label: 'l' } as const
const list = { type: 'bulletList', items: ['a'] } as const
const group = { type: 'comparisonGroup', heading: 'g', items: ['a'] } as const
const KINDS = [h, p, img, stat, list, group]

it('puts every index in exactly one slot, body ascending (all cards up to 4 blocks)', () => {
  const cards: ContentBlock[][] = [[]]
  for (let n = 1; n <= 4; n++) for (const prev of cards.filter((c) => c.length === n - 1)) for (const k of KINDS) cards.push([...prev, k])
  for (const blocks of cards) {
    const s = slotsOf(blocks)
    const all = [s.claim, s.lead, s.aside, ...s.body].filter((i): i is number => i !== null)
    expect([...all].sort((a, b) => a - b)).toEqual(blocks.map((_, i) => i))
    expect(s.body).toEqual([...s.body].sort((a, b) => a - b))
  }
})
it('names the first heading the claim and the paragraph right after it the lead', () => {
  expect(slotsOf([h, p, list])).toEqual({ claim: 0, lead: 1, aside: null, body: [2] })
  expect(slotsOf([h, list, p])).toEqual({ claim: 0, lead: null, aside: null, body: [1, 2] })
  expect(slotsOf([p, h, p])).toEqual({ claim: 1, lead: 2, aside: null, body: [0] })
  expect(slotsOf([p, list])).toEqual({ claim: null, lead: null, aside: null, body: [0, 1] })
})
it('sets a lone photo aside and leaves two photos in the body', () => {
  expect(slotsOf([h, img, p]).aside).toBe(1)
  expect(slotsOf([h, img, img])).toEqual({ claim: 0, lead: null, aside: null, body: [1, 2] })
})
it('gives the accent to one block at most', () => {
  expect(accentOwner([h, stat, p], 'statHero')).toBe(1)
  expect(accentOwner([h, group, group], 'comparison')).toBe(1)
  expect(accentOwner([h, group, group], 'comparisonTable')).toBe(1)
  expect(accentOwner([h, stat, stat], 'statGrid')).toBeNull()
  expect(accentOwner([h, list], 'iconGrid')).toBeNull()
})
```

- [ ] **Step 2:** Run `npx vitest run src/engine/composition.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3:** Implement both functions.
- [ ] **Step 4:** Run the test. Expected: PASS. Mutation-check: make `slotsOf` also push the lead index into `body`; the first test must fail; revert.
- [ ] **Step 5:** `git add src/engine/composition.ts src/engine/composition.test.ts && git commit -m "feat(engine): slide slots and the accent owner"`

### Task 3: Type and spacing tokens, muted contrast

**Files:**
- Modify: `src/lib/theme-tokens.ts` (new exports; `muted` values that fail)
- Modify: `src/index.css` (`:root` slide fallback block, lines 155 to 160)
- Test: `src/lib/theme-tokens.test.ts`

**Interfaces:**
- Produces, from `theme-tokens.ts`:

```ts
/** Steps that are ratios of the body size, resolved where they are used so an element's own size carries. */
export const SLIDE_SIZE = {
  eyebrow: 'calc(var(--slide-size-body) * 0.65)',
  lead: 'calc(var(--slide-size-body) * 1.2)',
  caption: 'calc(var(--slide-size-body) * 0.7)',
} as const
export const SLIDE_GAP = { tight: 'var(--slide-gap-tight)', group: 'var(--slide-gap-group)', section: 'var(--slide-gap-section)' } as const
```

- CSS, in the `:root` block: `--slide-gap-tight: 0.5rem; --slide-gap-group: 1.25rem; --slide-gap-section: 2.25rem;` and the fallback sizes changed to the default theme's: h1 `3.5rem`, h2 `2.5rem`, h3 `1.625rem`, body `1.25rem`, line height `1.55`.

- [ ] **Step 1: Write the failing tests** in the `built-in themes` describe:

```ts
it('keeps muted text at AA on every theme background', () => {
  for (const theme of BUILTIN_THEMES) {
    expect(contrastRatio(theme.colors.muted, theme.colors.background), theme.id).toBeGreaterThanOrEqual(4.5)
  }
})
it('derives eyebrow, lead and caption from the body size', () => {
  for (const value of Object.values(SLIDE_SIZE)) expect(value).toMatch(/^calc\(var\(--slide-size-body\) \* [\d.]+\)$/)
})
```

- [ ] **Step 2:** Run `npx vitest run src/lib/theme-tokens.test.ts`. Expected: the second fails (no export); the first fails for any theme under 4.5:1.
- [ ] **Step 3:** Add the exports and the CSS. For each failing theme, darken (light themes) or lighten (dark themes) `muted` in small steps until it reaches 4.5:1; change nothing else in the theme.
- [ ] **Step 4:** Run the file. Expected: PASS, including the existing AA and palette tests.
- [ ] **Step 5:** `git add src/lib/theme-tokens.ts src/lib/theme-tokens.test.ts src/index.css && git commit -m "feat(theme): eyebrow/lead/caption steps, gap scale, AA muted text"`

### Task 4: No fill behind a heading

**Files:**
- Modify: `src/components/layouts/BlockRenderer.tsx` (remove `Heading`'s `panel` prop and `BlockRenderer`/`BlockBody`'s `headingPanel`; claim line height `1.08` for `h1`/`h2`, `1.15` stays for `h3`)
- Modify: `FlowLayout.tsx`, `StandardLayout.tsx`, `TextFocusLayout.tsx`, `StandardSplitLayout.tsx`, `ImageFocusLayout.tsx`, `StatHeroLayout.tsx`, `QuoteLayout.tsx` (drop every `panel=` / `headingPanel=`), `HeroLayout.tsx` (expressive `h1` loses `rounded-slide-sm bg-slide-accent px-10 py-7 text-slide-accent-foreground`, gains `text-slide-foreground`)
- Modify: `src/components/layouts/StandardLayout.tsx` (structured variant loses `border-l-4 border-slide-accent pl-5`)
- Modify: `src/components/editor/LayoutWireframe.tsx` (remove the heading-panel drawing from every case that used it, and the left accent border of `standard`)
- Test: create `src/components/layouts/noHeadingFill.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { renderToStaticMarkup } from 'react-dom/server'
import { CPP_DECK, withStyle } from '@/engine/fixtures/cppDeck'
import { LayoutRenderer } from './LayoutRenderer'

it.each(['structured', 'expressive'] as const)('never fills behind a heading (%s)', (style) => {
  for (const [i, card] of withStyle(CPP_DECK, style).entries()) {
    const html = renderToStaticMarkup(<LayoutRenderer card={card} context={{ isFirstCard: i === 0 }} />)
    for (const tag of html.match(/<h[12][^>]*>/g) ?? []) expect(tag, `card ${i}`).not.toMatch(/bg-slide-accent/)
  }
})
```

- [ ] **Step 2:** Run it. Expected: FAIL on the expressive cards.
- [ ] **Step 3:** Make the edits above. `tsc` finds every remaining `panel`/`headingPanel` use once the props are gone.
- [ ] **Step 4:** Run `npx vitest run src/components/layouts src/components/editor`. Expected: PASS (`everyBlockRenders`, `LayoutPicker` tests included).
- [ ] **Step 5:** Commit the files above: `refactor(layouts): no accent panel behind headings`.

### Task 5: `SlideFrame`, and the body stops centring

**Files:**
- Create: `src/components/layouts/SlideFrame.tsx`
- Modify: `src/components/layouts/SlideBody.tsx` (the inner `<div>{children}</div>` becomes `<div className="flex flex-1 flex-col">{children}</div>`; update the doc comment: the layout fills the box, it is not centred in it)
- Modify: `src/components/layouts/BlockRenderer.tsx` (add `lead?: boolean` to `BlockRenderer`/`BlockBody`: a paragraph with it is drawn at `SLIDE_SIZE.lead`, line height 1.35, `text-slide-foreground/85`, no `max-w-prose`, with `data-lead` on the `<p>`)
- Modify: `HeroLayout.tsx`, `QuoteLayout.tsx`, `StatHeroLayout.tsx`, and the blank-card `<div>` in `LayoutRenderer.tsx`: add `my-auto` to the root they return when there is no background photo (a `PhotoStage` root is left alone)
- Modify: `FlowLayout.tsx`, `StandardLayout.tsx`, `TextFocusLayout.tsx` to render through `SlideFrame`
- Modify: `LayoutWireframe.tsx` (heading bar at the top-left of the 160×90 box, a slightly taller lead bar under it, the arrangement starting lower)
- Test: create `src/components/layouts/SlideFrame.test.tsx`

**Interfaces:**
- Consumes: `slotsOf` (Task 2), `SLIDE_GAP` (Task 3).
- Produces:

```tsx
export function SlideFrame(props: {
  blocks: ContentBlock[]
  variant: VisualStyle
  /** Draws the body zone. Receives the body indices from `slotsOf`, ascending. */
  children: (body: number[]) => ReactNode
  /** The lone photo drawn beside the text column; absent = the photo index stays in `body`. */
  aside?: { node: ReactNode; side: 'left' | 'right'; width: 'half' | 'wide' }
}): ReactElement
```

Markup: root `flex flex-1 flex-col`. Head: `<div data-slot="head">` holding the claim through `Heading` (the block's own `size`) and the lead through `BlockRenderer lead`, gap `tight`, max width 80% (100% inside an aside column). Body: `<div data-slot="body" className="flex flex-1 flex-col">`, margin-top `section` when a head exists. With no claim there is no head element at all. When `aside` is absent, `slotsOf(...).aside` is merged back into the body indices in order, so the caller draws the photo where it sits. With `aside`: a two-column grid from `@min-[640px]` (`half` = `1fr 1fr`, `wide` = photo `3fr`, text `2fr`), the text column holding head and body, `<div data-slot="aside">` on `side`; stacked below 640px.

`FlowLayout`: `inferGroups(blocks, hint)` as today; pass no `aside`; inside `children`, draw the photo band first when `singlePhoto` exists, then every node whose index (a leaf's `index`, a group's first item index) is in `body`, skipping the photo leaf as today. Gap between nodes `group`.
`StandardLayout` and `TextFocusLayout`: body blocks through `BlockRenderer` in order, gap `group`; `TextFocusLayout` wraps the body in `max-w-prose`. Both variants share the markup now. Neither needs `Leftovers` (slots are total); keep the rule in mind for the frames that still pick by type.

- [ ] **Step 1: Write the failing tests**

```tsx
const html = (card: Card, first = false) => renderToStaticMarkup(<LayoutRenderer card={card} context={{ isFirstCard: first }} />)

it('draws the claim, then the lead, then the body, in the frame', () => {
  const out = html(CPP_DECK[1]) // heading, paragraph, list
  const head = out.indexOf('data-slot="head"'), lead = out.indexOf('data-lead'), body = out.indexOf('data-slot="body"')
  expect(head).toBeGreaterThan(-1)
  expect(lead).toBeGreaterThan(head)
  expect(body).toBeGreaterThan(lead)
})
it('has no head zone for a card without a heading, and still draws everything once', () => {
  const card = { ...CPP_DECK[1], blocks: [{ type: 'paragraph', text: 'Only words' }, { type: 'bulletList', items: ['alpha', 'beta'] }] } as Card
  const out = html(card)
  expect(out).not.toContain('data-slot="head"')
  for (const word of ['Only words', 'alpha', 'beta']) expect(out.split(word).length - 1).toBe(1)
})
it('keeps a heading that is not first as the claim and the earlier block in the body', () => {
  const card = { ...CPP_DECK[1], blocks: [{ type: 'paragraph', text: 'Before' }, { type: 'heading', text: 'Claim' }] } as Card
  const out = html(card)
  expect(out.indexOf('Claim')).toBeLessThan(out.indexOf('Before'))
})
it('makes the lead paragraph the element Adjustable holds', () => {
  expect(html(CPP_DECK[1])).toMatch(/<p[^>]*data-lead/)
})
```

- [ ] **Step 2:** Run it. Expected: FAIL, no `data-slot`.
- [ ] **Step 3:** Implement `SlideFrame`, the `lead` paragraph, the `SlideBody` change, the `my-auto` roots, and move the three layouts onto the frame. Do not put `min-h-0` or a fixed height on the frame root (a tall slide must grow).
- [ ] **Step 4:** Run `npx vitest run src/components`. Expected: PASS, including `everyBlockRenders`, `BackgroundPhoto`, `slideWidthOnly`, `noHeadingFill`.
- [ ] **Step 5:** Commit: `feat(layouts): SlideFrame with claim, lead and body zones`.

### Task 6: Photo layouts on the frame, hero on the left edge

**Files:**
- Modify: `src/components/layouts/StandardSplitLayout.tsx`, `ImageFocusLayout.tsx`, `HeroLayout.tsx`
- Modify: `LayoutWireframe.tsx` (`standardSplit`, `imageFocus`, `hero` cases)
- Test: extend `SlideFrame.test.tsx`

**Interfaces:**
- Consumes: `SlideFrame` with `aside` (Task 5).

`StandardSplitLayout`: `aside` = the first image through `BlockRenderer` with `photoClass="aspect-[4/3]"`, `side` = `position % 2 === 1 ? 'left' : 'right'` (unchanged rule), `width: 'half'`; body = every other body block in order. A second image stays in the body (drawn by `BlockRenderer`), so `Leftovers` is no longer needed here.
`ImageFocusLayout`: `aside` on the `'left'`, `width: 'wide'`, the expressive outline kept; body in order.
Both pass their own first image as the aside even when the card has two (today's behaviour), so compute the aside from `blocksOfTypeIndexed(blocks, 'image')[0]` and filter that index out of the body, not from `slotsOf().aside`.
`HeroLayout` structured, no photo: `items-start text-left` and `py-6` like the expressive variant; the accent rule above the title stays.

- [ ] **Step 1: Write the failing tests**

```tsx
it('puts the split photo in the aside, right on even positions and left on odd', () => {
  const even = html({ ...CPP_DECK[6], orderIndex: 6 }), odd = html({ ...CPP_DECK[6], orderIndex: 5 })
  expect(even.indexOf('data-slot="aside"')).toBeGreaterThan(even.indexOf('data-slot="head"'))
  expect(odd.indexOf('data-slot="aside"')).toBeLessThan(odd.indexOf('data-slot="head"'))
})
it('left-aligns the title slide in both treatments', () => {
  for (const style of ['structured', 'expressive'] as const) {
    const out = html(withStyle(CPP_DECK, style)[0], true)
    expect(out).toContain('text-left')
    expect(out).not.toContain('text-center')
  }
})
```

- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npx vitest run src/components`. Expected: PASS; the `everyBlockRenders` cases for photo sides and second images still pass.
- [ ] **Step 5:** Commit: `feat(layouts): split and image slides on the frame, left-aligned title`.

### Task 7: One accent-filled panel per slide

**Files:**
- Modify: `src/components/layouts/LayoutRenderer.tsx` (pass the resolved layout to `FlowLayout` as `layout`)
- Modify: `src/components/layouts/FlowLayout.tsx` (compute `accentOwner(blocks, layout)`, pass `accentIndex` to `GroupRenderer`)
- Modify: `src/components/layouts/GroupRenderer.tsx`, `StatHeroLayout.tsx`
- Modify: `LayoutWireframe.tsx` (`statGrid`, `statList`, `comparison`, `comparisonTable` expressive cases)
- Test: create `src/components/layouts/accentBudget.test.tsx`

**Interfaces:**
- Consumes: `accentOwner` (Task 2).
- Produces: `GroupRenderer` prop `accentIndex: number | null`; the one filled panel carries `data-accent-owner`.

Changes in `GroupRenderer`:
- `boxes` expressive: a stat is drawn on the accent panel only when `index === accentIndex`; the others use the structured top-rule cell with the figure `font-extrabold`.
- `columns` (both treatments) and `table` expressive header: `featured` = `group.index === accentIndex` (was `i === 0`), and the featured column carries `data-accent-owner` in both treatments; only the featured column's header is filled in `table`, the rest get the structured bottom rule.
- `statRows` expressive: the figure loses `bg-slide-accent ... text-slide-accent-foreground` and is `text-slide-accent font-extrabold`.
- The number discs in `timeline`, `chips`, `numbered`, `timelineRow`, `checklist` are untouched here; Phase 1b redraws them.
`StatHeroLayout`: its figure's panel (if any) carries `data-accent-owner`.

- [ ] **Step 1: Write the failing test**

```tsx
it.each(['structured', 'expressive'] as const)('marks at most one accent owner per slide (%s)', (style) => {
  for (const [i, card] of withStyle(CPP_DECK, style).entries()) {
    const out = renderToStaticMarkup(<LayoutRenderer card={card} context={{ isFirstCard: i === 0 }} />)
    expect(out.split('data-accent-owner').length - 1, `card ${i}`).toBeLessThanOrEqual(1)
  }
})
it('fills no stat in an expressive stat grid', () => {
  const out = renderToStaticMarkup(<LayoutRenderer card={withStyle(CPP_DECK, 'expressive')[2]} />)
  expect(out).not.toContain('data-accent-owner')
  expect(out).not.toMatch(/bg-slide-accent p-6/)
})
it('features only the first group of a comparison', () => {
  const out = renderToStaticMarkup(<LayoutRenderer card={CPP_DECK[4]} />)
  expect(out.split('data-accent-owner').length - 1).toBe(1)
})
```

- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npx vitest run src/components`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(layouts): one accent-filled panel per slide`.

### Task 8: By-hand check and docs

**Files:**
- Modify: `CLAUDE.md` (Content model & layout engine section)

- [ ] **Step 1:** `npm run test && npm run lint && npm run build`. Expected: all pass.
- [ ] **Step 2:** `npm run dev`, then check and note the result of each:
  - The C++ deck in the editor: claim top-left on every non-title slide; lead larger than body; no orange slab anywhere.
  - Outline thumbnails, dashboard cover, Present, presenter view (console and slide window): same arrangement as the editor.
  - A slide with more text than fits: the card grows past 16:9, nothing is clipped.
  - A hero and a quote with a background photo: the photo covers the slide, text is white and inside the frame.
  - Select the lead paragraph: drag, resize, change its size percentage, undo. Grid and ink origin unchanged.
  - A deck with nudged elements: opens, elements are selectable; note how far they moved.
  - Layout picker: each wireframe matches its slide.
  - Export PPTX and open it: opens, text fits. (The export still draws its own arrangements.)
- [ ] **Step 3:** Update `CLAUDE.md`: `engine/composition.ts` (`slotsOf` total and index-preserving, `accentOwner`), `SlideFrame` and which layouts use it, `SlideBody` no longer centres (self-centring frames use `my-auto`), heading panels removed, `SLIDE_SIZE` / `SLIDE_GAP` and the three-gap rule, the two new render tests, "frames must end with `Leftovers`" now applies only to `hero`, `statHero`, `quote`.
- [ ] **Step 4:** `git add CLAUDE.md && git commit -m "docs: slide composition rules in CLAUDE.md"`

## Not in this plan

Density compositions (`stack`, `sideHead`, `splitBody`; they extend `SlideFrame`, so keep its zones as separate elements), fill-the-zone, numerals, grounds, new layouts (Phase 1b); palette and new themes (Phase 1c); kicker, `point`, `callout`, `code`, `plan.shape` (Phase 2); PPTX arrangements matching the redraw.
