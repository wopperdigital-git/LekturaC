# Smart Layout Groups (Stages 1–3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cards whose layout is a "family" (stat grid, timeline, comparison, the two list layouts, gallery) render as a sequence of leaves and arrangement groups in the author's order, instead of one whole-card layout that reorders content to fit its shape.

**Architecture:** A pure `inferGroups(blocks, hint)` turns a card's flat blocks into render nodes — a leaf (one block) or a group (a run of same-type blocks plus an arrangement). It runs at render time and nothing is stored; every block keeps its original index, so text addressing, marks, nudges, the store, export and narration are untouched. A new `FlowLayout` draws the nodes; `GroupRenderer` draws each arrangement, ported one family at a time from the old component, which is then deleted.

**Tech Stack:** React 19, TypeScript ~6.0 (`strict`, `verbatimModuleSyntax`, `erasableSyntaxOnly`, `noUnusedLocals`, `noUnusedParameters`), Vitest 4 (`environment: 'node'`), `react-dom/server` for the one render test, Tailwind v4, oxlint.

**Spec:** `docs/superpowers/specs/2026-09-18-smart-layout-groups-design.md`

## Global Constraints

- **Nothing about how a card is stored or addressed changes.** Do not modify the `textRef` format, `parseTextRef`, `card.adjusts` keys, `cardRow`/`cardFromRow`, `src/store/`, `src/export/`, `src/ai/`, `src/engine/emphasis.ts` or `src/engine/cardTemplates.ts`.
- **The invariant:** `inferGroups` never reorders, drops or duplicates a block, and every block keeps its original index. `flattenNodes(inferGroups(b))` must equal `b.map((block, index) => ({ block, index }))`.
- **Every item is drawn under its original block index** — the `index` carried on its node, never a position within a group.
- **Frames are not touched:** `HeroLayout`, `StatHeroLayout`, `QuoteLayout`, `TextFocusLayout`, `StandardLayout`, `StandardSplitLayout`.
- **Runs are consecutive only**, minimum length `MIN_RUN = 2`. A bullet list is always a group of one.
- Type-only imports use `import type`. `noUnusedLocals` is on: an unused import is a **compile error**.
- **Check `npx tsc -b` by its EXIT CODE.** Its output is ANSI-coloured, so `grep "error TS"` silently misses real errors. Use `npx tsc -b; echo "EXIT=$?"` and require `EXIT=0`.
- `npm run lint` must stay at exactly **10** warnings, none in files you touch.
- `components/layouts/everyBlockRenders.test.tsx` is the **only** component test. Add no others.
- Commands: `npx vitest run <path>`, `npm run test`, `npx tsc -b`, `npm run lint`.

---

### Task 1: The guard — every block on a card reaches the screen

**Files:**
- Create: `src/components/layouts/everyBlockRenders.test.tsx`
- Modify: `CLAUDE.md` (the test-coverage paragraph)

**Interfaces:**
- Consumes: `LayoutRenderer` from `src/components/layouts/LayoutRenderer.tsx` (existing).
- Produces: the test file, which Tasks 3–7 extend with an "author's order" `describe` block. Later tasks rely on these names in it: `KITCHEN_SINK`, `VARIANTS`, `card(blocks, layout, visualStyle)`, `expectEveryBlockDrawn(html, blocks)`.

This is a regression guard for behaviour Stage 0 (`f970a98`) already fixed, so it passes on arrival. Its "red" step is a mutation check: break one layout and watch it fail.

- [ ] **Step 1: Write the test**

Create `src/components/layouts/everyBlockRenders.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Card, ContentBlock, LayoutType, VisualStyle } from '@/engine/contentBlocks'
import { LayoutRenderer } from './LayoutRenderer'

/**
 * The one component test in this repo, and a deliberate exception to its
 * "pure logic only" rule.
 *
 * The defect it guards against lives only in JSX: a layout that forgets to draw
 * something. Eleven of the twelve layouts once drew only the block types they
 * understood, so a paragraph on a timeline card was drawn nowhere — while the
 * PPTX export and the narration script both still carried it. No pure function
 * can see that, because the bug is in what a component's markup leaves out.
 *
 * So every layout, forced and automatic, in both visual treatments, renders a
 * card holding every block type, and every block's text must appear. A layout
 * that drops anything fails here by name.
 */

/** What a block puts on screen: its text fields, or an image's URL. */
function visibleText(block: ContentBlock): string[] {
  switch (block.type) {
    case 'heading':
    case 'paragraph':
      return [block.text]
    case 'bulletList':
      return block.items
    case 'stat':
      return [block.value, block.label]
    case 'image':
      return [block.url]
    case 'quote':
      return block.attribution ? [block.text, block.attribution] : [block.text]
    case 'timelineStep':
      return [block.label, block.text]
    case 'comparisonGroup':
      return [block.heading, ...block.items]
  }
}

/** One of every block type, with markers that cannot collide with markup. */
const KITCHEN_SINK: ContentBlock[] = [
  { type: 'heading', text: 'MARKHEADING' },
  { type: 'paragraph', text: 'MARKPARA' },
  { type: 'bulletList', items: ['MARKLISTA', 'MARKLISTB'] },
  { type: 'stat', value: 'MARKSTATVALA', label: 'MARKSTATLABA' },
  { type: 'stat', value: 'MARKSTATVALB', label: 'MARKSTATLABB' },
  { type: 'quote', text: 'MARKQUOTE', attribution: 'MARKATTRIB' },
  { type: 'timelineStep', label: 'MARKSTEPLABA', text: 'MARKSTEPTEXTA' },
  { type: 'timelineStep', label: 'MARKSTEPLABB', text: 'MARKSTEPTEXTB' },
  { type: 'comparisonGroup', heading: 'MARKCMPHA', items: ['MARKCMPIA'] },
  { type: 'comparisonGroup', heading: 'MARKCMPHB', items: ['MARKCMPIB'] },
  { type: 'image', url: 'https://example.test/MARKIMGA.png', alt: 'a' },
  { type: 'image', url: 'https://example.test/MARKIMGB.png', alt: 'b' },
]

/**
 * Cards shaped like what the model actually produces for each family, each
 * with one block the family does not own. `'auto'` lets the classifier route
 * them, which is the path nearly every real card takes.
 */
const REALISTIC: { name: string; blocks: ContentBlock[] }[] = [
  {
    name: 'a stat grid with a paragraph',
    blocks: [
      { type: 'heading', text: 'MARKH1' },
      { type: 'stat', value: 'MARKV1', label: 'MARKL1' },
      { type: 'stat', value: 'MARKV2', label: 'MARKL2' },
      { type: 'paragraph', text: 'MARKP1' },
    ],
  },
  {
    name: 'a timeline with a paragraph between steps',
    blocks: [
      { type: 'heading', text: 'MARKH2' },
      { type: 'timelineStep', label: 'MARKS1', text: 'MARKT1' },
      { type: 'paragraph', text: 'MARKP2' },
      { type: 'timelineStep', label: 'MARKS2', text: 'MARKT2' },
      { type: 'timelineStep', label: 'MARKS3', text: 'MARKT3' },
    ],
  },
  {
    name: 'a comparison with a stat',
    blocks: [
      { type: 'heading', text: 'MARKH3' },
      { type: 'comparisonGroup', heading: 'MARKC1', items: ['MARKCI1'] },
      { type: 'comparisonGroup', heading: 'MARKC2', items: ['MARKCI2'] },
      { type: 'stat', value: 'MARKV3', label: 'MARKL3' },
    ],
  },
  {
    name: 'a short list with a quote',
    blocks: [
      { type: 'heading', text: 'MARKH4' },
      { type: 'bulletList', items: ['MARKI1', 'MARKI2'] },
      { type: 'quote', text: 'MARKQ1' },
    ],
  },
  {
    name: 'a long list with a second list',
    blocks: [
      { type: 'heading', text: 'MARKH5' },
      {
        type: 'bulletList',
        items: ['MARKLONG1', 'MARKLONG2', 'MARKLONG3', 'MARKLONG4', 'MARKLONG5', 'MARKLONG6', 'MARKLONG7'],
      },
      { type: 'bulletList', items: ['MARKSECOND'] },
    ],
  },
  {
    name: 'a gallery of four images',
    blocks: [
      { type: 'heading', text: 'MARKH6' },
      { type: 'image', url: 'https://example.test/MARKG1.png' },
      { type: 'image', url: 'https://example.test/MARKG2.png' },
      { type: 'image', url: 'https://example.test/MARKG3.png' },
      { type: 'image', url: 'https://example.test/MARKG4.png' },
    ],
  },
]

const LAYOUTS: LayoutType[] = [
  'auto',
  'hero',
  'standard',
  'standardSplit',
  'statHero',
  'statGrid',
  'comparison',
  'timeline',
  'iconGrid',
  'numberedList',
  'quote',
  'textFocus',
  'gallery',
]

const VARIANTS: VisualStyle[] = ['structured', 'expressive']

function card(blocks: ContentBlock[], layout: LayoutType, visualStyle: VisualStyle): Card {
  return { id: 'card', orderIndex: 0, blocks, layout, visualStyle }
}

function expectEveryBlockDrawn(html: string, blocks: ContentBlock[]) {
  for (const block of blocks) {
    for (const text of visibleText(block)) {
      expect(html, `"${text}" (${block.type}) is missing from the rendered card`).toContain(text)
    }
  }
}

describe('every block on a card reaches the screen', () => {
  for (const layout of LAYOUTS) {
    for (const variant of VARIANTS) {
      it(`${layout} (${variant}) draws every block of a kitchen-sink card`, () => {
        const html = renderToStaticMarkup(<LayoutRenderer card={card(KITCHEN_SINK, layout, variant)} />)
        expectEveryBlockDrawn(html, KITCHEN_SINK)
      })
    }
  }

  for (const { name, blocks } of REALISTIC) {
    for (const variant of VARIANTS) {
      it(`${name} (${variant}, automatic layout)`, () => {
        const html = renderToStaticMarkup(<LayoutRenderer card={card(blocks, 'auto', variant)} />)
        expectEveryBlockDrawn(html, blocks)
      })
    }
  }

  it('draws a block exactly once rather than twice', () => {
    // Drawing everything is half the promise; the other half is not drawing a
    // block in two places, which a layout that renders its own content AND
    // lists it as a leftover would do.
    for (const variant of VARIANTS) {
      const html = renderToStaticMarkup(<LayoutRenderer card={card(KITCHEN_SINK, 'auto', variant)} />)
      expect(html.split('MARKPARA').length - 1).toBe(1)
      expect(html.split('MARKSTATVALA').length - 1).toBe(1)
    }
  })
})
```

