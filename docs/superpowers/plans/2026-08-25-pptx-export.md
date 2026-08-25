# PPTX Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Export a LekturaC deck as a `.pptx` file with native, editable PowerPoint text on top of the deck theme's celestial backdrop.

**Architecture:** A self-contained `src/export/` module takes `Card[]` + `ThemeTokens` and returns a `.pptx`. The 12 on-screen layouts group down to five PowerPoint arrangements. The backdrop is emitted as a purpose-built 1920×1080 SVG from the same `CelestialDecor` data the live component reads, rasterized to one PNG per deck and set as every slide's background.

**Tech Stack:** TypeScript, React 19, Vite 8, Vitest 4 (node environment — no DOM in tests), zod, `pptxgenjs` 4.0.1 (new dependency).

**Spec:** `docs/superpowers/specs/2026-08-25-pptx-export-design.md`

## Global Constraints

- **`tsconfig.app.json` sets `verbatimModuleSyntax: true`** — every type-only import MUST use `import type`.
- **`tsconfig.app.json` sets `erasableSyntaxOnly: true`** — no TS constructor-parameter-property shorthand.
- **Path alias `@/*` → `src/*`.** Use it in all new imports.
- **Vitest runs with `environment: 'node'`** (`vite.config.ts`). No test may touch `document`, `window`, `Image`, or `canvas`.
- **Nothing outside `src/export/` may import `pptxgenjs`.**
- **Nothing inside `src/export/` may import React or any component.**
- **`pptxgenjs` must be loaded via dynamic `import()`**, never a static top-level import, so it stays out of the main bundle.
- **Slide geometry is fixed:** `pptx.layout = 'LAYOUT_16x9'` → 10in × 5.625in. Margin 0.6in, content width 8.8in.
- **Backdrop raster size is fixed:** 1920 × 1080.
- Verification commands: `npm run test`, `npx tsc -b`, `npm run lint`. All three must pass before every commit.
- Commit messages end with:
  ```
  Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HHKjz4g35yxMuXNS3rvbea
  ```

---

### Task 1: Layout grouping

**Files:**
- Create: `src/export/slideGroup.ts`
- Test: `src/export/slideGroup.test.ts`

**Interfaces:**
- Consumes: `resolveLayout` from `@/engine/layoutEngine`; `Card`, `LayoutType` from `@/engine/contentBlocks`.
- Produces:
  - `export type PptxGroup = 'title' | 'body' | 'stat' | 'twoCol' | 'quote'`
  - `export function slideGroup(card: Card, isFirstCard: boolean): PptxGroup`

The trap this task exists to avoid: `card.layout` is the literal string `'auto'` for nearly every card, because the manual layout override UI writes `'auto'` and the rule-based classifier decides at render time. Grouping on `card.layout` directly would put every slide in the wrong bucket. `resolveLayout` must run first.

- [ ] **Step 1: Write the failing test**

Create `src/export/slideGroup.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { slideGroup } from './slideGroup'
import type { Card, ContentBlock } from '@/engine/contentBlocks'

function card(blocks: ContentBlock[], layout: Card['layout'] = 'auto'): Card {
  return { id: 'c1', orderIndex: 0, blocks, layout, visualStyle: 'structured' }
}

const HEADING: ContentBlock = { type: 'heading', text: 'Title' }

describe('slideGroup', () => {
  it('maps an explicit quote layout to the quote group', () => {
    const c = card([HEADING, { type: 'quote', text: 'Words' }], 'quote')
    expect(slideGroup(c, false)).toBe('quote')
  })

  it('maps an explicit comparison layout to twoCol', () => {
    expect(slideGroup(card([HEADING], 'comparison'), false)).toBe('twoCol')
  })

  it('maps both stat layouts to the stat group', () => {
    expect(slideGroup(card([HEADING], 'statHero'), false)).toBe('stat')
    expect(slideGroup(card([HEADING], 'statGrid'), false)).toBe('stat')
  })

  it('maps hero and textFocus to the title group', () => {
    expect(slideGroup(card([HEADING], 'hero'), false)).toBe('title')
    expect(slideGroup(card([HEADING], 'textFocus'), false)).toBe('title')
  })

  it('maps the remaining layouts to body', () => {
    for (const layout of ['standard', 'standardSplit', 'timeline', 'iconGrid', 'numberedList', 'gallery'] as const) {
      expect(slideGroup(card([HEADING], layout), false)).toBe('body')
    }
  })

  // The load-bearing case: 'auto' must be resolved by the classifier first,
  // not treated as a layout in its own right.
  it('resolves auto through the classifier instead of falling through', () => {
    const quoteCard = card([HEADING, { type: 'quote', text: 'Words' }], 'auto')
    expect(slideGroup(quoteCard, false)).toBe('quote')
  })

  it('passes isFirstCard through, so an opening card can reach the hero treatment', () => {
    const opening = card([HEADING, { type: 'paragraph', text: 'Subtitle' }], 'auto')
    expect(slideGroup(opening, true)).toBe('title')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/export/slideGroup.test.ts`
Expected: FAIL — `Failed to resolve import "./slideGroup"`.

- [ ] **Step 3: Write the implementation**

Create `src/export/slideGroup.ts`:

```ts
import type { Card, LayoutType } from '@/engine/contentBlocks'
import { resolveLayout } from '@/engine/layoutEngine'

/**
 * The five arrangements a slide can take in the exported .pptx.
 *
 * Deliberately fewer than the twelve on-screen layouts: PowerPoint gets native,
 * editable text boxes rather than a reproduction of each hand-designed
 * treatment, and the structure worth preserving across that translation is
 * "is this a title, a body, a stat, a two-column comparison, or a quote".
 * `visualStyle` is a screen-only distinction and is not represented here.
 */
export type PptxGroup = 'title' | 'body' | 'stat' | 'twoCol' | 'quote'

/*
  Exhaustive by construction: a thirteenth layout added to `LayoutType` is a
  type error here rather than a silent fallthrough into `body`, which would
  ship a wrong-looking slide with nothing to catch it.
*/
const GROUP_BY_LAYOUT: Record<Exclude<LayoutType, 'auto'>, PptxGroup> = {
  hero: 'title',
  textFocus: 'title',
  standard: 'body',
  standardSplit: 'body',
  timeline: 'body',
  iconGrid: 'body',
  numberedList: 'body',
  gallery: 'body',
  statHero: 'stat',
  statGrid: 'stat',
  comparison: 'twoCol',
  quote: 'quote',
}

/**
 * Which arrangement a card exports as.
 *
 * `resolveLayout` runs first and is not optional: `card.layout` is `'auto'` for
 * nearly every card, since the classifier decides at render time. Grouping on
 * the stored value would classify the string `'auto'` and put the whole deck in
 * one bucket.
 */
export function slideGroup(card: Card, isFirstCard: boolean): PptxGroup {
  const resolved = resolveLayout(card.layout, card.blocks, { isFirstCard })
  return GROUP_BY_LAYOUT[resolved]
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/export/slideGroup.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Typecheck and lint**

Run: `npx tsc -b && npm run lint`
Expected: both silent.

- [ ] **Step 6: Commit**

```bash
git add src/export/slideGroup.ts src/export/slideGroup.test.ts
git commit -F - <<'EOF'
Add layout-to-PPTX-group mapping for export

The twelve on-screen layouts group onto five PowerPoint arrangements.
`resolveLayout` runs first because `card.layout` is `'auto'` for nearly
every card, and the record is exhaustive so a new layout is a type error
rather than a silent fallthrough.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HHKjz4g35yxMuXNS3rvbea
EOF
```

---

### Task 2: Text and style mapping

**Files:**
- Create: `src/export/textRun.ts`
- Test: `src/export/textRun.test.ts`

**Interfaces:**
- Consumes: `TextStyle`, `mergeTextStyle`, `EMPTY_TEXT_STYLE` from `@/engine/textStyle`; `Mark`, `textSegments` from `@/engine/marks`.
- Produces:
  - `export const PT_PER_REM = 18`
  - `export function faceName(cssStack: string): string`
  - `export function resolveRunStyle(deckAndCard: TextStyle, inline: TextStyle | undefined): TextStyle`
  - `export function pointSize(rem: number, fontScale: number | undefined): number`
  - `export interface PptxTextRun { text: string; options: Record<string, unknown> }`
  - `export function markedRuns(text: string, marks: Mark[] | undefined): PptxTextRun[]`
  - `export function hex(color: string): string`

`textSegments` already returns exactly the run-splitting pptxgenjs's rich-text array wants, so bold/italic marks need no new logic here — only a shape change.

- [ ] **Step 1: Write the failing test**

Create `src/export/textRun.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { faceName, hex, markedRuns, pointSize, resolveRunStyle, PT_PER_REM } from './textRun'
import { mergeTextStyle } from '@/engine/textStyle'

describe('faceName', () => {
  it('takes the first family out of a CSS stack', () => {
    expect(faceName("'Inter', system-ui, sans-serif")).toBe('Inter')
    expect(faceName('Verdana, Geneva, sans-serif')).toBe('Verdana')
  })

  it('strips both quote styles', () => {
    expect(faceName('"Arial Black", sans-serif')).toBe('Arial Black')
  })

  it('handles a single family with no comma', () => {
    expect(faceName('Georgia')).toBe('Georgia')
  })
})

describe('resolveRunStyle', () => {
  it('lets an inline value win over the card and deck value', () => {
    const deckAndCard = mergeTextStyle({ align: 'left', bold: true }, { align: 'center' })
    const resolved = resolveRunStyle(deckAndCard, { align: 'right' })
    expect(resolved.align).toBe('right')
    // Inherited, not thrown away: the run only overrode `align`.
    expect(resolved.bold).toBe(true)
  })

  it('falls back to the merged deck+card style when there is no inline entry', () => {
    const deckAndCard = mergeTextStyle({ fontScale: 1.2 }, undefined)
    expect(resolveRunStyle(deckAndCard, undefined).fontScale).toBe(1.2)
  })
})

describe('pointSize', () => {
  it('puts a 1rem body line at the target point size', () => {
    expect(pointSize(1, undefined)).toBe(PT_PER_REM)
  })

  it('keeps the theme scale ratios rather than flattening them', () => {
    expect(pointSize(2.75, undefined)).toBe(Math.round(2.75 * PT_PER_REM))
  })

  it('multiplies by the font scale', () => {
    expect(pointSize(1, 1.5)).toBe(Math.round(1.5 * PT_PER_REM))
  })
})

describe('markedRuns', () => {
  it('returns one plain run when there are no marks', () => {
    expect(markedRuns('hello', undefined)).toEqual([
      { text: 'hello', options: {} },
    ])
  })

  it('splits a run at every mark edge', () => {
    const runs = markedRuns('abcdef', [{ type: 'bold', start: 2, end: 4 }])
    expect(runs.map((r) => r.text)).toEqual(['ab', 'cd', 'ef'])
    expect(runs[1].options.bold).toBe(true)
  })

  it('omits false flags rather than emitting them, so pptxgenjs inherits the box default', () => {
    const runs = markedRuns('abcdef', [{ type: 'bold', start: 2, end: 4 }])
    expect(runs[0].options).toEqual({})
    expect('italic' in runs[1].options).toBe(false)
  })
})