- [ ] **Step 2: Run it — expect PASS**

Run: `npx vitest run src/components/layouts/everyBlockRenders.test.tsx`
Expected: `Tests  39 passed (39)` — 13 layouts × 2 variants, 6 realistic cards × 2 variants, and the draws-once test.

- [ ] **Step 3: Prove it bites (mutation check)**

Remove one layout's leftovers, confirm the guard fails by name, then restore:

```bash
python - <<'PY'
import io
p = 'src/components/layouts/TimelineLayout.tsx'
s = io.open(p, encoding='utf-8').read()
s = s.replace('<Leftovers blocks={blocks} consumed={consumed} />', '')
io.open(p, 'w', encoding='utf-8', newline='').write(s)
PY
npx vitest run src/components/layouts/everyBlockRenders.test.tsx
git checkout -- src/components/layouts/TimelineLayout.tsx
```

Expected while broken: 4 failures, each reading `"MARKPARA" (paragraph) is missing from the rendered card` or `"MARKP2" …`. After `git checkout`, confirm `git status --short` does not list `TimelineLayout.tsx`.

- [ ] **Step 4: Record the exception in CLAUDE.md**

```bash
python - <<'PY'
import io
p = 'CLAUDE.md'
s = io.open(p, encoding='utf-8').read()
old = 'No component/integration tests.'
assert s.count(old) == 1, 'anchor not found exactly once'
new = (
    'The one component test is `components/layouts/everyBlockRenders.test.tsx`, a deliberate '
    'exception: it server-renders every layout — forced and automatic, in both visual treatments — '
    'against a card holding every block type and asserts every block\'s text reaches the markup, '
    'exactly once. The defect it guards lives only in JSX (a layout that forgets to draw something), '
    'where no pure test can see it; 11 of 12 layouts once dropped blocks that the PPTX export and '
    'narration still carried. No other component or integration tests.'
)
s = s.replace(old, new)
io.open(p, 'w', encoding='utf-8', newline='').write(s)
PY
```

- [ ] **Step 5: Verify and commit**

Run: `npm run test` — all pass. `npx tsc -b; echo "EXIT=$?"` — `EXIT=0`. `npm run lint` — 10 warnings.

```bash
git add src/components/layouts/everyBlockRenders.test.tsx CLAUDE.md
git commit -m "Guard: every block on a card reaches the screen

A server-render test over every layout, forced and automatic, in both
visual treatments, against a card holding every block type. The one
component test in the repo, because the defect it guards -- a layout
that forgets to draw something -- lives only in JSX.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: `inferGroups` — the pure grouping engine

**Files:**
- Create: `src/engine/groups.ts`
- Create: `src/engine/groups.test.ts`
- Modify: `src/engine/layoutEngine.ts:3` (export the thresholds) and `:68` (use the new constant)
- Modify: `CLAUDE.md` (test-coverage paragraph)

**Interfaces:**
- Consumes: `ContentBlock`, `BulletListBlock`, `ComparisonGroupBlock`, `ImageBlock`, `LayoutType`, `StatBlock`, `TimelineStepBlock` from `./contentBlocks`; `chooseLayout` from `./layoutEngine` (tests only).
- Produces (exports of `src/engine/groups.ts`, used by Tasks 3–8):
  - `interface Indexed<T extends ContentBlock = ContentBlock> { block: T; index: number }`
  - `interface LeafNode { kind: 'leaf'; block: ContentBlock; index: number }`
  - `type GroupNode` — union discriminated on `arrangement`: `'boxes'` (`Indexed<StatBlock>[]`), `'timeline'` (`Indexed<TimelineStepBlock>[]`), `'columns'` (`Indexed<ComparisonGroupBlock>[]`), `'gallery'` (`Indexed<ImageBlock>[]`), `'chips' | 'numbered'` (`[Indexed<BulletListBlock>]`)
  - `type RenderNode = LeafNode | GroupNode`, `type Arrangement = GroupNode['arrangement']`
  - `const MIN_RUN = 2`
  - `function listArrangement(list: BulletListBlock, hint: LayoutType): 'chips' | 'numbered'`
  - `function inferGroups(blocks: ContentBlock[], hint?: LayoutType): RenderNode[]`
  - `function flattenNodes(nodes: RenderNode[]): Indexed[]`
  - `function nodeKey(node: RenderNode): number`
- Also produces, in `src/engine/layoutEngine.ts`: `export const SHORT_ITEM_MAX_CHARS = 40` and `export const MAX_CHIP_ITEMS = 6`.

- [ ] **Step 1: Export the classifier's list thresholds**

`inferGroups` must decide chips-vs-numbered by exactly the rule the classifier uses to award `iconGrid`, so the two share constants rather than a coincidentally equal number.

```bash
python - <<'PY'
import io
p = 'src/engine/layoutEngine.ts'
s = io.open(p, encoding='utf-8').read()
a = 'const SHORT_ITEM_MAX_CHARS = 40\n'
assert s.count(a) == 1
s = s.replace(a, 'export const SHORT_ITEM_MAX_CHARS = 40\n\n/** The most items a bullet list can hold and still be drawn as chips. */\nexport const MAX_CHIP_ITEMS = 6\n', 1)
b = 'bulletLists[0].items.length <= 6 &&'
assert s.count(b) == 1
s = s.replace(b, 'bulletLists[0].items.length <= MAX_CHIP_ITEMS &&', 1)
io.open(p, 'w', encoding='utf-8', newline='').write(s)
PY
```

Run: `npx vitest run src/engine/layoutEngine.test.ts` — expected: all pass (no behaviour change).

- [ ] **Step 2: Write the failing tests**

Create `src/engine/groups.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { BulletListBlock, ContentBlock, LayoutType } from './contentBlocks'
import { chooseLayout, MAX_CHIP_ITEMS, SHORT_ITEM_MAX_CHARS } from './layoutEngine'
import { flattenNodes, inferGroups, listArrangement, MIN_RUN, nodeKey, type RenderNode } from './groups'

const heading: ContentBlock = { type: 'heading', text: 'h' }
const para: ContentBlock = { type: 'paragraph', text: 'p' }
const quote: ContentBlock = { type: 'quote', text: 'q' }
const stat: ContentBlock = { type: 'stat', value: '1', label: 'l' }
const step: ContentBlock = { type: 'timelineStep', label: 'l', text: 't' }
const side: ContentBlock = { type: 'comparisonGroup', heading: 'c', items: ['i'] }
const image: ContentBlock = { type: 'image', url: 'https://example.test/i.png' }
const shortList: BulletListBlock = { type: 'bulletList', items: ['a', 'b'] }

/** The hints that change behaviour; every other layout behaves as `'auto'`. */
const HINTS: LayoutType[] = ['auto', 'iconGrid', 'numberedList']

/** Every sequence of up to `maxLength` blocks drawn from `alphabet`. */
function allSequences(alphabet: ContentBlock[], maxLength: number): ContentBlock[][] {
  const out: ContentBlock[][] = [[]]
  let frontier: ContentBlock[][] = [[]]
  for (let length = 1; length <= maxLength; length++) {
    frontier = frontier.flatMap((seq) => alphabet.map((block) => [...seq, block]))
    out.push(...frontier)
  }
  return out
}

/** A compact picture of the nodes: a leaf's block type, or a group's arrangement and size. */
function shape(nodes: RenderNode[]): string[] {
  return nodes.map((node) => (node.kind === 'leaf' ? node.block.type : `${node.arrangement}×${node.items.length}`))
}

function list(items: string[]): BulletListBlock {
  return { type: 'bulletList', items }
}

function repeat(value: string, count: number): string[] {
  return Array.from({ length: count }, () => value)
}

describe('the invariant', () => {
  const sequences = allSequences([heading, para, quote, stat, step, side, image, shortList], 4)

  it('never reorders, drops or duplicates a block, and keeps every index', () => {
    // Exhaustive over every card of up to four blocks drawn from every type —
    // 4,681 cards per hint. This is the property the whole design rests on: a
    // block's index is its address everywhere else in the app (textRef,
    // card.adjusts, data-block-index, selectedBlockIndex), so grouping must
    // change how a card looks and nothing else.
    for (const hint of HINTS) {
      for (const blocks of sequences) {
        expect(flattenNodes(inferGroups(blocks, hint))).toEqual(blocks.map((block, index) => ({ block, index })))
      }
    }
  })

  it('gives every node a key no other node on the card shares', () => {
    for (const blocks of sequences) {
      const keys = inferGroups(blocks).map(nodeKey)
      expect(new Set(keys).size).toBe(keys.length)
    }
  })
})

describe('runs', () => {
  it('groups two or more consecutive stats as boxes', () => {
    expect(shape(inferGroups([heading, stat, stat, stat]))).toEqual(['heading', 'boxes×3'])
  })

  it('leaves a lone stat as a leaf', () => {
    expect(shape(inferGroups([heading, stat, para]))).toEqual(['heading', 'stat', 'paragraph'])
  })

  it('never pulls non-adjacent blocks together', () => {
    // The old family layouts gathered every stat into one grid and pushed the
    // paragraph to the end. Keeping the author's order is what lets every
    // index stay put.
    expect(shape(inferGroups([heading, stat, para, stat, stat]))).toEqual([
      'heading',
      'stat',
      'paragraph',
      'boxes×2',
    ])
  })

  it('arranges each run type as its own family', () => {
    expect(shape(inferGroups([step, step]))).toEqual(['timeline×2'])
    expect(shape(inferGroups([side, side, side]))).toEqual(['columns×3'])
    expect(shape(inferGroups([image, image]))).toEqual(['gallery×2'])
  })

  it('keeps a run shorter than MIN_RUN as leaves, for every run type', () => {
    expect(MIN_RUN).toBe(2)
    for (const block of [stat, step, side, image]) {
      expect(shape(inferGroups([block]))).toEqual([block.type])
    }
  })

  it('splits a run where the type changes', () => {
    expect(shape(inferGroups([stat, stat, step, step]))).toEqual(['boxes×2', 'timeline×2'])
  })

  it('never groups headings, paragraphs or quotes', () => {
    expect(shape(inferGroups([heading, heading, para, para, quote, quote]))).toEqual([
      'heading',
      'heading',
      'paragraph',
      'paragraph',
      'quote',
      'quote',
    ])
  })

  it('gives each bullet list its own group, even when two lists sit together', () => {
    // A list's arrangement applies to the items INSIDE that list, so two lists
    // are two groups, never one group of two lists.
    expect(shape(inferGroups([shortList, shortList]))).toEqual(['chips×1', 'chips×1'])
  })

  it('returns nothing for an empty card', () => {
    expect(inferGroups([])).toEqual([])
  })
})

describe('listArrangement', () => {
  const exactlyMaxChars = 'x'.repeat(SHORT_ITEM_MAX_CHARS)

  it('arranges a short list as chips', () => {
    expect(listArrangement(list(['a', 'b']), 'auto')).toBe('chips')
  })

  it('still calls it chips at the boundary', () => {
    expect(listArrangement(list(repeat(exactlyMaxChars, MAX_CHIP_ITEMS)), 'auto')).toBe('chips')
  })

  it('numbers a list with one item too many', () => {
    expect(listArrangement(list(repeat('a', MAX_CHIP_ITEMS + 1)), 'auto')).toBe('numbered')
  })

  it('numbers a list with one item one character too long', () => {
    expect(listArrangement(list(['a', `${exactlyMaxChars}x`]), 'auto')).toBe('numbered')
  })

  it('follows an explicit picker choice over the content', () => {
    // What keeps the Level 2 picker working: "Numbered list" on three short
    // items must give numbers, and "Icon grid" on a long list must give chips.
    expect(listArrangement(list(repeat('a', MAX_CHIP_ITEMS + 1)), 'iconGrid')).toBe('chips')
    expect(listArrangement(list(['a']), 'numberedList')).toBe('numbered')
  })

  it('ignores a hint that says nothing about lists', () => {
    expect(listArrangement(list(['a']), 'statGrid')).toBe('chips')
  })

  it('agrees with the classifier about which lists are chips', () => {
    // The two used to share a magic number by coincidence; now they share the
    // constants. For a card that is just a heading and a list, the classifier
    // awards iconGrid exactly when inferGroups arranges the list as chips.
    const cases = [
      ['a', 'b'],
      repeat(exactlyMaxChars, MAX_CHIP_ITEMS),
      repeat('a', MAX_CHIP_ITEMS + 1),
      ['a', `${exactlyMaxChars}x`],
    ]
    for (const items of cases) {
      const l = list(items)
      expect(chooseLayout([heading, l]) === 'iconGrid').toBe(listArrangement(l, 'auto') === 'chips')
    }
  })
})

describe('nodeKey', () => {
  it("is the node's first block index", () => {
    expect(inferGroups([heading, stat, stat, para]).map(nodeKey)).toEqual([0, 1, 3])
  })
})
```

- [ ] **Step 3: Run it — expect FAIL**

Run: `npx vitest run src/engine/groups.test.ts`
Expected: FAIL — `Failed to resolve import "./groups"`.

- [ ] **Step 4: Implement**

Create `src/engine/groups.ts`:

```ts
import type {
  BulletListBlock,
  ComparisonGroupBlock,
  ContentBlock,
  ImageBlock,
  LayoutType,
  StatBlock,
  TimelineStepBlock,
} from './contentBlocks'
import { MAX_CHIP_ITEMS, SHORT_ITEM_MAX_CHARS } from './layoutEngine'

/**
 * Gamma-style arrangement per run of items, derived at render time.
 *
 * A card's layout used to be chosen for the whole card, so any block outside
 * the winning layout's vocabulary had nowhere to go. Here a card is read as a
 * sequence of render nodes instead: a *leaf* is one block drawn on its own, a
 * *group* is a run of same-type blocks drawn in one arrangement. One card can
 * then hold a timeline and a stat row and a paragraph, each in its place.
 *
 * Nothing here is stored. That is safe only because of one invariant, which
 * `groups.test.ts` pins exhaustively:
 *
 *   inferGroups never reorders, drops or duplicates a block, and every block
 *   keeps its ORIGINAL index.
 *
 * The index is the block's address everywhere else in the app — its `textRef`
 * (`"4:value"`), its `card.adjusts` key, its `data-block-index` attribute, the
 * editor's `selectedBlockIndex`. Keeping it means grouping changes how a card
 * looks and nothing about how it is stored, edited, nudged, exported or
 * narrated. Design: docs/superpowers/specs/2026-09-18-smart-layout-groups-design.md
 */

/** A block together with its index in `card.blocks`. */
export interface Indexed<T extends ContentBlock = ContentBlock> {
  block: T
  index: number
}

/** One block drawn on its own. */
export interface LeafNode {
  kind: 'leaf'
  block: ContentBlock
  index: number
}

/**
 * A run of blocks drawn in one arrangement. Each arrangement belongs to exactly
 * one block type, so `GroupRenderer`'s switch narrows `items` to that type with
 * no casts. A bullet list is a group of ONE block: its arrangement applies to
 * the items inside that list, not to a run of lists.
 */
export type GroupNode =
  | { kind: 'group'; arrangement: 'boxes'; items: Indexed<StatBlock>[] }
  | { kind: 'group'; arrangement: 'timeline'; items: Indexed<TimelineStepBlock>[] }
  | { kind: 'group'; arrangement: 'columns'; items: Indexed<ComparisonGroupBlock>[] }
  | { kind: 'group'; arrangement: 'gallery'; items: Indexed<ImageBlock>[] }
  | { kind: 'group'; arrangement: 'chips' | 'numbered'; items: [Indexed<BulletListBlock>] }

export type RenderNode = LeafNode | GroupNode

export type Arrangement = GroupNode['arrangement']

/**
 * A run shorter than this stays as leaves: a one-step timeline is not a
 * timeline, a lone stat is not a grid. It matches the classifier, which needs
 * two of each before it will award `statGrid`, `timeline`, `comparison` or
 * `gallery`.
 */
export const MIN_RUN = 2

/** Block types whose consecutive runs become groups. */
const RUN_TYPES: ReadonlySet<ContentBlock['type']> = new Set([
  'stat',
  'timelineStep',
  'comparisonGroup',
  'image',
])

/**
 * How a bullet list is arranged.
 *
 * An explicit layout wins, which is what keeps the Level 2 picker working: a
 * user who chose "Numbered list" for a card of three short items gets numbers,
 * not chips. Otherwise it is the classifier's own `iconGrid` rule, read from the
 * same exported constants so the two cannot drift apart.
 */
export function listArrangement(list: BulletListBlock, hint: LayoutType): 'chips' | 'numbered' {
  if (hint === 'iconGrid') return 'chips'
  if (hint === 'numberedList') return 'numbered'
  const short =
    list.items.length <= MAX_CHIP_ITEMS && list.items.every((item) => item.length <= SHORT_ITEM_MAX_CHARS)
  return short ? 'chips' : 'numbered'
}

/*
  Turns a run into its group, or null when the run is too short.

  The casts are sound rather than convenient: every block in `run` shares
  `run[0].block.type`, because `inferGroups` only ever extends a run while the
  type matches. TypeScript cannot follow that across the loop, so it is
  asserted here, once, next to the switch that proves which type it is.
*/
function runGroup(run: Indexed[]): GroupNode | null {
  if (run.length < MIN_RUN) return null
  switch (run[0].block.type) {
    case 'stat':
      return { kind: 'group', arrangement: 'boxes', items: run as Indexed<StatBlock>[] }
    case 'timelineStep':
      return { kind: 'group', arrangement: 'timeline', items: run as Indexed<TimelineStepBlock>[] }
    case 'comparisonGroup':
      return { kind: 'group', arrangement: 'columns', items: run as Indexed<ComparisonGroupBlock>[] }
    case 'image':
      return { kind: 'group', arrangement: 'gallery', items: run as Indexed<ImageBlock>[] }
    default:
      return null
  }
}

/**
 * A card's blocks as render nodes, in their original order.
 *
 * Runs are **consecutive only**. Two stats separated by a paragraph are two
 * leaves and a paragraph, in that order — never a grid with the paragraph moved
 * to the end. The old whole-card layouts reordered content to fit their shape;
 * keeping the author's order is what lets every index stay put.
 *
 * `hint` is the card's stored `layout` (usually `'auto'`), passed so an
 * explicit picker choice still governs a bullet list's arrangement.
 */
export function inferGroups(blocks: ContentBlock[], hint: LayoutType = 'auto'): RenderNode[] {
  const nodes: RenderNode[] = []
  let i = 0
  while (i < blocks.length) {
    const block = blocks[i]

    if (block.type === 'bulletList') {
      nodes.push({
        kind: 'group',
        arrangement: listArrangement(block, hint),
        items: [{ block, index: i }],
      })
      i += 1
      continue
    }

    if (RUN_TYPES.has(block.type)) {
      let end = i + 1
      while (end < blocks.length && blocks[end].type === block.type) end += 1
      const run = blocks.slice(i, end).map((item, offset) => ({ block: item, index: i + offset }))
      const group = runGroup(run)
      if (group) nodes.push(group)
      else for (const item of run) nodes.push({ kind: 'leaf', block: item.block, index: item.index })
      i = end
      continue
    }

    nodes.push({ kind: 'leaf', block, index: i })
    i += 1
  }
  return nodes
}