describe('hex', () => {
  it('strips the leading hash pptxgenjs does not want', () => {
    expect(hex('#8a6cff')).toBe('8a6cff')
    expect(hex('8a6cff')).toBe('8a6cff')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/export/textRun.test.ts`
Expected: FAIL — `Failed to resolve import "./textRun"`.

- [ ] **Step 3: Write the implementation**

Create `src/export/textRun.ts`:

```ts
import type { TextStyle } from '@/engine/textStyle'
import { EMPTY_TEXT_STYLE } from '@/engine/textStyle'
import type { Mark } from '@/engine/marks'
import { textSegments } from '@/engine/marks'

/*
  A theme's `typography.scale` is in rem; PowerPoint wants points. One constant
  converts, chosen so a 1rem body line lands at 18pt — a normal slide body size.

  Deliberately a single multiplier rather than a per-level table: the theme's
  scale encodes its own hierarchy in the ratios between h1/h2/h3/body, and
  assigning each level an absolute point size would flatten exactly the
  distinction the theme is expressing. This is the same argument
  `engine/textStyle.ts` makes for `fontScale` being a multiplier.
*/
export const PT_PER_REM = 18

/**
 * One family name PowerPoint can resolve, out of a CSS font stack.
 *
 * The app stores stacks (`"'Inter', system-ui, sans-serif"`) so a missing
 * webfont degrades within its genre. PowerPoint has no such concept — it takes
 * one face and substitutes on its own if the machine lacks it — so the export
 * keeps the first family and drops the fallbacks.
 */
export function faceName(cssStack: string): string {
  const first = cssStack.split(',')[0].trim()
  return first.replace(/^['"]|['"]$/g, '')
}

/**
 * The style for one run of text.
 *
 * `deckAndCard` is expected to already be `mergeTextStyle(deck, card)`; this
 * adds the third and last level, the run's own `inline[ref].style`. Merged per
 * *field* for the same reason `mergeTextStyle` is: a run that overrode only
 * `align` must still inherit the deck's font and weight.
 */
export function resolveRunStyle(deckAndCard: TextStyle, inline: TextStyle | undefined): TextStyle {
  return { ...deckAndCard, ...(inline ?? EMPTY_TEXT_STYLE) }
}

/** A rem size from the theme's scale, as whole points, with the user's font scale applied. */
export function pointSize(rem: number, fontScale: number | undefined): number {
  return Math.round(rem * (fontScale ?? 1) * PT_PER_REM)
}

/** One entry of a pptxgenjs rich-text array. */
export interface PptxTextRun {
  text: string
  options: Record<string, unknown>
}

/**
 * Splits text into the runs its bold/italic marks require.
 *
 * `textSegments` already produces the shortest uniform split, which is exactly
 * what a pptxgenjs rich-text array wants — so this is a shape change and not a
 * second implementation of mark resolution.
 *
 * A `false` flag is omitted rather than emitted: pptxgenjs treats an absent
 * option as "inherit the text box default", and writing `bold: false` into
 * every unmarked run would override a heading's own weight.
 */
export function markedRuns(text: string, marks: Mark[] | undefined): PptxTextRun[] {
  return textSegments(text, marks).map((segment) => {
    const options: Record<string, unknown> = {}
    if (segment.bold) options.bold = true
    if (segment.italic) options.italic = true
    return { text: segment.text, options }
  })
}

/** pptxgenjs colors are hex without the leading `#`; theme tokens carry one. */
export function hex(color: string): string {
  return color.replace(/^#/, '')
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/export/textRun.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Typecheck and lint**

Run: `npx tsc -b && npm run lint`
Expected: both silent.

- [ ] **Step 6: Commit**

```bash
git add src/export/textRun.ts src/export/textRun.test.ts
git commit -F - <<'EOF'
Add text and style mapping for PPTX export

CSS font stacks reduce to a single PowerPoint face, rem sizes convert to
points through one constant so the theme's scale ratios survive, and
`textSegments` is reshaped into pptxgenjs rich-text runs rather than
mark resolution being reimplemented.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HHKjz4g35yxMuXNS3rvbea
EOF
```

---

### Task 3: Share the star generator

**Files:**
- Modify: `src/lib/celestial.ts:130-152` (the body of `starFieldCss`)

**Interfaces:**
- Produces:
  - `export interface Star { x: number; y: number; radius: number; alpha: number }`
  - `export function starPositions(seed: string, field: StarField): Star[]`
  - `starFieldCss(seed, field)` keeps its exact current signature and output.

Right now `starFieldCss` runs its seeded generator and formats a CSS string in the same loop, so the SVG emitter in Task 5 would have to reimplement the generator to produce the same sky. Splitting the generator out means the exported sky *cannot* differ from the on-screen one — it is one generator with two encodings.

**The critical constraint: the sequence of `rand()` calls must not change.** In the current loop, a star rejected by `avoidCenter` consumes exactly two `rand()` values (x and y) and returns to the top *before* radius and alpha are drawn. Hoisting the radius/alpha draws above the `continue` would shift every subsequent value and silently reshuffle all five themes' skies.

- [ ] **Step 1: Confirm the existing tests pass before touching anything**

Run: `npx vitest run src/lib/celestial.test.ts`
Expected: PASS. These assert star count, determinism per seed, circular radii, opacity bounds and the centre keep-out — they exercise behaviour rather than a golden string, so they cover this refactor as written and need no changes.

- [ ] **Step 2: Capture the current output as a temporary guard**

Add this test to the bottom of `src/lib/celestial.test.ts`, inside the existing `describe('starFieldCss', ...)` block:

```ts
  // Temporary refactor guard — pins the exact string across the starPositions
  // extraction, then is deleted. Not a test worth keeping: it would fail on any
  // deliberate formatting change with nothing useful to say about why.
  it('REFACTOR GUARD: output is byte-identical', () => {
    expect(starFieldCss('midnight', { ...FIELD, avoidCenter: true })).toMatchSnapshot()
  })
```

- [ ] **Step 3: Record the snapshot against the un-refactored code**

Run: `npx vitest run src/lib/celestial.test.ts -u`
Expected: PASS, and `src/lib/__snapshots__/celestial.test.ts.snap` is created.

- [ ] **Step 4: Do the extraction**

In `src/lib/celestial.ts`, replace the whole `starFieldCss` function (currently at lines 130-152) with:

```ts
/** One star's placement, in the units both encodings need: position as a percentage, radius in px. */
export interface Star {
  x: number
  y: number
  radius: number
  alpha: number
}

/**
 * The seeded sky: where the stars are, how big, and how bright.
 *
 * Split out from `starFieldCss` so the PPTX export's SVG backdrop can draw the
 * *same* sky rather than reimplementing the generator and drifting from it.
 * One generator, two encodings — CSS gradients on screen, `<circle>` elements
 * in the export.
 *
 * The order of `rand()` calls is load-bearing. A star rejected by
 * `avoidCenter` consumes exactly its x and y draws and no more; drawing radius
 * and alpha before that rejection would shift every later value and reshuffle
 * all five themes' skies.
 */
export function starPositions(seed: string, field: StarField): Star[] {
  const rand = mulberry32(hashSeed(seed))
  const stars: Star[] = []

  // Bounded: a rejected position costs one draw, and the keep-out zone leaves
  // most of the card available, so this terminates well inside the cap.
  let attempts = 0
  while (stars.length < field.count && attempts < field.count * 12) {
    attempts++
    const x = rand() * 100
    const y = rand() * 100
    if (field.avoidCenter && inCenter(x, y)) continue

    // Uniform stars read as a printed pattern; varying radius and brightness
    // together is what makes the field look like a sky.
    stars.push({
      x,
      y,
      radius: 0.5 + rand() * (field.maxRadiusPx - 0.5),
      alpha: field.opacity * (0.35 + rand() * 0.65),
    })
  }

  return stars
}

/**
 * Builds a star field as a single `background-image` value: one soft
 * `radial-gradient` circle per star.
 *
 * `circle <r>px` keeps every star round no matter how tall the card grows,
 * which a percentage-sized gradient would not.
 */
export function starFieldCss(seed: string, field: StarField): string {
  return starPositions(seed, field)
    .map(
      ({ x, y, radius, alpha }) =>
        `radial-gradient(circle ${radius.toFixed(2)}px at ${x.toFixed(2)}% ${y.toFixed(2)}%, ` +
        `${withAlpha(field.color, alpha)} 0%, transparent 100%)`,
    )
    .join(', ')
}
```

- [ ] **Step 5: Run the tests — the snapshot must still match**

Run: `npx vitest run src/lib/celestial.test.ts`
Expected: PASS with no snapshot mismatch. A mismatch here means the `rand()` call order changed — re-read Step 4's ordering note before doing anything else. Do **not** re-record the snapshot to make it pass.

- [ ] **Step 6: Delete the guard**

Remove the `REFACTOR GUARD` test from `src/lib/celestial.test.ts` and delete `src/lib/__snapshots__/celestial.test.ts.snap`.

Run: `npx vitest run src/lib/celestial.test.ts`
Expected: PASS, back to the original test count.

- [ ] **Step 7: Typecheck and lint**

Run: `npx tsc -b && npm run lint`
Expected: both silent.

- [ ] **Step 8: Commit**

```bash
git add src/lib/celestial.ts src/lib/celestial.test.ts
git commit -F - <<'EOF'
Extract starPositions from starFieldCss

The PPTX export needs the same sky as SVG circles rather than CSS
gradients. Sharing the generator makes drift impossible; reimplementing
it would not. `starFieldCss` output is unchanged — the order of rand()
draws, including the two a rejected star consumes, is preserved exactly.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HHKjz4g35yxMuXNS3rvbea
EOF
```

---

### Task 4: Parse the glow gradients

**Files:**
- Create: `src/export/backdrop/glow.ts`
- Test: `src/export/backdrop/glow.test.ts`

**Interfaces:**
- Consumes: `BUILTIN_THEMES` from `@/lib/theme-tokens` (test only).
- Produces:
  - `export interface GlowStop { r: number; g: number; b: number; a: number; offset: number }`
  - `export interface GlowLayer { rx: number; ry: number; cx: number; cy: number; from: GlowStop; to: GlowStop }`
  - `export function parseGlowLayer(layer: string): GlowLayer | null`
  - `export function parseGlow(glow: string): GlowLayer[]`
  - `export function glowGradientSvg(layer: GlowLayer, id: string): string`

`celestial.glow` is an opaque CSS string authored per theme. All 17 gradient layers across the five themes share one grammar:

```
radial-gradient(W% H% at X% Y%, rgba(r,g,b,a) P%, rgba(r,g,b,0) Q%)
```

An unparseable layer is **skipped, not thrown**: a plainer background beats a failed export.

- [ ] **Step 1: Write the failing test**

Create `src/export/backdrop/glow.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { glowGradientSvg, parseGlow, parseGlowLayer } from './glow'
import { BUILTIN_THEMES } from '@/lib/theme-tokens'

const LAYER = 'radial-gradient(120% 80% at 80% -12%, rgba(169,163,255,0.30) 0%, rgba(169,163,255,0) 58%)'

describe('parseGlowLayer', () => {
  it('reads radii, centre and both stops', () => {
    const parsed = parseGlowLayer(LAYER)
    expect(parsed).toEqual({
      rx: 120,
      ry: 80,
      cx: 80,
      cy: -12,
      from: { r: 169, g: 163, b: 255, a: 0.3, offset: 0 },
      to: { r: 169, g: 163, b: 255, a: 0, offset: 58 },
    })
  })

  it('returns null rather than throwing on a shape it cannot read', () => {
    expect(parseGlowLayer('linear-gradient(red, blue)')).toBeNull()
    expect(parseGlowLayer('')).toBeNull()
    // Zero horizontal radius would divide by zero building the transform.
    expect(parseGlowLayer('radial-gradient(0% 80% at 50% 50%, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 50%)')).toBeNull()
  })
})

describe('parseGlow', () => {
  it('splits on top-level commas, not the ones inside rgba()', () => {
    expect(parseGlow([LAYER, LAYER].join(', '))).toHaveLength(2)
  })

  it('drops unreadable layers and keeps the rest', () => {
    expect(parseGlow([LAYER, 'linear-gradient(red, blue)'].join(', '))).toHaveLength(1)
  })

  // The reason this test exists: it is what catches someone later authoring a
  // glow in a shape the parser cannot read.
  it('reads every layer of every built-in theme', () => {
    for (const theme of BUILTIN_THEMES) {
      const source = theme.celestial.glow
      const expected = source.split('radial-gradient').length - 1
      expect(parseGlow(source), theme.id).toHaveLength(expected)
    }
  })
})

describe('glowGradientSvg', () => {
  it('emits a radialGradient whose transform stretches the circle to the CSS ellipse', () => {
    const svg = glowGradientSvg(parseGlowLayer(LAYER)!, 'glow0')
    expect(svg).toContain('id="glow0"')
    expect(svg).toContain('r="1.2"')
    // ry/rx = 80/120
    expect(svg).toContain('scale(1,0.6667)')
    expect(svg).toContain('stop-opacity="0.3"')
    expect(svg).toContain('stop-opacity="0"')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/export/backdrop/glow.test.ts`
Expected: FAIL — `Failed to resolve import "./glow"`.

- [ ] **Step 3: Write the implementation**

Create `src/export/backdrop/glow.ts`:

```ts
/*
  `celestial.glow` is an opaque CSS string authored per theme, and the export
  needs it as SVG. Rather than approximate it, this parses it: all seventeen
  gradient layers across the five built-in themes share one grammar —

    radial-gradient(W% H% at X% Y%, rgba(r,g,b,a) P%, rgba(r,g,b,0) Q%)

  which is narrow enough to read exactly. `glow.test.ts` asserts every built-in
  theme parses, which is also what catches a future glow authored in a shape
  this cannot read.

  Nothing here throws. A layer that does not parse is dropped, because a
  slightly plainer background is a far better outcome than a failed export.
*/

export interface GlowStop {
  r: number
  g: number
  b: number
  a: number
  /** Percentage along the gradient, 0-100. */
  offset: number
}

export interface GlowLayer {
  /** Horizontal radius, as a percentage of the box width. */
  rx: number
  /** Vertical radius, as a percentage of the box height. */
  ry: number
  /** Centre, as percentages. May be negative or above 100 — several themes anchor a glow off-canvas on purpose. */
  cx: number
  cy: number
  from: GlowStop
  to: GlowStop
}

const LAYER_RE =
  /^radial-gradient\(\s*([\d.]+)%\s+([\d.]+)%\s+at\s+(-?[\d.]+)%\s+(-?[\d.]+)%\s*,\s*(.+)\)$/
const STOP_RE = /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)\s+([\d.]+)%$/

/**
 * Splits on commas that are not inside parentheses.
 *
 * A plain `split(',')` would cut every `rgba(r, g, b, a)` into pieces, which is
 * why this exists rather than the one-liner.
 */
function splitTopLevel(value: string): string[] {
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < value.length; i++) {
    const ch = value[i]
    if (ch === '(') depth++
    else if (ch === ')') depth--
    else if (ch === ',' && depth === 0) {
      parts.push(value.slice(start, i).trim())
      start = i + 1
    }
  }
  parts.push(value.slice(start).trim())
  return parts.filter((part) => part.length > 0)
}

function parseStop(raw: string): GlowStop | null {
  const match = STOP_RE.exec(raw.trim())
  if (!match) return null
  return {
    r: Number(match[1]),
    g: Number(match[2]),
    b: Number(match[3]),
    a: Number(match[4]),
    offset: Number(match[5]),
  }
}

/** One `radial-gradient(...)` layer, or `null` if it is not the shape above. */
export function parseGlowLayer(layer: string): GlowLayer | null {
  const match = LAYER_RE.exec(layer.trim())
  if (!match) return null

  const rx = Number(match[1])
  const ry = Number(match[2])
  // rx is the divisor building the SVG transform, so a zero would produce a
  // NaN scale and a gradient that silently renders as nothing.
  if (rx <= 0) return null

  const stops = splitTopLevel(match[5])
  if (stops.length !== 2) return null
  const from = parseStop(stops[0])
  const to = parseStop(stops[1])
  if (!from || !to) return null

  return { rx, ry, cx: Number(match[3]), cy: Number(match[4]), from, to }
}

/** Every readable layer of a theme's glow, outermost first, in CSS paint order. */
export function parseGlow(glow: string): GlowLayer[] {
  return splitTopLevel(glow)
    .map(parseGlowLayer)
    .filter((layer): layer is GlowLayer => layer !== null)
}

function stopSvg(stop: GlowStop, offset: number): string {
  return (
    `<stop offset="${offset}" stop-color="rgb(${stop.r},${stop.g},${stop.b})" ` +
    `stop-opacity="${stop.a}"/>`
  )
}

/**
 * One `<radialGradient>` matching a CSS radial-gradient layer.
 *
 * Left in `objectBoundingBox` units on purpose: in that space an x-fraction is
 * a fraction of the width and a y-fraction a fraction of the height, which is
 * exactly what CSS's `W% H%` means. So `r = rx/100` already gives the correct
 * horizontal radius, and a `scale(1, ry/rx)` about the centre stretches it to
 * the correct vertical one.
 */
export function glowGradientSvg(layer: GlowLayer, id: string): string {
  const cx = layer.cx / 100
  const cy = layer.cy / 100
  const r = layer.rx / 100
  const yScale = Number((layer.ry / layer.rx).toFixed(4))
  const transform = `translate(${cx},${cy}) scale(1,${yScale}) translate(${-cx},${-cy})`
  return (
    `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}" gradientTransform="${transform}">` +
    stopSvg(layer.from, layer.from.offset / 100) +
    stopSvg(layer.to, layer.to.offset / 100) +
    `</radialGradient>`
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/export/backdrop/glow.test.ts`
Expected: PASS, 6 tests. If the "reads every layer of every built-in theme" case fails, the failure message names the theme id — widen `LAYER_RE` or `STOP_RE` to cover that theme's actual shape rather than loosening the test.

- [ ] **Step 5: Typecheck and lint**

Run: `npx tsc -b && npm run lint`
Expected: both silent.

- [ ] **Step 6: Commit**

```bash
git add src/export/backdrop/glow.ts src/export/backdrop/glow.test.ts
git commit -F - <<'EOF'
Parse theme glow gradients into SVG radial gradients

All seventeen layers across the five themes share one CSS grammar,
narrow enough to read exactly rather than approximate. A layer that does
not parse is dropped, never thrown — a plainer background beats a failed
export.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HHKjz4g35yxMuXNS3rvbea
EOF
```

---

### Task 5: Emit the backdrop SVG

**Files:**
- Create: `src/export/backdrop/celestialSvg.ts`
- Test: `src/export/backdrop/celestialSvg.test.ts`

**Interfaces:**
- Consumes: `starPositions` from `@/lib/celestial` (Task 3); `parseGlow`, `glowGradientSvg` from `./glow` (Task 4); `ThemeTokens`, `BUILTIN_THEMES` from `@/lib/theme-tokens`.
- Produces:
  - `export const BACKDROP_WIDTH = 1920`
  - `export const BACKDROP_HEIGHT = 1080`
  - `export function celestialSvg(theme: ThemeTokens): string`

Layer order is copied from `components/theme/SlideBackdrop.tsx` so the two can be compared by eye: glow, grid, orbits, bodies, stars, constellation.

The fixed 16:9 canvas removes three workarounds `SlideBackdrop` carries only because cards have no fixed aspect ratio — no `preserveAspectRatio="none"`, no `aspect-ratio: 1` juggling, no `vector-effect="non-scaling-stroke"` — and lets the constellation's vertex dots be real `<circle>`s in the same SVG instead of separate positioned divs.

- [ ] **Step 1: Write the failing test**

Create `src/export/backdrop/celestialSvg.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { BACKDROP_HEIGHT, BACKDROP_WIDTH, celestialSvg } from './celestialSvg'
import { BUILTIN_THEMES, DEFAULT_THEME } from '@/lib/theme-tokens'

function themeById(id: string) {
  const found = BUILTIN_THEMES.find((t) => t.id === id)
  if (!found) throw new Error(`no theme ${id}`)
  return found
}

describe('celestialSvg', () => {
  it('emits a self-contained svg at the fixed backdrop size', () => {
    const svg = celestialSvg(DEFAULT_THEME)
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain(`viewBox="0 0 ${BACKDROP_WIDTH} ${BACKDROP_HEIGHT}"`)
    expect(svg.endsWith('</svg>')).toBe(true)
  })

  it('carries no external reference that could taint a canvas', () => {
    for (const theme of BUILTIN_THEMES) {
      const svg = celestialSvg(theme)
      expect(svg, theme.id).not.toContain('http')
      expect(svg, theme.id).not.toContain('foreignObject')
      expect(svg, theme.id).not.toContain('<image')
    }
  })

  it('paints the theme background as the ground layer', () => {
    expect(celestialSvg(DEFAULT_THEME)).toContain(DEFAULT_THEME.colors.background)
  })

  it('is deterministic for a theme, so a re-export cannot reshuffle the sky', () => {
    expect(celestialSvg(DEFAULT_THEME)).toBe(celestialSvg(DEFAULT_THEME))
  })

  it('gives different themes different skies', () => {
    expect(celestialSvg(themeById('midnight'))).not.toBe(celestialSvg(themeById('sage')))
  })

  it('draws one circle per star', () => {
    const theme = themeById('midnight')
    const svg = celestialSvg(theme)
    const stars = svg.split('class="star"').length - 1
    expect(stars).toBe(theme.celestial.stars?.count)
  })

  /*
    The restraint rule: each theme uses two or three decorative kinds, never
    all of them, and that is what keeps five themes from reading as one theme
    in five palettes. `theme-tokens.test.ts` holds the line on the data; this
    holds it on the export, so a theme cannot declare one thing and export
    another.
  */
  it('emits exactly the decor kinds each theme declares, and no others', () => {
    for (const theme of BUILTIN_THEMES) {
      const svg = celestialSvg(theme)
      const decor = theme.celestial
      expect(svg.includes('class="grid"'), `${theme.id} grid`).toBe(Boolean(decor.grid))
      expect(svg.includes('class="orbit"'), `${theme.id} orbits`).toBe(Boolean(decor.orbits?.length))
      expect(svg.includes('class="body"'), `${theme.id} bodies`).toBe(Boolean(decor.bodies?.length))
      expect(svg.includes('class="star"'), `${theme.id} stars`).toBe(Boolean(decor.stars))
      expect(svg.includes('class="constellation"'), `${theme.id} constellation`).toBe(
        Boolean(decor.constellation),
      )
    }
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/export/backdrop/celestialSvg.test.ts`
Expected: FAIL — `Failed to resolve import "./celestialSvg"`.

- [ ] **Step 3: Write the implementation**

Create `src/export/backdrop/celestialSvg.ts`:

```ts
import type { ThemeTokens } from '@/lib/theme-tokens'
import { starPositions } from '@/lib/celestial'
import { glowGradientSvg, parseGlow } from './glow'

/*
  The deck theme's celestial backdrop, as one self-contained SVG sized for a
  PowerPoint slide.

  Layer order is copied from `components/theme/SlideBackdrop.tsx` — glow, grid,
  orbits, bodies, stars, constellation — so the two can be compared by eye. Both
  read the same `CelestialDecor` object, which is what keeps them from drifting;
  the star field goes further and shares the generator outright
  (`starPositions`).

  Self-contained is load-bearing, not incidental: no external references, no
  `foreignObject`, no webfonts. That is what lets `rasterize.ts` draw this to a
  canvas without tainting it, and it is the whole reason the export builds its
  own SVG instead of screenshotting the live component.
*/

export const BACKDROP_WIDTH = 1920
export const BACKDROP_HEIGHT = 1080

/*
  The themes express stroke widths, star radii, blur and grid pitch in px
  against a card as it renders on screen — roughly 960px wide. This canvas is
  1920, so those quantities are doubled to keep their apparent size. Without
  this the stars would export at half the size they look in the editor.
*/
const PX_SCALE = 2

function esc(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** A percentage of the canvas width, in user units. */
function px(percent: number): number {
  return Number(((percent / 100) * BACKDROP_WIDTH).toFixed(2))
}

/** A percentage of the canvas height, in user units. */
function py(percent: number): number {
  return Number(((percent / 100) * BACKDROP_HEIGHT).toFixed(2))
}

function glowSvg(theme: ThemeTokens): { defs: string; rects: string } {
  const layers = parseGlow(theme.celestial.glow)
  const defs = layers.map((layer, i) => glowGradientSvg(layer, `glow${i}`)).join('')
  const rects = layers
    .map((_, i) => `<rect width="100%" height="100%" fill="url(#glow${i})"/>`)
    .join('')
  return { defs, rects }
}

function gridSvg(theme: ThemeTokens): string {
  const grid = theme.celestial.grid
  if (!grid) return ''
  const pitch = grid.sizePx * PX_SCALE
  const lines: string[] = []
  for (let x = pitch; x < BACKDROP_WIDTH; x += pitch) {
    lines.push(`<line x1="${x}" y1="0" x2="${x}" y2="${BACKDROP_HEIGHT}"/>`)
  }
  for (let y = pitch; y < BACKDROP_HEIGHT; y += pitch) {
    lines.push(`<line x1="0" y1="${y}" x2="${BACKDROP_WIDTH}" y2="${y}"/>`)
  }
  return (
    `<g class="grid" stroke="${esc(grid.color)}" stroke-width="${PX_SCALE}" ` +
    `opacity="${grid.opacity}">${lines.join('')}</g>`
  )
}

function orbitsSvg(theme: ThemeTokens): string {
  const orbits = theme.celestial.orbits
  if (!orbits?.length) return ''
  return orbits
    .map((orbit) => {
      // `size` is a width percentage and the on-screen ring is forced circular
      // by `aspect-ratio: 1`, so the radius comes off the width on both axes.
      const r = px(orbit.size) / 2
      const width = (orbit.widthPx ?? 1) * PX_SCALE
      const dash = orbit.dashed ? ` stroke-dasharray="${width * 4},${width * 4}"` : ''
      return (
        `<circle class="orbit" cx="${px(orbit.cx)}" cy="${py(orbit.cy)}" r="${r}" fill="none" ` +
        `stroke="${esc(orbit.color)}" stroke-width="${width}" opacity="${orbit.opacity}"${dash}/>`
      )
    })
    .join('')
}

function bodiesSvg(theme: ThemeTokens): { defs: string; shapes: string } {
  const bodies = theme.celestial.bodies
  if (!bodies?.length) return { defs: '', shapes: '' }

  const defs: string[] = []
  const shapes = bodies
    .map((body, i) => {
      const r = px(body.size) / 2
      let filter = ''
      if (body.blurPx) {
        // `filterUnits="userSpaceOnUse"` with an explicit region: the default
        // bounding-box region clips a large blur back to 110% of the circle and
        // visibly crops the halo.
        const id = `blur${i}`
        const pad = body.blurPx * PX_SCALE * 3
        defs.push(
          `<filter id="${id}" filterUnits="userSpaceOnUse" ` +
            `x="${px(body.cx) - r - pad}" y="${py(body.cy) - r - pad}" ` +
            `width="${(r + pad) * 2}" height="${(r + pad) * 2}">` +
            `<feGaussianBlur stdDeviation="${body.blurPx * PX_SCALE}"/></filter>`,
        )
        filter = ` filter="url(#${id})"`
      }
      return (
        `<circle class="body" cx="${px(body.cx)}" cy="${py(body.cy)}" r="${r}" ` +
        `fill="${esc(body.fill)}" opacity="${body.opacity}"${filter}/>`
      )
    })
    .join('')

  return { defs: defs.join(''), shapes }
}

function starsSvg(theme: ThemeTokens): string {
  const field = theme.celestial.stars
  if (!field) return ''
  // Seeded on the theme id, exactly as the on-screen field is, so the exported
  // sky is the same sky.
  const stars = starPositions(theme.id, field)
  const circles = stars
    .map(
      (star) =>
        `<circle class="star" cx="${px(star.x)}" cy="${py(star.y)}" ` +
        `r="${(star.radius * PX_SCALE).toFixed(2)}" opacity="${star.alpha.toFixed(3)}"/>`,
    )
    .join('')
  return `<g fill="${esc(field.color)}">${circles}</g>`
}

function constellationSvg(theme: ThemeTokens): string {
  const constellation = theme.celestial.constellation
  if (!constellation) return ''

  const width = (constellation.widthPx ?? 1) * PX_SCALE
  const lines = constellation.paths
    .map((path) => {
      const points = path.map(([x, y]) => `${px(x)},${py(y)}`).join(' ')
      return `<polyline points="${points}"/>`
    })
    .join('')

  // On screen these dots are separate divs, because a circle inside a
  // `preserveAspectRatio="none"` viewBox would render as an ellipse. This
  // canvas has a fixed ratio and no such distortion, so they are ordinary
  // circles in the same SVG.
  const dots = constellation.paths
    .flatMap((path) => path)
    .map(([x, y]) => `<circle cx="${px(x)}" cy="${py(y)}" r="${1.5 * PX_SCALE}"/>`)
    .join('')

  return (
    `<g class="constellation" opacity="${constellation.opacity}">` +
    `<g fill="none" stroke="${esc(constellation.color)}" stroke-width="${width}" ` +
    `stroke-linecap="round" stroke-linejoin="round">${lines}</g>` +
    `<g fill="${esc(constellation.color)}">${dots}</g>` +
    `</g>`
  )
}

/** The theme's backdrop as one self-contained SVG document string. */
export function celestialSvg(theme: ThemeTokens): string {
  const glow = glowSvg(theme)
  const bodies = bodiesSvg(theme)

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${BACKDROP_WIDTH}" height="${BACKDROP_HEIGHT}" ` +
    `viewBox="0 0 ${BACKDROP_WIDTH} ${BACKDROP_HEIGHT}">` +
    `<defs>${glow.defs}${bodies.defs}</defs>` +
    `<rect width="100%" height="100%" fill="${esc(theme.colors.background)}"/>` +
    glow.rects +
    gridSvg(theme) +
    orbitsSvg(theme) +
    bodies.shapes +
    starsSvg(theme) +
    constellationSvg(theme) +
    `</svg>`
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/export/backdrop/celestialSvg.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Run the full suite — Task 3's refactor is exercised here**

Run: `npm run test`
Expected: PASS, all files.

- [ ] **Step 6: Typecheck and lint**

Run: `npx tsc -b && npm run lint`
Expected: both silent.

- [ ] **Step 7: Commit**

```bash
git add src/export/backdrop/celestialSvg.ts src/export/backdrop/celestialSvg.test.ts
git commit -F - <<'EOF'
Emit the celestial backdrop as a self-contained SVG

Same layer order and same CelestialDecor data as SlideBackdrop, with the
star field sharing its generator outright. The fixed 16:9 canvas drops
the three aspect-ratio workarounds the on-screen version needs, and no
external reference means the raster step cannot taint a canvas.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HHKjz4g35yxMuXNS3rvbea
EOF
```

---

### Task 6: Rasterize the backdrop

**Files:**
- Create: `src/export/backdrop/rasterize.ts`

**Interfaces:**
- Consumes: `celestialSvg`, `BACKDROP_WIDTH`, `BACKDROP_HEIGHT` from `./celestialSvg` (Task 5).
- Produces:
  - `export function svgToPngDataUrl(svg: string, width: number, height: number): Promise<string>`
  - `export function backdropPng(theme: ThemeTokens): Promise<string>`

No unit test: this is `Image` and `canvas`, and Vitest runs in the node environment (`vite.config.ts`) where neither exists. That is the same line `CLAUDE.md` already draws around DOM code. It is verified by hand in Step 3.

- [ ] **Step 1: Write the implementation**

Create `src/export/backdrop/rasterize.ts`:

```ts
import type { ThemeTokens } from '@/lib/theme-tokens'
import { BACKDROP_HEIGHT, BACKDROP_WIDTH, celestialSvg } from './celestialSvg'

/*
  SVG string to PNG data URL, through an <img> and a <canvas>.

  This is the only file in `src/export/` that touches the DOM, and it is
  deliberately the whole of it: everything upstream is a pure string builder,
  so the fragile part is one function with one job.

  The SVG produced by `celestialSvg` is fully self-contained — no external
  references, no `foreignObject`, no webfonts — which is what guarantees the
  canvas is never tainted and `toDataURL` cannot throw a security error. That
  guarantee is the reason the export builds its own SVG rather than
  screenshotting the live `SlideBackdrop`.
*/
export function svgToPngDataUrl(svg: string, width: number, height: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image()

    image.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Could not get a 2D canvas context to render the backdrop'))
        return
      }
      ctx.drawImage(image, 0, 0, width, height)
      resolve(canvas.toDataURL('image/png'))
    }

    image.onerror = () => reject(new Error('The backdrop SVG could not be rendered'))

    // A data URL rather than a blob URL: nothing to revoke, and no window in
    // which the object URL could be collected before `onload` fires.
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  })
}

/** The theme's backdrop as a PNG data URL, sized for a 16:9 PowerPoint slide. */
export function backdropPng(theme: ThemeTokens): Promise<string> {
  return svgToPngDataUrl(celestialSvg(theme), BACKDROP_WIDTH, BACKDROP_HEIGHT)
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc -b && npm run lint`
Expected: both silent.

- [ ] **Step 3: Verify by hand in the browser**

Run: `npm run dev`, open `http://localhost:5173`, sign in, open any deck, and in the DevTools console:

```js
const { backdropPng } = await import('/src/export/backdrop/rasterize.ts')
const { BUILTIN_THEMES } = await import('/src/lib/theme-tokens.ts')
for (const theme of BUILTIN_THEMES) {
  const url = await backdropPng(theme)
  console.log(theme.name, url.length)
  const img = new Image(); img.src = url; img.style.width = '480px'
  document.body.prepend(img)
}
```

Expected: five images prepended to the page. Each must show that theme's own decoration — Moonlight a moon and sparse stars, Cosmic Observatory a chart grid with constellations and orbital arcs, Deep Space overlapping nebulae and a dense star field, Solar Flare a corner corona with rings, Aurora bands over a planet's limb. Compare each against the editor canvas behind it. A blank or solid-colour result means the SVG failed to load — check the console for the `onerror` rejection.

- [ ] **Step 4: Commit**

```bash
git add src/export/backdrop/rasterize.ts
git commit -F - <<'EOF'
Rasterize the backdrop SVG to a PNG data URL

The one DOM-touching file in src/export/, kept to a single function.
The SVG is self-contained, so the canvas cannot be tainted and
toDataURL cannot throw on a security error.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HHKjz4g35yxMuXNS3rvbea
EOF
```

---

### Task 7: Slide renderers and the writer

**Files:**
- Create: `src/export/slideRenderers.ts`
- Create: `src/export/pptx.ts`
- Modify: `package.json` (add `pptxgenjs`)

**Interfaces:**
- Consumes: `PptxGroup`, `slideGroup` (Task 1); `PptxTextRun`, `faceName`, `hex`, `markedRuns`, `pointSize`, `resolveRunStyle` (Task 2); `backdropPng` (Task 6); `mergeTextStyle` from `@/engine/textStyle`; `textRef` from `@/engine/marks`.
- Produces:
  - `export interface PptxSlide { addText(...): void; addShape(...): void; background?: unknown }`
  - `export const RENDERERS: Record<PptxGroup, SlideRenderer>`
  - `export function pptxFileName(title: string): string`
  - `export async function exportDeckToPptx(deck: ExportableDeck): Promise<void>`
  - `export interface ExportableDeck { title: string; theme: ThemeTokens; textStyle: TextStyle; cards: Card[] }`

No unit test for either file: `pptx.ts` drives a binary writer and a download, and the renderers only have meaning as the file PowerPoint opens. Verified by hand in Step 6. `PptxSlide` is a structural interface written here rather than imported from `pptxgenjs`, which keeps the library's types out of the renderer signatures and leaves the writer swappable.

- [ ] **Step 1: Add the dependency**

Run: `npm install pptxgenjs@4.0.1`
Expected: `package.json` gains `"pptxgenjs": "^4.0.1"` under `dependencies`.

- [ ] **Step 2: Write the renderers**

Create `src/export/slideRenderers.ts`:

```ts
import type { Card, ContentBlock } from '@/engine/contentBlocks'
import type { ThemeTokens } from '@/lib/theme-tokens'
import type { TextStyle } from '@/engine/textStyle'
import { textRef } from '@/engine/marks'
import type { PptxTextRun } from './textRun'
import { faceName, hex, markedRuns, pointSize, resolveRunStyle } from './textRun'
import type { PptxGroup } from './slideGroup'

/*
  The five slide arrangements, as native PowerPoint text boxes and shapes.

  `PptxSlide` is a structural interface rather than pptxgenjs's own `Slide`
  type: the renderers then depend on the shape they use and not on the library,
  which keeps the writer swappable and honours the module rule that pptxgenjs
  stays inside `pptx.ts`.
*/
export interface PptxSlide {
  addText(text: string | PptxTextRun[], options: Record<string, unknown>): void
  addShape(shape: string, options: Record<string, unknown>): void
}

export type SlideRenderer = (
  slide: PptxSlide,
  card: Card,
  theme: ThemeTokens,
  /** Already `mergeTextStyle(deckStyle, card.textStyle)` — the run's own inline style is applied per run. */
  style: TextStyle,
) => void

/* LAYOUT_16x9 in inches. */
const SLIDE_W = 10
const SLIDE_H = 5.625
const MARGIN = 0.6
const CONTENT_W = SLIDE_W - MARGIN * 2

/** Index into `theme.typography.scale`. */
const H1 = 0
const H2 = 1
const H3 = 2
const BODY = 3

function headingFace(theme: ThemeTokens, style: TextStyle): string {
  return faceName(style.fontFamily ?? theme.typography.headingFont)
}

function bodyFace(theme: ThemeTokens, style: TextStyle): string {
  return faceName(style.fontFamily ?? theme.typography.bodyFont)
}

/** The card's heading text. The generation schema guarantees block 0 is a heading. */
function headingText(card: Card): string {
  const first = card.blocks[0]
  return first?.type === 'heading' ? first.text : ''
}

/** Marks stored for one run of text, or undefined if nobody formatted it. */
function marksFor(card: Card, ref: string) {
  return card.inline?.[ref]?.marks
}

/** The merged style for one run, with its own inline overrides on top. */
function styleFor(card: Card, ref: string, style: TextStyle): TextStyle {
  return resolveRunStyle(style, card.inline?.[ref]?.style)
}

function firstOfType<T extends ContentBlock['type']>(
  card: Card,
  type: T,
): { block: Extract<ContentBlock, { type: T }>; index: number } | null {
  for (let i = 0; i < card.blocks.length; i++) {
    const block = card.blocks[i]
    if (block.type === type) return { block: block as Extract<ContentBlock, { type: T }>, index: i }
  }
  return null
}

/** The heading, plus a thin accent rule under it. Shared by every renderer that has one. */
function addHeading(slide: PptxSlide, card: Card, theme: ThemeTokens, style: TextStyle) {
  const ref = textRef(0, 'text')
  const runStyle = styleFor(card, ref, style)
  slide.addText(markedRuns(headingText(card), marksFor(card, ref)), {
    x: MARGIN,
    y: MARGIN,
    w: CONTENT_W,
    h: 0.9,
    fontFace: headingFace(theme, runStyle),
    fontSize: pointSize(theme.typography.scale[H2], runStyle.fontScale),
    color: hex(theme.colors.foreground),
    bold: runStyle.bold ?? true,
    italic: runStyle.italic,
    align: runStyle.align ?? 'left',
    valign: 'middle',
  })
  slide.addShape('rect', {
    x: MARGIN,
    y: MARGIN + 0.95,
    w: 1.2,
    h: 0.045,
    fill: { color: hex(theme.colors.accent) },
  })
}

/* ---------------------------------------------------------------- title --- */

/**
 * `hero` and `textFocus`: the heading is the slide.
 *
 * A card with no paragraph renders the heading alone rather than leaving a gap
 * where a subtitle would be, so the block sits centred either way.
 */
const renderTitle: SlideRenderer = (slide, card, theme, style) => {
  const paragraph = firstOfType(card, 'paragraph')
  const headingRef = textRef(0, 'text')
  const headingStyle = styleFor(card, headingRef, style)

  slide.addText(markedRuns(headingText(card), marksFor(card, headingRef)), {
    x: MARGIN,
    y: paragraph ? 1.6 : 2.0,
    w: CONTENT_W,
    h: 1.6,
    fontFace: headingFace(theme, headingStyle),
    fontSize: pointSize(theme.typography.scale[H1], headingStyle.fontScale),
    color: hex(theme.colors.foreground),
    bold: headingStyle.bold ?? true,
    italic: headingStyle.italic,
    align: headingStyle.align ?? 'center',
    valign: 'middle',
  })

  if (paragraph) {
    const ref = textRef(paragraph.index, 'text')
    const runStyle = styleFor(card, ref, style)
    slide.addText(markedRuns(paragraph.block.text, marksFor(card, ref)), {
      x: MARGIN + 0.8,
      y: 3.3,
      w: CONTENT_W - 1.6,
      h: 1.0,
      fontFace: bodyFace(theme, runStyle),
      fontSize: pointSize(theme.typography.scale[H3], runStyle.fontScale),
      color: hex(theme.colors.muted),
      italic: runStyle.italic,
      align: runStyle.align ?? 'center',
      valign: 'top',
    })
  }
}

/* ----------------------------------------------------------------- body --- */

interface BulletLine {
  text: string
  bullet: boolean
  indent: number
  /**
   * The run this line came from, when it came from exactly one.
   *
   * `null` for composite lines — a stat's `value — label`, a timeline step's
   * `label — text` — because they join two separately-addressed runs and there
   * is no single ref whose marks apply. Accepted limitation: bold inside those
   * two block types is dropped in the export.
   */
  ref: string | null
}

/**
 * Every block after the heading, as one flat list of lines.
 *
 * The six layouts that group into `body` differ on screen mainly in how they
 * arrange the same content, and PowerPoint gets the content: a bullet list is
 * the arrangement that survives translation without inventing structure the
 * card does not have.
 */
function flattenBlocks(card: Card): BulletLine[] {
  const lines: BulletLine[] = []

  card.blocks.forEach((block, i) => {
    if (i === 0 && block.type === 'heading') return // rendered by addHeading

    switch (block.type) {
      case 'heading':
      case 'paragraph':
        lines.push({ text: block.text, bullet: false, indent: 0, ref: textRef(i, 'text') })
        break
      case 'bulletList':
        block.items.forEach((item, j) => {
          lines.push({ text: item, bullet: true, indent: 0, ref: textRef(i, 'items', j) })
        })
        break
      case 'stat':
        lines.push({ text: `${block.value} — ${block.label}`, bullet: true, indent: 0, ref: null })
        break
      case 'quote':
        lines.push({
          text: block.attribution ? `“${block.text}” — ${block.attribution}` : `“${block.text}”`,
          bullet: false,
          indent: 0,
          ref: block.attribution ? null : textRef(i, 'text'),
        })
        break
      case 'timelineStep':
        lines.push({ text: `${block.label} — ${block.text}`, bullet: true, indent: 0, ref: null })
        break
      case 'comparisonGroup':
        lines.push({ text: block.heading, bullet: false, indent: 0, ref: textRef(i, 'heading') })
        block.items.forEach((item, j) => {
          lines.push({ text: item, bullet: true, indent: 1, ref: textRef(i, 'items', j) })
        })
        break
      case 'image':
        // An image has nothing to draw here, so its alt text stands in for it.
        // With no alt there is nothing worth saying — a bullet reading "image"
        // is worse than no bullet.
        if (block.alt) lines.push({ text: block.alt, bullet: true, indent: 0, ref: null })
        break
    }
  })

  return lines
}

/**
 * One flattened line as pptxgenjs runs.
 *
 * A line can split into several runs when it carries marks, so the
 * line-level options have to land on specific runs: `bullet`/`indentLevel` on
 * the first (they describe the paragraph, and repeating them would emit one
 * bullet per run) and `breakLine` on the last (it ends the paragraph).
 */
function runsForLine(line: BulletLine, card: Card, isLast: boolean): PptxTextRun[] {
  const runs = markedRuns(line.text, line.ref ? marksFor(card, line.ref) : undefined)
  return runs.map((run, i) => {
    const options = { ...run.options }
    if (i === 0) {
      options.bullet = line.bullet
      options.indentLevel = line.indent
    }
    if (i === runs.length - 1 && !isLast) options.breakLine = true
    return { text: run.text, options }
  })
}

const renderBody: SlideRenderer = (slide, card, theme, style) => {
  addHeading(slide, card, theme, style)

  const lines = flattenBlocks(card)
  if (lines.length === 0) return

  const runs = lines.flatMap((line, i) => runsForLine(line, card, i === lines.length - 1))

  slide.addText(runs, {
    x: MARGIN,
    y: MARGIN + 1.2,
    w: CONTENT_W,
    h: SLIDE_H - MARGIN * 2 - 1.2,
    fontFace: bodyFace(theme, style),
    fontSize: pointSize(theme.typography.scale[BODY], style.fontScale),
    color: hex(theme.colors.foreground),
    align: style.align ?? 'left',
    valign: 'top',
    lineSpacingMultiple: theme.typography.lineHeight,
    // Long cards must not spill off the slide; shrinking is less bad than
    // truncating content the user can no longer see.
    fit: 'shrink',
  })
}

/* ----------------------------------------------------------------- stat --- */

const MAX_STAT_COLUMNS = 4

/**
 * `statHero` and `statGrid`: the numbers are the point, so they get the size.
 *
 * A single stat lands centred and very large; several lay out in rows of at
 * most four, wrapping beyond that rather than shrinking indefinitely.
 */
const renderStat: SlideRenderer = (slide, card, theme, style) => {
  addHeading(slide, card, theme, style)

  const stats: { value: string; label: string; index: number }[] = []
  card.blocks.forEach((block, i) => {
    if (block.type === 'stat') stats.push({ value: block.value, label: block.label, index: i })
  })
  if (stats.length === 0) return

  const columns = Math.min(stats.length, MAX_STAT_COLUMNS)
  const rows = Math.ceil(stats.length / columns)
  const cellW = CONTENT_W / columns
  const areaY = MARGIN + 1.35
  const areaH = SLIDE_H - areaY - MARGIN
  const cellH = areaH / rows
  const single = stats.length === 1

  stats.forEach((stat, i) => {
    const col = i % columns
    const row = Math.floor(i / columns)
    const x = MARGIN + col * cellW
    const y = areaY + row * cellH

    const valueRef = textRef(stat.index, 'value')
    const valueStyle = styleFor(card, valueRef, style)
    slide.addText(markedRuns(stat.value, marksFor(card, valueRef)), {
      x,
      y,
      w: cellW,
      h: cellH * 0.62,
      fontFace: headingFace(theme, valueStyle),
      fontSize: pointSize(theme.typography.scale[single ? H1 : H2], valueStyle.fontScale),
      color: hex(theme.colors.accent),
      bold: valueStyle.bold ?? true,
      align: 'center',
      valign: 'bottom',
    })

    const labelRef = textRef(stat.index, 'label')
    const labelStyle = styleFor(card, labelRef, style)
    slide.addText(markedRuns(stat.label, marksFor(card, labelRef)), {
      x,
      y: y + cellH * 0.64,
      w: cellW,
      h: cellH * 0.3,
      fontFace: bodyFace(theme, labelStyle),
      fontSize: pointSize(theme.typography.scale[BODY], labelStyle.fontScale),
      color: hex(theme.colors.muted),
      align: 'center',
      valign: 'top',
    })
  })
}

/* --------------------------------------------------------------- twoCol --- */

/**
 * `comparison`: two groups side by side.
 *
 * A card carrying more than two groups renders the first two. The classifier
 * does not produce that today, but a renderer that threw on it would take the
 * whole export down over one slide.
 */
const renderTwoCol: SlideRenderer = (slide, card, theme, style) => {
  addHeading(slide, card, theme, style)

  const groups: { heading: string; items: string[]; index: number }[] = []
  card.blocks.forEach((block, i) => {
    if (block.type === 'comparisonGroup') {
      groups.push({ heading: block.heading, items: block.items, index: i })
    }
  })
  if (groups.length === 0) return

  const shown = groups.slice(0, 2)
  const gap = 0.4
  const colW = (CONTENT_W - gap) / 2
  const top = MARGIN + 1.35

  shown.forEach((group, i) => {
    const x = MARGIN + i * (colW + gap)

    const headingRef = textRef(group.index, 'heading')
    const headingStyle = styleFor(card, headingRef, style)
    slide.addText(markedRuns(group.heading, marksFor(card, headingRef)), {
      x,
      y: top,
      w: colW,
      h: 0.55,
      fontFace: headingFace(theme, headingStyle),
      fontSize: pointSize(theme.typography.scale[H3], headingStyle.fontScale),
      color: hex(theme.colors.accent),
      bold: headingStyle.bold ?? true,
      align: 'left',
      valign: 'middle',
    })

    const runs = group.items.flatMap((item, j) => {
      const ref = textRef(group.index, 'items', j)
      const marked = markedRuns(item, marksFor(card, ref))
      return marked.map((run, k) => {
        const options = { ...run.options }
        if (k === 0) options.bullet = true
        if (k === marked.length - 1 && j < group.items.length - 1) options.breakLine = true
        return { text: run.text, options }
      })
    })

    slide.addText(runs, {
      x,
      y: top + 0.6,
      w: colW,
      h: SLIDE_H - top - 0.6 - MARGIN,
      fontFace: bodyFace(theme, style),
      fontSize: pointSize(theme.typography.scale[BODY], style.fontScale),
      color: hex(theme.colors.foreground),
      align: 'left',
      valign: 'top',
      lineSpacingMultiple: theme.typography.lineHeight,
      fit: 'shrink',
    })
  })
}

/* ---------------------------------------------------------------- quote --- */

/** `quote`: the words fill the slide, attribution beneath, or nothing if it has none. */
const renderQuote: SlideRenderer = (slide, card, theme, style) => {
  const quote = firstOfType(card, 'quote')
  if (!quote) {
    renderBody(slide, card, theme, style)
    return
  }

  const textRefKey = textRef(quote.index, 'text')
  const quoteStyle = styleFor(card, textRefKey, style)
  slide.addText(markedRuns(`“${quote.block.text}”`, marksFor(card, textRefKey)), {
    x: MARGIN + 0.5,
    y: 1.2,
    w: CONTENT_W - 1.0,
    h: 2.6,
    fontFace: headingFace(theme, quoteStyle),
    fontSize: pointSize(theme.typography.scale[H3], quoteStyle.fontScale),
    color: hex(theme.colors.foreground),
    italic: quoteStyle.italic ?? true,
    align: quoteStyle.align ?? 'center',
    valign: 'middle',
    fit: 'shrink',
  })

  if (quote.block.attribution) {
    const attrRef = textRef(quote.index, 'attribution')
    const attrStyle = styleFor(card, attrRef, style)
    slide.addText(markedRuns(`— ${quote.block.attribution}`, marksFor(card, attrRef)), {
      x: MARGIN + 0.5,
      y: 4.0,
      w: CONTENT_W - 1.0,
      h: 0.6,
      fontFace: bodyFace(theme, attrStyle),
      fontSize: pointSize(theme.typography.scale[BODY], attrStyle.fontScale),
      color: hex(theme.colors.muted),
      align: attrStyle.align ?? 'center',
      valign: 'top',
    })
  }
}

export const RENDERERS: Record<PptxGroup, SlideRenderer> = {
  title: renderTitle,
  body: renderBody,
  stat: renderStat,
  twoCol: renderTwoCol,
  quote: renderQuote,
}
```

- [ ] **Step 3: Write the writer**

Create `src/export/pptx.ts`:

```ts
import type { Card } from '@/engine/contentBlocks'
import type { ThemeTokens } from '@/lib/theme-tokens'
import type { TextStyle } from '@/engine/textStyle'
import { mergeTextStyle } from '@/engine/textStyle'
import { slideGroup } from './slideGroup'
import { RENDERERS, type PptxSlide } from './slideRenderers'
import { backdropPng } from './backdrop/rasterize'
import { hex } from './textRun'

/*
  The one entry point. Takes a deck as data and hands the browser a .pptx.

  `pptxgenjs` is loaded through a dynamic import and nowhere else in the app:
  it is roughly a megabyte, and somebody who never exports should not carry it
  in the main bundle. The caller's spinner covers the chunk fetch.
*/

export interface ExportableDeck {
  title: string
  theme: ThemeTokens
  textStyle: TextStyle
  cards: Card[]
}

/** A filesystem-safe name for the download, falling back when the deck is untitled. */
export function pptxFileName(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return `${slug || 'presentation'}.pptx`
}

export async function exportDeckToPptx(deck: ExportableDeck): Promise<void> {
  const { default: PptxGenJS } = await import('pptxgenjs')

  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_16x9'
  pptx.title = deck.title

  /*
    One backdrop for the whole deck, not one per slide: it depends only on the
    theme and every slide is the same 16:9, so a 30-card deck carries a single
    image instead of thirty copies of it.

    Decoration must never fail the export — if the raster step cannot run, the
    slides fall back to the theme's flat background colour and the text, which
    is the part that matters, still arrives.
  */
  let background: { data: string } | { color: string }
  try {
    background = { data: await backdropPng(deck.theme) }
  } catch {
    background = { color: hex(deck.theme.colors.background) }
  }

  const ordered = [...deck.cards].sort((a, b) => a.orderIndex - b.orderIndex)

  ordered.forEach((card, index) => {
    const slide = pptx.addSlide()
    slide.background = background
    const style = mergeTextStyle(deck.textStyle, card.textStyle)
    RENDERERS[slideGroup(card, index === 0)](slide as unknown as PptxSlide, card, deck.theme, style)
  })

  await pptx.writeFile({ fileName: pptxFileName(deck.title) })
}
```

- [ ] **Step 4: Typecheck and lint**

Run: `npx tsc -b && npm run lint`
Expected: both silent. If `pptx.layout = 'LAYOUT_16x9'` is rejected by the library's types, assign through `pptx.defineLayout({ name: 'LEKTURA_16x9', width: 10, height: 5.625 })` followed by `pptx.layout = 'LEKTURA_16x9'` — the geometry the renderers assume is what matters, not the preset's name.

- [ ] **Step 5: Verify the bundle split**

Run: `npm run build`
Expected: build succeeds, and the output lists a separate chunk containing pptxgenjs rather than folding it into the main entry. If it is in the main chunk, the dynamic `import()` has been hoisted — check that nothing imports `pptx.ts` at module scope from a statically-imported file.

- [ ] **Step 6: Verify by hand in the browser**

Run: `npm run dev`, open a deck, and in the DevTools console:

```js
const { exportDeckToPptx } = await import('/src/export/pptx.ts')
const { usePresentationStore } = await import('/src/store/presentationStore.ts')
const s = usePresentationStore.getState()
await exportDeckToPptx({ title: s.title, theme: s.theme, textStyle: s.textStyle, cards: s.cards })
```

Expected: a `.pptx` downloads. Open it in PowerPoint (or Google Slides) and confirm:
- Slide count equals the deck's card count, in the same order.
- Every slide carries the theme's backdrop.
- Clicking a heading selects an editable text box and the text can be retyped.
- Headings, bullets, stats, comparisons and quotes each landed in a sensible arrangement, with no text running off the slide.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/export/slideRenderers.ts src/export/pptx.ts
git commit -F - <<'EOF'
Add PPTX slide renderers and the writer

Five renderers place native PowerPoint text boxes over the theme's
backdrop. pptxgenjs is dynamically imported and confined to pptx.ts, and
the renderers depend on a local structural slide interface rather than
the library's types.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HHKjz4g35yxMuXNS3rvbea
EOF
```

---

### Task 8: Read a deck without loading it

**Files:**
- Modify: `src/store/presentationStore.ts:309-347` (`loadDeck`)

**Interfaces:**
- Produces:
  - `export interface DeckContent { title: string; theme: ThemeTokens; textStyle: TextStyle; cards: Card[] }`
  - `export async function fetchDeck(id: string): Promise<DeckContent | null>` — a module-level export, not a store method.
  - `loadDeck` keeps its exact current signature and behaviour.

`presentationStore` is a single-deck store. The dashboard's export must not call `loadDeck`, which would overwrite whatever deck the user has open. Extracting the query-and-mapping half gives both callers one path, so the row-to-`Card` mapping — `resolveTheme`, `parseTextStyle`, the `visual_style` default — has no second place to drift.

`null` means Supabase is not configured, which is the same case `loadDeck` currently handles by keeping whatever is in memory.

- [ ] **Step 1: Add `fetchDeck` above the store definition**

In `src/store/presentationStore.ts`, add near the other module-level helpers (above `export const usePresentationStore`):

```ts
/** A deck's content, with no store state attached. */
export interface DeckContent {
  title: string
  theme: ThemeTokens
  textStyle: TextStyle
  cards: Card[]
}

/**
 * Reads one deck straight from Supabase, without touching store state.
 *
 * Split out of `loadDeck` so the dashboard can export a deck it has not
 * opened. Calling `loadDeck` there would overwrite the deck the user is
 * currently editing — this store holds exactly one.
 *
 * Returns `null` when Supabase is not configured, which is the case `loadDeck`
 * handles by leaving whatever is in memory alone.
 */
export async function fetchDeck(id: string): Promise<DeckContent | null> {
  if (!supabaseConfigured || !supabase) return null
  await ensureSession()

  const [{ data: pres, error: presErr }, { data: cardRows, error: cardsErr }] = await Promise.all([
    supabase.from('presentations').select('*').eq('id', id).single(),
    supabase.from('cards').select('*').eq('presentation_id', id).order('order_index'),
  ])
  if (presErr) throw presErr
  if (cardsErr) throw cardsErr

  return {
    title: pres.title,
    // Resolved by id rather than used as-is: a deck saved before a theme
    // redesign carries that older shape. See `resolveTheme`.
    theme: resolveTheme(pres.theme),
    textStyle: parseTextStyle(pres.text_style),
    cards: (cardRows ?? []).map((row) => ({
      id: row.id,
      orderIndex: row.order_index,
      blocks: row.blocks as ContentBlock[],
      layout: row.layout as LayoutType,
      visualStyle: (row.visual_style as VisualStyle | null) ?? 'structured',
      textStyle: parseTextStyle(row.text_style),
      inline: (row.inline as Card['inline']) ?? undefined,
    })),
  }
}
```

- [ ] **Step 2: Rewrite `loadDeck` to use it**

Replace the whole body of `loadDeck` (currently lines 309-347) with:

```ts
  async loadDeck(id: string) {
    set({ status: 'loading', errorMessage: null })
    try {
      const deck = await fetchDeck(id)
      if (!deck) {
        // Supabase not configured: nothing to load, keep whatever is in memory.
        set({ status: 'idle' })
        return
      }
      set({
        presentationId: id,
        title: deck.title,
        theme: deck.theme,
        textStyle: deck.textStyle,
        cards: deck.cards,
        status: 'idle',
        past: [],
        future: [],
      })
    } catch (err) {
      set({ status: 'error', errorMessage: err instanceof Error ? err.message : String(err) })
    }
  },
```

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc -b && npm run lint`
Expected: both silent. If `ContentBlock`, `LayoutType` or `VisualStyle` are reported as unused-but-imported or missing, they are already imported at the top of this file for the store's own types — check rather than re-importing.

- [ ] **Step 4: Run the suite**

Run: `npm run test`
Expected: PASS. `store/cardMutations.test.ts` covers the array moves and must be unaffected.

- [ ] **Step 5: Verify the editor still loads decks**

Run: `npm run dev`, open a deck from the dashboard.
Expected: the deck renders with its cards, theme and title exactly as before. Undo and redo are disabled on arrival (history resets on load).

- [ ] **Step 6: Commit**

```bash
git add src/store/presentationStore.ts
git commit -F - <<'EOF'
Extract fetchDeck from loadDeck

The dashboard needs a deck's content to export it, but this store holds
exactly one deck — calling loadDeck there would overwrite the one the
user has open. One query path with two consumers also leaves the
row-to-Card mapping no second place to drift.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HHKjz4g35yxMuXNS3rvbea
EOF
```

---

### Task 9: Wire up both entry points

**Files:**
- Create: `src/export/useExportPptx.ts`
- Create: `src/components/home/DeckMenu.tsx`
- Modify: `src/components/editor/TopBar.tsx`
- Modify: `src/pages/EditorPage.tsx`
- Modify: `src/components/home/DeckCard.tsx`
- Modify: `src/components/home/DeckListRow.tsx`
- Modify: `src/pages/HomePage.tsx`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: `exportDeckToPptx`, `ExportableDeck` (Task 7); `fetchDeck` (Task 8).
- Produces:
  - `export type ExportStatus = 'idle' | 'working' | 'error'`
  - `export function useExportPptx(): { status: ExportStatus; error: string | null; exportDeck(deck: ExportableDeck): Promise<void>; exportDeckById(id: string): Promise<void> }`

`useExportPptx.ts` is the one exception to the "no React in `src/export/`" rule and is a hook, not a renderer — it imports `react` and nothing else from the UI. Keeping it beside the exporter is what stops the spinner, disabled and error behaviour from being written twice.

The dashboard has **two** surfaces, not one: `DeckCard` (grid view) and `DeckListRow` (list view). Both get the menu, from one shared `DeckMenu` component — the same reason `deckFilters.ts` centralises `selectDecks`, so the two views cannot drift.

- [ ] **Step 1: Write the hook**

Create `src/export/useExportPptx.ts`:

```ts
import { useCallback, useRef, useState } from 'react'
import { fetchDeck } from '@/store/presentationStore'
import { exportDeckToPptx, type ExportableDeck } from './pptx'

export type ExportStatus = 'idle' | 'working' | 'error'

/**
 * Export state for one trigger.
 *
 * Both entry points — the editor's TopBar and the dashboard's deck menu — share
 * this so the spinner, the disabled state and the error message are written
 * once. `exportDeck` takes a deck already in hand (the editor, which exports
 * unsaved edits too); `exportDeckById` reads one first (the dashboard).
 */
export function useExportPptx() {
  const [status, setStatus] = useState<ExportStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  // Guards a double click: a second export while the first is still writing
  // would download two files and race the two spinners.
  const running = useRef(false)

  const run = useCallback(async (load: () => Promise<ExportableDeck | null>) => {
    if (running.current) return
    running.current = true
    setStatus('working')
    setError(null)
    try {
      const deck = await load()
      if (!deck) throw new Error('This deck could not be read')
      await exportDeckToPptx(deck)
      setStatus('idle')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStatus('error')
    } finally {
      running.current = false
    }
  }, [])

  const exportDeck = useCallback(
    (deck: ExportableDeck) => run(async () => deck),
    [run],
  )

  const exportDeckById = useCallback(
    (id: string) =>
      run(async () => {
        const deck = await fetchDeck(id)
        // The dashboard holds only a DeckSummary, so it cannot disable the menu
        // item for an empty deck the way the editor disables its button. Saying
        // so beats handing the user a .pptx with no slides in it.
        if (deck && deck.cards.length === 0) throw new Error('This deck has no slides yet')
        return deck
      }),
    [run],
  )

  return { status, error, exportDeck, exportDeckById }
}
```

- [ ] **Step 2: Add the editor's button**

In `src/components/editor/TopBar.tsx`, add `onExport`, `exporting` and `canExport` to the props:

```tsx
export function TopBar({
  title,
  onTitleChange,
  presentationId,
  saveStatus,
  onExport,
  exporting,
  canExport,
}: {
  title: string
  onTitleChange: (title: string) => void
  presentationId: string
  saveStatus: 'idle' | 'loading' | 'saving' | 'error'
  onExport: () => void
  exporting: boolean
  canExport: boolean
}) {
```

and replace the comment left where undo/redo used to sit with the button:

```tsx
        <Button
          variant="secondary"
          onClick={onExport}
          loading={exporting}
          disabled={!canExport}
          title={canExport ? 'Download this deck as a PowerPoint file' : 'Nothing to export yet'}
        >
          Export
        </Button>
        <ThemeToggle />
```

- [ ] **Step 3: Wire the editor page**

In `src/pages/EditorPage.tsx`, add the import:

```tsx
import { useExportPptx } from '@/export/useExportPptx'
```

add the hook beside the other state:

```tsx
  const { status: exportStatus, error: exportError, exportDeck } = useExportPptx()
```

and pass it into `TopBar`:

```tsx
      <TopBar
        title={store.title}
        onTitleChange={store.setTitle}
        presentationId={id}
        saveStatus={store.status}
        canExport={cards.length > 0}
        exporting={exportStatus === 'working'}
        onExport={() =>
          void exportDeck({
            title: store.title,
            theme: store.theme,
            textStyle: store.textStyle,
            cards,
          })
        }
      />
      {exportError && (
        <p role="alert" className="bg-red-50 px-4 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          Export failed: {exportError}
        </p>
      )}
```

- [ ] **Step 4: Write the shared dashboard menu**

Create `src/components/home/DeckMenu.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'

/**
 * The per-deck overflow menu, shared by the grid card and the list row.
 *
 * One component rather than two copies for the same reason `deckFilters.ts`
 * owns `selectDecks`: the two views must offer the same verbs, and a menu item
 * added to one and forgotten in the other is exactly the drift that causes.
 */
export function DeckMenu({
  deckTitle,
  onOpen,
  onPresent,
  onExport,
  onDelete,
  exporting,
  className = '',
  onDark = false,
}: {
  deckTitle: string
  onOpen: () => void
  onPresent: () => void
  onExport: () => void
  onDelete: () => void
  exporting: boolean
  className?: string
  /** True when the trigger sits on the card's coloured header rather than the panel surface. */
  onDark?: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Registered only while open, so the dashboard isn't holding one document
  // listener per deck for menus nobody opened.
  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const triggerTone = onDark
    ? 'bg-black/25 text-white backdrop-blur-sm hover:bg-black/40 focus-visible:outline-white'
    : 'text-app-muted hover:bg-app-surface hover:text-app-foreground focus-visible:outline-app-accent'

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={`Actions for "${deckTitle}"`}
        aria-expanded={open}
        title="Actions"
        className={`flex size-8 cursor-pointer items-center justify-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 ${triggerTone}`}
      >
        <svg className="size-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <circle cx="8" cy="3" r="1.4" />
          <circle cx="8" cy="8" r="1.4" />
          <circle cx="8" cy="13" r="1.4" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 min-w-48 rounded-app border border-app-border bg-app-background p-1 shadow-app"
        >
          <Item label="Open" onClick={() => { setOpen(false); onOpen() }} />
          <Item label="Present" onClick={() => { setOpen(false); onPresent() }} />
          <Item
            label={exporting ? 'Exporting…' : 'Export as PowerPoint'}
            disabled={exporting}
            // Stays open while it works: closing would take the only progress
            // indication off screen mid-export.
            onClick={onExport}
          />
          <Item label="Delete" danger onClick={() => { setOpen(false); onDelete() }} />
        </div>
      )}
    </div>
  )
}

function Item({
  label,
  onClick,
  danger,
  disabled,
}: {
  label: string
  onClick: () => void
  danger?: boolean
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className={`block w-full cursor-pointer rounded-app-sm px-2 py-1.5 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-app-accent disabled:cursor-not-allowed disabled:opacity-50 ${
        danger ? 'text-red-600 hover:bg-red-50 dark:hover:bg-red-950' : 'text-app-foreground hover:bg-app-surface'
      }`}
    >
      {label}
    </button>
  )
}
```

- [ ] **Step 5: Put the menu on the grid card**

In `src/components/home/DeckCard.tsx`, add `onPresent`, `onExport` and `exporting` to the props:

```tsx
export function DeckCard({
  deck,
  onOpen,
  onPresent,
  onExport,
  onDelete,
  exporting,
}: {
  deck: DeckSummary
  onOpen: () => void
  onPresent: () => void
  onExport: () => void
  onDelete: () => void
  exporting: boolean
}) {
```

add the import:

```tsx
import { DeckMenu } from './DeckMenu'
```

and replace the whole bare delete `<button>` (currently lines 47-68, from `<button onClick={onDelete}` through its closing `</button>`) with:

```tsx
      <DeckMenu
        deckTitle={deck.title}
        onOpen={onOpen}
        onPresent={onPresent}
        onExport={onExport}
        onDelete={onDelete}
        exporting={exporting}
        onDark
        className="absolute top-3 right-3 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
      />
```

- [ ] **Step 6: Put the same menu on the list row**

In `src/components/home/DeckListRow.tsx`, add the import:

```tsx
import { DeckMenu } from './DeckMenu'
```

widen the props:

```tsx
export function DeckListRow({
  deck,
  onOpen,
  onPresent,
  onExport,
  onDelete,
  exporting,
}: {
  deck: DeckSummary
  onOpen: () => void
  onPresent: () => void
  onExport: () => void
  onDelete: () => void
  exporting: boolean
}) {
```

and replace that file's delete `<button>` element with:

```tsx
      <DeckMenu
        deckTitle={deck.title}
        onOpen={onOpen}
        onPresent={onPresent}
        onExport={onExport}
        onDelete={onDelete}
        exporting={exporting}
      />
```

No `onDark` here, unlike the grid card: the row sits on the panel surface rather than on a coloured header, and the dark trigger tone would read as a black dot on white.

- [ ] **Step 7: Wire the dashboard page**

In `src/pages/HomePage.tsx`, add the import:

```tsx
import { useExportPptx } from '@/export/useExportPptx'
```

add the hook beside the page's other state:

```tsx
  const { status: exportStatus, error: exportError, exportDeckById } = useExportPptx()
```

and extend both `DeckListRow` and `DeckCard` call sites (currently lines 125-131 and 136-142) with the three new props:

```tsx
                      onPresent={() => navigate(`/deck/${deck.id}/present`)}
                      onExport={() => void exportDeckById(deck.id)}
                      exporting={exportStatus === 'working'}
```

Then render the error once, just above the deck grid/list container:

```tsx
              {exportError && (
                <p role="alert" className="mb-3 text-sm text-red-600 dark:text-red-400">
                  Export failed: {exportError}
                </p>
              )}
```

- [ ] **Step 8: Typecheck and lint**

Run: `npx tsc -b && npm run lint`
Expected: both silent.

- [ ] **Step 9: Run the suite**

Run: `npm run test`
Expected: PASS.

- [ ] **Step 10: Verify both entry points by hand**

Run: `npm run dev`.

From the editor: open a deck, click **Export**. The button shows its spinner, then a `.pptx` downloads named after the deck.

From the dashboard grid: hover a card, open the ⋯ menu, choose **Export as PowerPoint**. The item reads "Exporting…" and the file downloads. Confirm the deck you had open in the editor is **unaffected** — this is the `fetchDeck` split doing its job.

From the dashboard list view: switch to list, repeat. Confirm the menu offers the same four verbs.

Confirm Delete still opens the existing confirmation modal from both views.

- [ ] **Step 11: Update `CLAUDE.md`**

Two edits.

Under **Editor layout (`pages/EditorPage.tsx`)**, note the toolbar change and the export button. Add after the existing right-dock paragraph:

```markdown
Undo/redo live in the floating `EditorToolbar`, not `TopBar` — they lead the bar
at every level and are the one pair whose scope never changes with the
selection, since the history stack belongs to the deck. `TopBar` holds the deck
title, Present, Export and the light/dark toggle.
```

Then add a new section after **Persistence (Supabase)**:

```markdown
### PPTX export (`src/export/`)

`exportDeckToPptx(deck)` turns a deck into a `.pptx` of **native, editable**
PowerPoint slides — real text boxes, not pictures of slides. Design doc:
`docs/superpowers/specs/2026-08-25-pptx-export-design.md`.

- **The twelve layouts group onto five arrangements** (`slideGroup.ts`:
  title/body/stat/twoCol/quote). `resolveLayout` runs first — `card.layout` is
  `'auto'` for nearly every card, so grouping on the stored value would classify
  the string `'auto'` and put the whole deck in one bucket. The record is
  exhaustive, so a thirteenth layout is a type error rather than a silent
  fallthrough. `visualStyle` is not represented.
- **The backdrop is a rasterized SVG, one PNG per deck.**
  `backdrop/celestialSvg.ts` emits the theme's `CelestialDecor` as a
  self-contained 1920×1080 SVG in the same layer order as `SlideBackdrop`, and
  `backdrop/rasterize.ts` draws it to a canvas. Self-contained is load-bearing:
  no external refs and no `foreignObject` is what keeps the canvas untainted,
  and it is why the export builds its own SVG rather than screenshotting the
  live component. The fixed 16:9 lets it drop the three aspect-ratio workarounds
  `SlideBackdrop` carries. Decoration never fails the export — an unparseable
  glow layer is skipped and a raster failure falls back to a flat theme colour.
- **`starPositions` in `lib/celestial.ts` is shared by both renderers**, so the
  exported sky cannot differ from the on-screen one. The order of its `rand()`
  draws is load-bearing: a star rejected by `avoidCenter` consumes exactly its x
  and y draws, and moving the radius/alpha draws above that `continue` would
  reshuffle all five themes.
- **`pptxgenjs` is dynamically imported and confined to `pptx.ts`.** It is ~1MB;
  nobody who never exports should carry it in the main bundle. The renderers
  depend on a local structural `PptxSlide` interface rather than the library's
  types.
- **Nothing in `src/export/` imports React or a component** (the `useExportPptx`
  hook aside), which is what lets the dashboard export a deck it never opened.
  That path goes through `fetchDeck` and **not** `loadDeck`: this store holds
  exactly one deck, and loading another to export it would overwrite the one the
  user has open.
- Composite body lines (a stat's `value — label`, a timeline step's
  `label — text`) drop their inline bold/italic marks, because they join two
  separately-addressed runs and no single `textRef` applies.
```

- [ ] **Step 12: Commit**

```bash
git add src/export/useExportPptx.ts src/components/home/DeckMenu.tsx src/components/editor/TopBar.tsx src/pages/EditorPage.tsx src/components/home/DeckCard.tsx src/components/home/DeckListRow.tsx src/pages/HomePage.tsx CLAUDE.md
git commit -F - <<'EOF'
Add PPTX export entry points to the editor and dashboard

One useExportPptx hook owns the spinner, disabled and error states for
both triggers. The dashboard's grid and list views share one DeckMenu so
they cannot offer different verbs, and export there reads through
fetchDeck rather than clobbering the open deck.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HHKjz4g35yxMuXNS3rvbea
EOF
```

---

## Verification

After Task 9, the whole feature is in place. Final check:

```bash
npm run test && npx tsc -b && npm run lint && npm run build
```

Then export one deck under each of the five themes and open each file in PowerPoint. Confirm for every theme that the backdrop matches the editor, the text is selectable and editable, and no text runs off the slide.