/**
 * Every block the nodes hold, in order, with its index. The inverse of
 * `inferGroups` — `flattenNodes(inferGroups(b))` is `b` indexed — which is the
 * invariant the tests pin. Also how `GroupRenderer` draws an arrangement it
 * does not implement yet: as the plain blocks it is made of.
 */
export function flattenNodes(nodes: RenderNode[]): Indexed[] {
  return nodes.flatMap((node): Indexed[] =>
    node.kind === 'leaf' ? [{ block: node.block, index: node.index }] : [...node.items],
  )
}

/**
 * A stable React key for a node: its first block's index. Unique within a card
 * because no block belongs to two nodes, and stable because a block's index is
 * fixed for the card's whole life.
 */
export function nodeKey(node: RenderNode): number {
  return node.kind === 'leaf' ? node.index : node.items[0].index
}
```

- [ ] **Step 5: Run it — expect PASS**

Run: `npx vitest run src/engine/groups.test.ts src/engine/layoutEngine.test.ts`
Expected: all pass.

- [ ] **Step 6: Record the test in CLAUDE.md**

```bash
python - <<'PY'
import io
p = 'CLAUDE.md'
s = io.open(p, encoding='utf-8').read()
anchor = 'the pure guard on layouts silently dropping blocks),'
assert s.count(anchor) == 1, 'anchor not found exactly once'
add = (
    anchor + ' `engine/groups.test.ts` (the grouping invariant — exhaustively over every card of '
    'up to four blocks, `inferGroups` never reorders, drops or duplicates a block and every block keeps '
    'its index, since that index is its `textRef` and `adjusts` key everywhere else — plus the run '
    'thresholds, and that a list\'s arrangement agrees with the classifier\'s `iconGrid` rule),'
)
s = s.replace(anchor, add)
io.open(p, 'w', encoding='utf-8', newline='').write(s)
PY
```

- [ ] **Step 7: Verify and commit**

Run: `npm run test` — all pass. `npx tsc -b; echo "EXIT=$?"` — `EXIT=0`. `npm run lint` — 10 warnings.

```bash
git add src/engine/groups.ts src/engine/groups.test.ts src/engine/layoutEngine.ts CLAUDE.md
git commit -m "inferGroups: a card's blocks as leaves and arrangement groups

Pure and derived at render time. It never reorders, drops or duplicates a
block and every block keeps its original index -- checked exhaustively
over every card of up to four blocks -- so grouping changes how a card
looks and nothing about how it is stored or addressed.

The classifier's list thresholds are exported so chips-vs-numbered is
decided by the same rule that awards iconGrid.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: `FlowLayout`, `GroupRenderer`, and the stat grid family

**Files:**
- Create: `src/components/layouts/FlowLayout.tsx`
- Create: `src/components/layouts/GroupRenderer.tsx`
- Modify: `src/components/layouts/LayoutRenderer.tsx` (whole file)
- Delete: `src/components/layouts/StatGridLayout.tsx`
- Test: `src/components/layouts/everyBlockRenders.test.tsx` (add an order test)

**Interfaces:**
- Consumes: `inferGroups`, `nodeKey`, `flattenNodes`, `GroupNode` from `@/engine/groups` (Task 2); `BlockRenderer`, `StatBlockView` from `./BlockRenderer`; `KITCHEN_SINK`, `VARIANTS`, `card`, `expectEveryBlockDrawn` in the test file (Task 1).
- Produces:
  - `FlowLayout({ blocks, variant, hint }: { blocks: ContentBlock[]; variant: VisualStyle; hint: LayoutType })`
  - `GroupRenderer({ node, variant }: { node: GroupNode; variant: VisualStyle })` — implements `'boxes'`; every other arrangement falls through to a `default` that draws its items as plain blocks
  - In `LayoutRenderer.tsx`: `const FLOW_LAYOUTS = ['statGrid'] as const` and `LAYOUT_COMPONENTS` typed `Record<Exclude<LayoutType, 'auto' | FlowLayoutName>, …>`. Tasks 4–7 each add names to `FLOW_LAYOUTS` and remove the matching entries.
  - In the test file: `function expectInOrder(html: string, markers: string[])` and a `describe("a family card keeps the author's order", …)` block that Tasks 4–7 add `it`s to.

- [ ] **Step 1: Write the failing order test**

Append to `src/components/layouts/everyBlockRenders.test.tsx`:

```tsx
/** Asserts the markers appear in the markup in exactly this order. */
function expectInOrder(html: string, markers: string[]) {
  const positions = markers.map((marker) => html.indexOf(marker))
  markers.forEach((marker, i) => {
    expect(positions[i], `"${marker}" is missing from the rendered card`).toBeGreaterThanOrEqual(0)
  })
  expect(positions, `drawn out of order: expected ${markers.join(' → ')}`).toEqual(
    [...positions].sort((a, b) => a - b),
  )
}

describe("a family card keeps the author's order", () => {
  // The old family layouts gathered every block of their type together and
  // pushed anything else to the end. A family card now draws its blocks where
  // they sit, and each test below FAILS against the old component for its
  // family — which is how a port proves it actually took effect.

  it('stat grid: a paragraph between stats stays between them', () => {
    const blocks: ContentBlock[] = [
      { type: 'heading', text: 'ORDSTATH' },
      { type: 'stat', value: 'ORDSTATV1', label: 'ORDSTATL1' },
      { type: 'paragraph', text: 'ORDSTATP' },
      { type: 'stat', value: 'ORDSTATV2', label: 'ORDSTATL2' },
      { type: 'stat', value: 'ORDSTATV3', label: 'ORDSTATL3' },
    ]
    for (const variant of VARIANTS) {
      const html = renderToStaticMarkup(<LayoutRenderer card={card(blocks, 'auto', variant)} />)
      expectInOrder(html, ['ORDSTATH', 'ORDSTATV1', 'ORDSTATP', 'ORDSTATV2', 'ORDSTATV3'])
    }
  })
})
```

The classifier routes this card to `statGrid` (three stats, no comparison groups or timeline steps).

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx vitest run src/components/layouts/everyBlockRenders.test.tsx`
Expected: the new test FAILS with `drawn out of order` — `StatGridLayout` draws all three stats in one grid and the paragraph after them. The other 39 still pass.

- [ ] **Step 3: Create `GroupRenderer`**

Create `src/components/layouts/GroupRenderer.tsx`:

```tsx
import type { VisualStyle } from '@/engine/contentBlocks'
import { flattenNodes, type GroupNode } from '@/engine/groups'
import { textRef } from '@/engine/marks'
import { BlockRenderer, StatBlockView } from './BlockRenderer'

/**
 * Draws one group of blocks in its arrangement.
 *
 * Every item is drawn under its ORIGINAL block index, the same one it has in
 * `card.blocks` — that is its `textRef` and its `card.adjusts` key, so
 * formatting, nudges and text editing keep working unchanged.
 *
 * Each arrangement is the item-drawing half of the whole-card layout it
 * replaces, moved here as-is so a card looks the same after the move. The
 * heading those layouts drew above their items is now a leaf of its own.
 */
export function GroupRenderer({ node, variant }: { node: GroupNode; variant: VisualStyle }) {
  const expressive = variant === 'expressive'

  switch (node.arrangement) {
    case 'boxes':
      // From StatGridLayout: equal cells, a surface box when expressive and a
      // top accent rule when structured.
      return (
        <div
          className="grid gap-6"
          style={{ gridTemplateColumns: `repeat(${node.items.length}, minmax(0, 1fr))` }}
        >
          {node.items.map(({ block, index }) => (
            <div
              key={index}
              className={expressive ? 'rounded-slide-sm bg-slide-surface p-5' : 'border-t-2 border-slide-accent pt-4'}
            >
              <StatBlockView
                value={block.value}
                label={block.label}
                valueRef={textRef(index, 'value')}
                labelRef={textRef(index, 'label')}
              />
            </div>
          ))}
        </div>
      )

    default:
      // An arrangement not ported yet draws its items as plain blocks — exactly
      // how Stage 0's leftovers drew them — so a card holding one looks no worse
      // than it did before. The final task of this work removes this fallback.
      return (
        <>
          {flattenNodes([node]).map(({ block, index }) => (
            <BlockRenderer key={index} block={block} index={index} />
          ))}
        </>
      )
  }
}
```

- [ ] **Step 4: Create `FlowLayout`**

Create `src/components/layouts/FlowLayout.tsx`:

```tsx
import type { ContentBlock, LayoutType, VisualStyle } from '@/engine/contentBlocks'
import { inferGroups, nodeKey } from '@/engine/groups'
import { BlockRenderer } from './BlockRenderer'
import { GroupRenderer } from './GroupRenderer'

/**
 * A card drawn as a sequence of leaves and groups, in the author's order.
 *
 * This is what a "family" layout (stat grid, timeline, comparison, the two list
 * layouts, gallery) renders as now. Each of those used to draw only the block
 * types it understood and push everything else to the bottom; here every block
 * is drawn where it sits, and a run of same-type blocks gets the arrangement
 * that family used to give the whole card. Nothing can be dropped, because
 * `inferGroups` accounts for every block and this draws every node it returns.
 *
 * `hint` is the card's stored `layout`, forwarded so an explicit choice from the
 * Level 2 picker still decides how a bullet list is arranged.
 */
export function FlowLayout({
  blocks,
  variant,
  hint,
}: {
  blocks: ContentBlock[]
  variant: VisualStyle
  hint: LayoutType
}) {
  return (
    <div className="flex flex-col gap-6">
      {inferGroups(blocks, hint).map((node) =>
        node.kind === 'leaf' ? (
          <BlockRenderer key={nodeKey(node)} block={node.block} index={node.index} />
        ) : (
          <GroupRenderer key={nodeKey(node)} node={node} variant={variant} />
        ),
      )}
    </div>
  )
}
```

The outer `gap-6` is the gap five of the six families already used; `StatGridLayout` used `gap-8`, so a stat-grid card's heading now sits slightly closer to its grid. Accepted.

- [ ] **Step 5: Route the stat grid through `FlowLayout`**

Replace `src/components/layouts/LayoutRenderer.tsx` entirely:

```tsx
import type { ComponentType } from 'react'
import { resolveLayout, type LayoutContext } from '@/engine/layoutEngine'
import type { Card, ContentBlock, LayoutType, VisualStyle } from '@/engine/contentBlocks'
import { FlowLayout } from './FlowLayout'
import { StandardLayout } from './StandardLayout'
import { StandardSplitLayout } from './StandardSplitLayout'
import { HeroLayout } from './HeroLayout'
import { StatHeroLayout } from './StatHeroLayout'
import { ComparisonLayout } from './ComparisonLayout'
import { TimelineLayout } from './TimelineLayout'
import { IconGridLayout } from './IconGridLayout'
import { NumberedListLayout } from './NumberedListLayout'
import { QuoteLayout } from './QuoteLayout'
import { TextFocusLayout } from './TextFocusLayout'
import { GalleryLayout } from './GalleryLayout'

/*
  The layouts now drawn by `FlowLayout` rather than a component of their own.

  These are the "families" — layouts describing how a run of items looks. Each
  one moves here as its arrangement is ported into `GroupRenderer`, and its old
  component is deleted in the same change. The frames that describe a whole
  card (hero, statHero, quote, textFocus, standard, standardSplit) keep their
  components.

  `LAYOUT_COMPONENTS` below is typed to exclude exactly these names, so moving a
  layout into this list is a type error until its entry there is removed too.
*/
const FLOW_LAYOUTS = ['statGrid'] as const

type FlowLayoutName = (typeof FLOW_LAYOUTS)[number]

function rendersAsFlow(layout: Exclude<LayoutType, 'auto'>): layout is FlowLayoutName {
  return (FLOW_LAYOUTS as readonly string[]).includes(layout)
}

const LAYOUT_COMPONENTS: Record<
  Exclude<LayoutType, 'auto' | FlowLayoutName>,
  ComponentType<{ blocks: ContentBlock[]; variant: VisualStyle }>
> = {
  standard: StandardLayout,
  standardSplit: StandardSplitLayout,
  hero: HeroLayout,
  statHero: StatHeroLayout,
  comparison: ComparisonLayout,
  timeline: TimelineLayout,
  iconGrid: IconGridLayout,
  numberedList: NumberedListLayout,
  quote: QuoteLayout,
  textFocus: TextFocusLayout,
  gallery: GalleryLayout,
}

/**
 * Draws one card's arrangement.
 *
 * Unchanged by element nudges, and that is the design: a nudge is a delta from
 * wherever this puts an element, applied afterwards by `Adjustable`, not a
 * replacement for the layout. So the classifier still runs for every card, an
 * untouched element is still placed entirely by its layout component, and
 * switching a card's layout variety re-arranges everything with the nudges
 * still riding on top.
 */
export function LayoutRenderer({ card, context }: { card: Card; context?: LayoutContext }) {
  const resolved = resolveLayout(card.layout, card.blocks, context)
  if (rendersAsFlow(resolved)) {
    return <FlowLayout blocks={card.blocks} variant={card.visualStyle} hint={card.layout} />
  }
  const Component = LAYOUT_COMPONENTS[resolved]
  return <Component blocks={card.blocks} variant={card.visualStyle} />
}
```

Then delete the old component:

```bash
git rm src/components/layouts/StatGridLayout.tsx
```

- [ ] **Step 6: Run the guard — expect PASS**

Run: `npx vitest run src/components/layouts/everyBlockRenders.test.tsx`
Expected: `Tests  40 passed (40)`, including the new order test.

- [ ] **Step 7: Verify and commit**

Run: `npm run test` — all pass. `npx tsc -b; echo "EXIT=$?"` — `EXIT=0`. `npm run lint` — 10 warnings.

```bash
git add src/components/layouts/FlowLayout.tsx src/components/layouts/GroupRenderer.tsx src/components/layouts/LayoutRenderer.tsx src/components/layouts/everyBlockRenders.test.tsx
git commit -m "Stat grid cards render as groups, in the author's order

FlowLayout draws a card's blocks where they sit -- each block a leaf,
each run of same-type blocks a group in GroupRenderer. The stat grid is
the first family ported: its grid becomes the 'boxes' arrangement and
StatGridLayout is deleted. A paragraph between stats now stays between
them instead of being pushed below the grid.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: The timeline family

**Files:**
- Modify: `src/components/layouts/GroupRenderer.tsx` (imports, and a `case 'timeline'`)
- Modify: `src/components/layouts/LayoutRenderer.tsx` (`FLOW_LAYOUTS`, one entry, one import)
- Delete: `src/components/layouts/TimelineLayout.tsx`
- Test: `src/components/layouts/everyBlockRenders.test.tsx`

**Interfaces:**
- Consumes: `GroupNode` `'timeline'` member (`Indexed<TimelineStepBlock>[]`) from Task 2; `FLOW_LAYOUTS`, `LAYOUT_COMPONENTS`, `expectInOrder` from Task 3.
- Produces: `GroupRenderer` handles `'timeline'`; `FLOW_LAYOUTS` includes `'timeline'`.

- [ ] **Step 1: Write the failing order test**

Inside the existing `describe("a family card keeps the author's order", …)` block in `src/components/layouts/everyBlockRenders.test.tsx`, add:

```tsx
  it('timeline: a paragraph between steps stays between them', () => {
    const blocks: ContentBlock[] = [
      { type: 'heading', text: 'ORDTLH' },
      { type: 'timelineStep', label: 'ORDTLS1', text: 'ORDTLT1' },
      { type: 'paragraph', text: 'ORDTLP' },
      { type: 'timelineStep', label: 'ORDTLS2', text: 'ORDTLT2' },
      { type: 'timelineStep', label: 'ORDTLS3', text: 'ORDTLT3' },
    ]
    for (const variant of VARIANTS) {
      const html = renderToStaticMarkup(<LayoutRenderer card={card(blocks, 'auto', variant)} />)
      expectInOrder(html, ['ORDTLH', 'ORDTLS1', 'ORDTLP', 'ORDTLS2', 'ORDTLS3'])
    }
  })
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx vitest run src/components/layouts/everyBlockRenders.test.tsx`
Expected: the timeline order test FAILS (`drawn out of order`) — `TimelineLayout` draws all three steps, then the paragraph. Everything else passes.

- [ ] **Step 3: Port the timeline into `GroupRenderer`**

Replace the imports at the top of `src/components/layouts/GroupRenderer.tsx` with:

```tsx
import type { VisualStyle } from '@/engine/contentBlocks'
import { flattenNodes, type GroupNode } from '@/engine/groups'
import { textRef } from '@/engine/marks'
import { SLIDE_BODY_FONT } from '@/lib/theme-tokens'
import { Adjustable } from './Adjustable'
import { BlockRenderer, StatBlockView } from './BlockRenderer'
import { EditableText } from './EditableText'
```

Then add this case directly after the `case 'boxes'` block, before `default`:

```tsx
    case 'timeline':
      // From TimelineLayout: a numbered card per step when expressive, a
      // vertical accent line with a dot per step when structured.
      if (expressive) {
        return (
          <ol className="flex flex-col gap-4">
            {node.items.map((step, i) => (
              <Adjustable key={step.index} index={step.index}>
                <li
                  className="flex gap-4 rounded-slide-sm bg-slide-surface p-4"
                  style={{ fontFamily: SLIDE_BODY_FONT }}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slide-accent text-sm font-semibold text-slide-accent-foreground">
                    {i + 1}
                  </span>
                  <div>
                    <div className="font-semibold text-slide-accent">
                      <EditableText textRef={textRef(step.index, 'label')} value={step.block.label} />
                    </div>
                    <div className="text-slide-foreground/90">
                      <EditableText textRef={textRef(step.index, 'text')} value={step.block.text} />
                    </div>
                  </div>
                </li>
              </Adjustable>
            ))}
          </ol>
        )
      }
      return (
        <ol className="relative flex flex-col gap-6">
          <div
            aria-hidden="true"
            className="absolute inset-y-0 left-[calc(var(--spacing)*1.5)] w-0.5 -translate-x-1/2 bg-gradient-to-b from-slide-accent/45 via-slide-accent-soft/45 to-transparent"
          />
          {node.items.map((step) => (
            <Adjustable key={step.index} index={step.index}>
              <li className="relative pl-6" style={{ fontFamily: SLIDE_BODY_FONT }}>
                <span className="absolute left-[calc(var(--spacing)*1.5)] top-1 h-3 w-3 -translate-x-1/2 rounded-full bg-slide-accent" />
                <div className="font-semibold text-slide-accent">
                  <EditableText textRef={textRef(step.index, 'label')} value={step.block.label} />
                </div>
                <div className="text-slide-foreground/90">
                  <EditableText textRef={textRef(step.index, 'text')} value={step.block.text} />
                </div>
              </li>
            </Adjustable>
          ))}
        </ol>
      )
```

- [ ] **Step 4: Route the timeline through `FlowLayout`**

In `src/components/layouts/LayoutRenderer.tsx`:
- change `const FLOW_LAYOUTS = ['statGrid'] as const` to `const FLOW_LAYOUTS = ['statGrid', 'timeline'] as const`
- delete the line `  timeline: TimelineLayout,` from `LAYOUT_COMPONENTS`
- delete the line `import { TimelineLayout } from './TimelineLayout'`

Then:

```bash
git rm src/components/layouts/TimelineLayout.tsx
```

- [ ] **Step 5: Run the guard — expect PASS**

Run: `npx vitest run src/components/layouts/everyBlockRenders.test.tsx`
Expected: `Tests  41 passed (41)`.

- [ ] **Step 6: Verify and commit**

Run: `npm run test` — all pass. `npx tsc -b; echo "EXIT=$?"` — `EXIT=0`. `npm run lint` — 10 warnings.

```bash
git add src/components/layouts/GroupRenderer.tsx src/components/layouts/LayoutRenderer.tsx src/components/layouts/everyBlockRenders.test.tsx
git commit -m "Timeline cards render as groups, in the author's order

The timeline becomes GroupRenderer's 'timeline' arrangement and
TimelineLayout is deleted. A paragraph between steps now stays between
them rather than being pushed below the whole timeline.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: The comparison family

**Files:**
- Modify: `src/components/layouts/GroupRenderer.tsx` (a `case 'columns'`)
- Modify: `src/components/layouts/LayoutRenderer.tsx`
- Delete: `src/components/layouts/ComparisonLayout.tsx`
- Test: `src/components/layouts/everyBlockRenders.test.tsx`

**Interfaces:**
- Consumes: `GroupNode` `'columns'` member (`Indexed<ComparisonGroupBlock>[]`); the imports `Adjustable`, `EditableText`, `SLIDE_BODY_FONT` already added in Task 4.
- Produces: `GroupRenderer` handles `'columns'`; `FLOW_LAYOUTS` includes `'comparison'`.

- [ ] **Step 1: Write the failing order test**

Inside the `describe("a family card keeps the author's order", …)` block, add:

```tsx
  it('comparison: a paragraph between columns stays between them', () => {
    const blocks: ContentBlock[] = [
      { type: 'heading', text: 'ORDCMH' },
      { type: 'comparisonGroup', heading: 'ORDCMA', items: ['ORDCMAI'] },
      { type: 'paragraph', text: 'ORDCMP' },
      { type: 'comparisonGroup', heading: 'ORDCMB', items: ['ORDCMBI'] },
      { type: 'comparisonGroup', heading: 'ORDCMC', items: ['ORDCMCI'] },
    ]
    for (const variant of VARIANTS) {
      const html = renderToStaticMarkup(<LayoutRenderer card={card(blocks, 'auto', variant)} />)
      expectInOrder(html, ['ORDCMH', 'ORDCMA', 'ORDCMP', 'ORDCMB', 'ORDCMC'])
    }
  })
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx vitest run src/components/layouts/everyBlockRenders.test.tsx`
Expected: the comparison order test FAILS (`drawn out of order`).

- [ ] **Step 3: Port the comparison into `GroupRenderer`**

Add this case after `case 'timeline'`, before `default`:

```tsx
    case 'columns':
      // From ComparisonLayout: stacked rows when expressive, side-by-side cards
      // when structured. The first column is featured in both.
      if (expressive) {
        return (
          <div className="flex flex-col divide-y divide-slide-border">
            {node.items.map((group, i) => {
              const featured = i === 0
              return (
                <Adjustable key={group.index} index={group.index}>
                  <div className="flex flex-col gap-3 py-4" style={{ fontFamily: SLIDE_BODY_FONT }}>
                    <div className={`font-semibold ${featured ? 'text-slide-accent' : 'text-slide-foreground'}`}>
                      <EditableText textRef={textRef(group.index, 'heading')} value={group.block.heading} />
                    </div>
                    <ul className="flex flex-col gap-2">
                      {group.block.items.map((item, j) => (
                        <li key={j} className="flex items-start gap-2 text-sm text-slide-foreground/90">
                          <span
                            className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                              featured ? 'bg-slide-accent' : 'bg-slide-muted'
                            }`}
                          />
                          <EditableText textRef={textRef(group.index, 'items', j)} value={item} />
                        </li>
                      ))}
                    </ul>
                  </div>
                </Adjustable>
              )
            })}
          </div>
        )
      }
      return (
        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: `repeat(${node.items.length}, minmax(0, 1fr))` }}
        >
          {node.items.map((group, i) => {
            const featured = i === 0
            return (
              <Adjustable key={group.index} index={group.index}>
                <div
                  className={`rounded-slide-sm border p-4 ${
                    featured ? 'border-slide-accent bg-slide-accent/10' : 'border-slide-border bg-slide-surface'
                  }`}
                  style={{ fontFamily: SLIDE_BODY_FONT }}
                >
                  <div className={`mb-3 font-semibold ${featured ? 'text-slide-accent' : 'text-slide-foreground'}`}>
                    <EditableText textRef={textRef(group.index, 'heading')} value={group.block.heading} />
                  </div>
                  <ul className="flex flex-col gap-2">
                    {group.block.items.map((item, j) => (
                      <li key={j} className="flex items-start gap-2 text-sm text-slide-foreground/90">
                        <span
                          className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                            featured ? 'bg-slide-accent' : 'bg-slide-muted'
                          }`}
                        />
                        <EditableText textRef={textRef(group.index, 'items', j)} value={item} />
                      </li>
                    ))}
                  </ul>
                </div>
              </Adjustable>
            )
          })}
        </div>
      )
```

- [ ] **Step 4: Route the comparison through `FlowLayout`**

In `src/components/layouts/LayoutRenderer.tsx`:
- change `FLOW_LAYOUTS` to `['statGrid', 'timeline', 'comparison'] as const`
- delete `  comparison: ComparisonLayout,` from `LAYOUT_COMPONENTS`
- delete `import { ComparisonLayout } from './ComparisonLayout'`

```bash
git rm src/components/layouts/ComparisonLayout.tsx
```

- [ ] **Step 5: Run the guard — expect PASS**

Run: `npx vitest run src/components/layouts/everyBlockRenders.test.tsx`
Expected: `Tests  42 passed (42)`.

- [ ] **Step 6: Verify and commit**

Run: `npm run test` — all pass. `npx tsc -b; echo "EXIT=$?"` — `EXIT=0`. `npm run lint` — 10 warnings.

```bash
git add src/components/layouts/GroupRenderer.tsx src/components/layouts/LayoutRenderer.tsx src/components/layouts/everyBlockRenders.test.tsx
git commit -m "Comparison cards render as groups, in the author's order

The comparison becomes GroupRenderer's 'columns' arrangement and
ComparisonLayout is deleted.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: The list family — chips and numbered

**Files:**
- Modify: `src/components/layouts/GroupRenderer.tsx` (one import, and `case 'chips'` and `case 'numbered'`)
- Modify: `src/components/layouts/LayoutRenderer.tsx`
- Delete: `src/components/layouts/IconGridLayout.tsx`, `src/components/layouts/NumberedListLayout.tsx`
- Test: `src/components/layouts/everyBlockRenders.test.tsx`

**Interfaces:**
- Consumes: `GroupNode` `'chips' | 'numbered'` member, whose `items` is the one-element tuple `[Indexed<BulletListBlock>]`; `listArrangement` behaviour from Task 2 (the card's `layout` is forwarded by `FlowLayout` as `hint`).
- Produces: `GroupRenderer` handles `'chips'` and `'numbered'`; `FLOW_LAYOUTS` includes `'iconGrid'` and `'numberedList'`.

Both list layouts are one family — they are two arrangements of the same block type — so they port together.

- [ ] **Step 1: Write the failing order tests**

Inside the `describe("a family card keeps the author's order", …)` block, add:

```tsx
  it('icon grid: a paragraph before a short list stays before it', () => {
    const blocks: ContentBlock[] = [
      { type: 'heading', text: 'ORDIGH' },
      { type: 'paragraph', text: 'ORDIGP' },
      { type: 'bulletList', items: ['ORDIGI1', 'ORDIGI2'] },
    ]
    for (const variant of VARIANTS) {
      const html = renderToStaticMarkup(<LayoutRenderer card={card(blocks, 'auto', variant)} />)
      expectInOrder(html, ['ORDIGH', 'ORDIGP', 'ORDIGI1', 'ORDIGI2'])
    }
  })

  it('numbered list: a paragraph before a long list stays before it', () => {
    const blocks: ContentBlock[] = [
      { type: 'heading', text: 'ORDNLH' },
      { type: 'paragraph', text: 'ORDNLP' },
      {
        type: 'bulletList',
        items: ['ORDNLI1', 'ORDNLI2', 'ORDNLI3', 'ORDNLI4', 'ORDNLI5', 'ORDNLI6', 'ORDNLI7'],
      },
    ]
    for (const variant of VARIANTS) {
      const html = renderToStaticMarkup(<LayoutRenderer card={card(blocks, 'auto', variant)} />)
      expectInOrder(html, ['ORDNLH', 'ORDNLP', 'ORDNLI1', 'ORDNLI7'])
    }
  })
```

The classifier routes the first card to `iconGrid` (one list, two short items) and the second to `numberedList` (seven items is over `MAX_CHIP_ITEMS`).

- [ ] **Step 2: Run them — expect FAIL**

Run: `npx vitest run src/components/layouts/everyBlockRenders.test.tsx`
Expected: both new tests FAIL (`drawn out of order`) — each old list layout draws the list, then the paragraph.

- [ ] **Step 3: Port both list layouts into `GroupRenderer`**

Change the theme-tokens import in `src/components/layouts/GroupRenderer.tsx` to:

```tsx
import { SLIDE_BODY_FONT, SLIDE_HEADING_FONT } from '@/lib/theme-tokens'
```

Add these two cases after `case 'columns'`, before `default`:

```tsx
    case 'chips': {
      // From IconGridLayout: pill chips when expressive, numbered tiles when
      // structured. A list group always holds exactly one list.
      const [list] = node.items
      if (expressive) {
        return (
          <Adjustable index={list.index}>
            <div className="flex flex-wrap gap-3" style={{ fontFamily: SLIDE_BODY_FONT }}>
              {list.block.items.map((item, i) => (
                <div key={i} className="flex items-center gap-2 rounded-full bg-slide-accent/10 py-2 pl-2 pr-4">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slide-accent to-slide-accent-soft text-xs font-semibold text-slide-accent-foreground">
                    {i + 1}
                  </span>
                  <span className="text-sm text-slide-foreground/90">
                    <EditableText textRef={textRef(list.index, 'items', i)} value={item} />
                  </span>
                </div>
              ))}
            </div>
          </Adjustable>
        )
      }
      return (
        <Adjustable index={list.index}>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3" style={{ fontFamily: SLIDE_BODY_FONT }}>
            {list.block.items.map((item, i) => (
              <div
                key={i}
                className="flex flex-col items-start gap-2 rounded-slide-sm border border-slide-border bg-slide-surface p-4"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slide-accent text-sm font-semibold text-slide-accent-foreground">
                  {i + 1}
                </span>
                <span className="text-sm text-slide-foreground/90">
                  <EditableText textRef={textRef(list.index, 'items', i)} value={item} />
                </span>
              </div>
            ))}
          </div>
        </Adjustable>
      )
    }

    case 'numbered': {
      // From NumberedListLayout: numbered cards when expressive, divided rows
      // with zero-padded numbers when structured.
      const [list] = node.items
      if (expressive) {
        return (
          <Adjustable index={list.index}>
            <ol className="flex flex-col gap-3" style={{ fontFamily: SLIDE_BODY_FONT }}>
              {list.block.items.map((item, i) => (
                <li key={i} className="flex items-center gap-4 rounded-slide-sm bg-slide-surface p-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slide-accent to-slide-accent-soft text-sm font-semibold text-slide-accent-foreground">
                    {i + 1}
                  </span>
                  <span className="text-slide-foreground/90">
                    <EditableText textRef={textRef(list.index, 'items', i)} value={item} />
                  </span>
                </li>
              ))}
            </ol>
          </Adjustable>
        )
      }
      return (
        <Adjustable index={list.index}>
          <ol className="flex flex-col divide-y divide-slide-border" style={{ fontFamily: SLIDE_BODY_FONT }}>
            {list.block.items.map((item, i) => (
              <li key={i} className="flex items-baseline gap-4 py-3">
                <span className="shrink-0 text-slide-accent" style={{ fontFamily: SLIDE_HEADING_FONT, fontWeight: 600 }}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="text-slide-foreground/90">
                  <EditableText textRef={textRef(list.index, 'items', i)} value={item} />
                </span>
              </li>
            ))}
          </ol>
        </Adjustable>
      )
    }
```

- [ ] **Step 4: Route both list layouts through `FlowLayout`**

In `src/components/layouts/LayoutRenderer.tsx`:
- change `FLOW_LAYOUTS` to `['statGrid', 'timeline', 'comparison', 'iconGrid', 'numberedList'] as const`
- delete `  iconGrid: IconGridLayout,` and `  numberedList: NumberedListLayout,` from `LAYOUT_COMPONENTS`
- delete `import { IconGridLayout } from './IconGridLayout'` and `import { NumberedListLayout } from './NumberedListLayout'`

```bash
git rm src/components/layouts/IconGridLayout.tsx src/components/layouts/NumberedListLayout.tsx
```

- [ ] **Step 5: Run the guard — expect PASS**

Run: `npx vitest run src/components/layouts/everyBlockRenders.test.tsx src/engine/groups.test.ts`
Expected: all pass (`44` in the guard file).

- [ ] **Step 6: Verify and commit**

Run: `npm run test` — all pass. `npx tsc -b; echo "EXIT=$?"` — `EXIT=0`. `npm run lint` — 10 warnings.

```bash
git add src/components/layouts/GroupRenderer.tsx src/components/layouts/LayoutRenderer.tsx src/components/layouts/everyBlockRenders.test.tsx
git commit -m "List cards render as groups, in the author's order

The icon grid and numbered list become GroupRenderer's 'chips' and
'numbered' arrangements and both components are deleted. A list's
arrangement still follows an explicit Level 2 choice, forwarded to
inferGroups as the hint.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: The gallery family

**Files:**
- Modify: `src/components/layouts/GroupRenderer.tsx` (a `case 'gallery'`)
- Modify: `src/components/layouts/LayoutRenderer.tsx`
- Delete: `src/components/layouts/GalleryLayout.tsx`
- Test: `src/components/layouts/everyBlockRenders.test.tsx`

**Interfaces:**
- Consumes: `GroupNode` `'gallery'` member (`Indexed<ImageBlock>[]`, at least `MIN_RUN` = 2 items).
- Produces: `GroupRenderer` handles every arrangement in `GroupNode`; `FLOW_LAYOUTS` holds all six families.

- [ ] **Step 1: Write the failing order test**

Inside the `describe("a family card keeps the author's order", …)` block, add:

```tsx
  it('gallery: a quote between images stays between them', () => {
    // Forced, not automatic: the classifier only awards `gallery` to a card
    // with no paragraph, but the Level 2 picker can put any card in it.
    const blocks: ContentBlock[] = [
      { type: 'heading', text: 'ORDGLH' },
      { type: 'image', url: 'https://example.test/ORDGL1.png' },
      { type: 'quote', text: 'ORDGLQ' },
      { type: 'image', url: 'https://example.test/ORDGL2.png' },
      { type: 'image', url: 'https://example.test/ORDGL3.png' },
    ]
    for (const variant of VARIANTS) {
      const html = renderToStaticMarkup(<LayoutRenderer card={card(blocks, 'gallery', variant)} />)
      expectInOrder(html, ['ORDGLH', 'ORDGL1', 'ORDGLQ', 'ORDGL2', 'ORDGL3'])
    }
  })
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx vitest run src/components/layouts/everyBlockRenders.test.tsx`
Expected: the gallery order test FAILS (`drawn out of order`).

- [ ] **Step 3: Port the gallery into `GroupRenderer`**

Add this case after `case 'numbered'`, before `default`:

```tsx
    case 'gallery': {
      // From GalleryLayout. The expressive mosaic shows a featured image beside
      // two more, and the old layout silently dropped a fourth — so any image
      // beyond the mosaic now continues in a row beneath it.
      if (expressive) {
        const [featured, ...rest] = node.items
        const overflow = rest.slice(2)
        return (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <Adjustable index={featured.index}>
                <figure className="row-span-2 overflow-hidden rounded-slide-sm border border-slide-border">
                  <img
                    src={featured.block.url}
                    alt={featured.block.alt ?? ''}
                    className="h-full w-full object-cover"
                  />
                </figure>
              </Adjustable>
              <div className="grid grid-rows-2 gap-3">
                {rest.slice(0, 2).map((img) => (
                  <Adjustable key={img.index} index={img.index}>
                    <figure className="overflow-hidden rounded-slide-sm border border-slide-border">
                      <img src={img.block.url} alt={img.block.alt ?? ''} className="aspect-square w-full object-cover" />
                    </figure>
                  </Adjustable>
                ))}
              </div>
            </div>
            {overflow.length > 0 && (
              <div className="grid grid-cols-3 gap-3">
                {overflow.map((img) => (
                  <Adjustable key={img.index} index={img.index}>
                    <figure className="overflow-hidden rounded-slide-sm border border-slide-border">
                      <img src={img.block.url} alt={img.block.alt ?? ''} className="aspect-square w-full object-cover" />
                    </figure>
                  </Adjustable>
                ))}
              </div>
            )}
          </div>
        )
      }
      return (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {node.items.map((img) => (
            <Adjustable key={img.index} index={img.index}>
              <figure className="overflow-hidden rounded-slide-sm border border-slide-border">
                <img src={img.block.url} alt={img.block.alt ?? ''} className="aspect-square w-full object-cover" />
              </figure>
            </Adjustable>
          ))}
        </div>
      )
    }
```

- [ ] **Step 4: Route the gallery through `FlowLayout`**

In `src/components/layouts/LayoutRenderer.tsx`:
- change `FLOW_LAYOUTS` to `['statGrid', 'timeline', 'comparison', 'iconGrid', 'numberedList', 'gallery'] as const`
- delete `  gallery: GalleryLayout,` from `LAYOUT_COMPONENTS`
- delete `import { GalleryLayout } from './GalleryLayout'`

```bash
git rm src/components/layouts/GalleryLayout.tsx
```

- [ ] **Step 5: Run the guard — expect PASS**

Run: `npx vitest run src/components/layouts/everyBlockRenders.test.tsx`
Expected: `Tests  45 passed (45)`, including the realistic "gallery of four images" case in both variants.

- [ ] **Step 6: Verify and commit**

Run: `npm run test` — all pass. `npx tsc -b; echo "EXIT=$?"` — `EXIT=0`. `npm run lint` — 10 warnings.

```bash
git add src/components/layouts/GroupRenderer.tsx src/components/layouts/LayoutRenderer.tsx src/components/layouts/everyBlockRenders.test.tsx
git commit -m "Gallery cards render as groups, in the author's order

The gallery becomes GroupRenderer's 'gallery' arrangement and
GalleryLayout is deleted. The expressive mosaic no longer drops a fourth
image: anything past the mosaic continues in a row beneath it.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Make the arrangement switch exhaustive, and document the model

**Files:**
- Modify: `src/components/layouts/GroupRenderer.tsx` (imports, and the `default` branch)
- Modify: `src/components/layouts/Adjustable.tsx` (a comment that names deleted components)
- Modify: `CLAUDE.md` (content model, element nudging)

**Interfaces:**
- Consumes: every arrangement case from Tasks 3–7.
- Produces: a `GroupRenderer` whose `switch` is exhaustive at compile time — adding a member to `GroupNode` without a case is a type error.

With every arrangement ported, the fallback that drew unported groups as plain blocks can no longer be reached, and leaving it would let a future arrangement silently render as plain blocks.

- [ ] **Step 1: Replace the fallback with an exhaustiveness check**

In `src/components/layouts/GroupRenderer.tsx`, replace the whole `default:` branch with:

```tsx
    default: {
      // Every arrangement is drawn above, so this is unreachable. The
      // assignment makes adding an arrangement to `GroupNode` without a case
      // here a compile error, rather than a card silently drawn another way.
      const unreachable: never = node
      return unreachable
    }
```

The fallback was the only user of `BlockRenderer` and `flattenNodes` in this file, and `noUnusedLocals` is on, so change these two import lines:

```tsx
import { flattenNodes, type GroupNode } from '@/engine/groups'
import { BlockRenderer, StatBlockView } from './BlockRenderer'
```

to:

```tsx
import type { GroupNode } from '@/engine/groups'
import { StatBlockView } from './BlockRenderer'
```

Run: `npx tsc -b; echo "EXIT=$?"` — expected `EXIT=0`.

- [ ] **Step 2: Prove the check bites (mutation check)**

Add a fake arrangement to `GroupNode`, confirm the build fails, then restore:

```bash
python - <<'PY'
import io
p = 'src/engine/groups.ts'
s = io.open(p, encoding='utf-8').read()
a = "  | { kind: 'group'; arrangement: 'chips' | 'numbered'; items: [Indexed<BulletListBlock>] }\n"
assert s.count(a) == 1
s = s.replace(a, a + "  | { kind: 'group'; arrangement: 'probe'; items: Indexed<StatBlock>[] }\n", 1)
io.open(p, 'w', encoding='utf-8', newline='').write(s)
PY
npx tsc -b; echo "EXIT=$?"
git checkout -- src/engine/groups.ts
npx tsc -b; echo "EXIT=$?"
```

Expected: the first `EXIT` is non-zero, with `TS2322` reporting that the `'probe'` member is not assignable to `never` in `GroupRenderer.tsx`. The second is `EXIT=0`. Confirm `git status --short` does not list `src/engine/groups.ts`.

- [ ] **Step 3: Fix the comment in `Adjustable.tsx` that names deleted components**

```bash
python - <<'PY'
import io
p = 'src/components/layouts/Adjustable.tsx'
s = io.open(p, encoding='utf-8').read()
a = 'dropped into twelve hand-designed layouts without touching how any of them'
assert s.count(a) == 1
s = s.replace(a, 'dropped into every hand-designed layout and arrangement without touching how any of them', 1)
b = (
    'becomes the grid cell in\n'
    '  `StatGridLayout`, and sits illegally between `<ol>` and `<li>` in\n'
    '  `TimelineLayout`.'
)
assert s.count(b) == 1
s = s.replace(
    b,
    'becomes the grid cell in\n'
    '  `GroupRenderer`\'s `boxes`, and sits illegally between `<ol>` and `<li>` in\n'
    '  its `timeline`.',
    1,
)
io.open(p, 'w', encoding='utf-8', newline='').write(s)
PY
```

- [ ] **Step 4: Document the model in CLAUDE.md**

```bash
python - <<'PY'
import io, re
p = 'CLAUDE.md'
s = io.open(p, encoding='utf-8').read()

def replace_between(text, start, end, new):
    i = text.index(start)
    j = text.index(end, i) + len(end)
    assert text.count(start) == 1, f'start anchor not unique: {start[:50]}'
    return text[:i] + new + text[j:]

# 1. The LayoutRenderer bullet.
s = replace_between(
    s,
    '- `components/layouts/LayoutRenderer.tsx` dispatches a resolved layout',
    "don't reintroduce per-layout heading-size variance.",
    '- `components/layouts/LayoutRenderer.tsx` runs the classifier, then draws the card one of two ways. '
    '**Families** — `statGrid`, `timeline`, `comparison`, `iconGrid`, `numberedList`, `gallery`, the layouts '
    'that describe how a *run of items* looks — render through `FlowLayout`, which draws the card\'s blocks in '
    'the author\'s order via `inferGroups` (`engine/groups.ts`): each block a leaf through `BlockRenderer`, and '
    'each run of same-type blocks a group through `GroupRenderer`, arranged as `boxes`, `timeline`, `columns`, '
    '`chips`, `numbered` or `gallery`. **Frames** — `hero`, `statHero`, `quote`, `textFocus`, `standard`, '
    '`standardSplit`, which describe how a *whole card* looks — keep their own components. `FLOW_LAYOUTS` names '
    'the families and `LAYOUT_COMPONENTS` is typed to exclude exactly those names, so a layout cannot be both; '
    '`GroupRenderer`\'s switch is exhaustive, so a new arrangement without a case is a compile error. All heading '
    'sizes are deliberately uniform (`h2`, via the shared `Heading` component in `BlockRenderer.tsx`) except the '
    'opening `HeroLayout` (`h1`) — don\'t reintroduce per-layout heading-size variance.',
)

# 2. The Stage 0 leftovers bullet, which described all twelve layouts.
s = replace_between(
    s,
    '- **Every layout ends with `<Leftovers blocks consumed />`, and that is load-bearing.**',
    'removes that cause rather than patching around it.',
    '- **Grouping is derived at render time and never stored, and one invariant makes that safe:** '
    '`inferGroups` never reorders, drops or duplicates a block, and every block keeps its original index — '
    '`groups.test.ts` checks it exhaustively. That index is the block\'s `textRef`, its `card.adjusts` key, its '
    '`data-block-index` and the editor\'s `selectedBlockIndex`, so grouping changes how a card looks and nothing '
    'about how it is stored, edited, nudged, exported or narrated. Runs are **consecutive only**: two stats with a '
    'paragraph between them are two leaves and a paragraph, never a grid with the paragraph moved to the end — the '
    'old family layouts reordered content to fit their shape, which is also how they came to drop it. A bullet '
    'list is a group of one, arranged `chips` or `numbered` by the card\'s explicit layout when it has one (so the '
    'Level 2 picker still works) and otherwise by the classifier\'s own `iconGrid` rule, via the shared '
    '`MAX_CHIP_ITEMS`/`SHORT_ITEM_MAX_CHARS`. Nothing is stored because nothing in the app inserts, deletes or '
    'reorders a single block within a card, so a block\'s index is fixed for the card\'s life. Hand-built groups '
    '(grouping non-adjacent blocks, moving a block into a group) would need stored groups; that is future work. '
    'Design: `docs/superpowers/specs/2026-09-18-smart-layout-groups-design.md`.\n'
    '- **Frames still end with `<Leftovers blocks consumed />`.** Each draws only the block types it understands, '
    'so it names the indices it drew and `leftoverBlocks` (`engine/blockPartition.ts`) hands it the rest, keeping '
    'each block\'s original index. Before that, a paragraph on a timeline card was drawn nowhere while the PPTX '
    'export and narration both carried it — one card, three contents. A frame that shows only the *first* of a '
    'type (`StatHero`, `Quote`, `Hero`, `StandardSplit`\'s image slot) must name only that one in `consumed`. '
    'Families need none of this: `FlowLayout` draws every node `inferGroups` returns.',
)

# 3. The visualStyle bullet names the component count.
a = 'gives every one of the 12 layout components a second visual treatment'
assert s.count(a) == 1
s = s.replace(a, 'gives every frame and every `GroupRenderer` arrangement a second visual treatment', 1)

# 4. The element-nudging bullet names deleted components.
s = replace_between(
    s,
    '**Wrapping has to happen wherever a block is rendered, not just in the primitives.**',
    'all of which were invisible to selection until wrapped.',
    '**Wrapping has to happen wherever a block is rendered, not just in the primitives.** `Heading` and '
    '`StatBlockView` cover most cards, but `HeroLayout` renders its own `h1`/`p`, `QuoteLayout` its quote, and '
    '`GroupRenderer` its timeline steps, comparison columns, list items and gallery figures — all of which are '
    'invisible to selection unless wrapped.',
)

io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('CLAUDE.md updated')
PY
```

Expected output: `CLAUDE.md updated`. If any `assert` fires, the anchor text has drifted — read the surrounding passage in `CLAUDE.md`, fix the anchor in the script, and re-run; do not hand-edit around it.

- [ ] **Step 5: Verify and commit**

Run: `npm run test` — all pass. `npx tsc -b; echo "EXIT=$?"` — `EXIT=0`. `npm run lint` — 10 warnings.
Run: `ls src/components/layouts/` — expected to contain none of `StatGridLayout.tsx`, `TimelineLayout.tsx`, `ComparisonLayout.tsx`, `IconGridLayout.tsx`, `NumberedListLayout.tsx`, `GalleryLayout.tsx`.

```bash
git add src/components/layouts/GroupRenderer.tsx src/components/layouts/Adjustable.tsx CLAUDE.md
git commit -m "Make GroupRenderer's arrangement switch exhaustive; document groups

Every arrangement is ported, so the fallback that drew unported groups as
plain blocks is unreachable. Replacing it with a never-assignment makes a
new arrangement without a case a compile error instead of a card
silently drawn another way.

CLAUDE.md now describes families vs frames, the grouping invariant, and
why nothing about groups is stored.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Verification after the last task

- `npm run test`, `npx tsc -b; echo "EXIT=$?"` (must print `EXIT=0`), `npm run lint` (10 warnings).
- `everyBlockRenders.test.tsx`: 45 tests — every layout forced and automatic in both treatments, six realistic cards, draws-once, and six author's-order tests, one per family.
- `groups.test.ts`: the exhaustive invariant over 4,681 cards per hint.
- **Not verified by any test here, and needing a signed-in browser:** that the ported arrangements *look* the same as the components they replaced. The JSX is moved verbatim, but the outer gap under a stat grid heading changes from `gap-8` to `gap-6`, and a family card now draws a block between two runs in its written place rather than below them. Worth a visual pass over a real deck of each family.
