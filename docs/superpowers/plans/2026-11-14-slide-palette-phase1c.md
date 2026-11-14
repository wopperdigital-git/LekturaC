# Slide Palette (Phase 1c) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every slide theme a deep ground and a tinted ground, paint title slides on the deep one and quote/stat-hero slides on the tinted one, add three calm warm themes (Bordo, Peacock, Forest) and make Bordo the default.

**Architecture:** A theme's `colors` gains `deep`, `deepForeground` and `tint`. A pure `groundOf` names a card's ground from its resolved layout; `SlideSurface` carries it as `data-ground`, and CSS in `index.css` re-points the ordinary `--slide-*` colour variables inside that surface, so no layout component changes. The PPTX export paints the same ground per slide.

**Tech Stack:** React 19, TypeScript, Tailwind v4 (`@theme inline`, container queries only in layouts), Vitest with `renderToStaticMarkup` (no jsdom), pptxgenjs.

**Spec:** `docs/superpowers/specs/2026-11-13-slide-composition-design.md`, section "Phase 1c: palette".

## Global Constraints

- Nothing stored changes. No migration, no AI call, no change to `cards` or to what a deck row holds beyond the theme JSON it already stores (resolved by id through `resolveTheme`).
- Theme ids are additive: the ten existing ids (`minimal`, `editorial`, `midnight`, `bold`, `sage`, `paper`, `chalk`, `blueprint`, `pop`, `boardroom`) stay. New ids: `bordo`, `peacock`, `forest`.
- No `#ffffff` and no `#000000` in any theme's `background`, `foreground`, `surface`, `accentForeground`, `deep`, `deepForeground` or `tint`.
- Every colour value is lowercase `#rrggbb` (an existing test requires it).
- Text pairs pass WCAG AA: 4.5:1 for body and muted text, 3:1 for the accent as large text. Hex values in this plan are starting points; where one fails its test, change the value by the smallest step that passes and keep its hue.
- A block's index is its address: no block is reordered, dropped, duplicated or wrapped. No wrapper between an `Adjustable` and its child.
- Layouts never use screen breakpoints (`sm:`, `md:`), only `@min-[...]:` container queries.
- Never animate a slide surface. `applyTheme` stays a pure function of the theme, called from `useLayoutEffect`.
- Fonts: the three new themes reuse faces already imported in `src/main.tsx`. A font stack names the real family first and the Fontsource `<Family> Variable` alias second.
- Slide fonts are read as `var(--slide-font-heading)` / `var(--slide-font-body)`, never through a `--font-slide-*` alias.
- `verbatimModuleSyntax` is on (`import type` for type-only imports). `erasableSyntaxOnly` is on.
- No em dashes in comments, copy or docs.
- Before changing anything in `src/export/`, read the "Implementation invariants" section of `docs/superpowers/specs/2026-09-19-pptx-fit-design.md`.
- Commits name exact paths (`git add <paths>`), never `git add -A`. Each commit message ends with `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`.
- Verify with `npm run test`, `npm run lint`, `npm run build`. Baseline at the start: 197 test files / 2470 tests pass, lint warnings only, build passes.

## Review Focus

1. A deck saved with an old theme JSON (no `deep`, `deepForeground`, `tint`) opens with all three, through `resolveTheme` (Task 1 test).
2. A text colour picked on a light theme (for example near-black) must not make a title invisible on its deep ground: on a deep ground no stored colour pick shows (Task 3).
3. Muted text and the accent used as text stay readable on a deep ground and on a tinted ground, in every theme including the four dark ones (Task 1 tests).
4. A hero or quote with a background photo looks as it does today: the photo covers the ground and its text stays white (Task 3 test).
5. An exported title slide is not cream text on a cream background or dark text on the deep colour: its background and text colours change together (Task 5 test).

---

### Task 1: Ground tokens on every theme

**Files:**
- Modify: `src/lib/theme-tokens.ts`
- Modify: `src/index.css` (the `:root` slide fallback block, around lines 135 to 165)
- Test: `src/lib/theme-tokens.test.ts`

**Interfaces:**
- Produces:
  - `ThemeTokens['colors']` gains `deep: string`, `deepForeground: string`, `tint: string`.
  - `export function mixHex(a: string, b: string, weightA: number): string` (sRGB channel mix, `weightA` from 0 to 1, lowercase `#rrggbb`).
  - `export const DEEP_MUTED_WEIGHT = 0.72` and `export function deepMuted(colors: Pick<ThemeTokens['colors'], 'deep' | 'deepForeground'>): string` = `mixHex(deepForeground, deep, DEEP_MUTED_WEIGHT)`.
  - `applyTheme` also writes `--slide-ground-deep`, `--slide-ground-deep-foreground`, `--slide-ground-deep-muted` (from `deepMuted`), `--slide-ground-tint`.

- [ ] **Step 1: Write the failing tests** in `theme-tokens.test.ts`:

```ts
it('mixes two colours channel by channel', () => {
  expect(mixHex('#000000', '#ffffff', 1)).toBe('#000000')
  expect(mixHex('#000000', '#ffffff', 0)).toBe('#ffffff')
  expect(mixHex('#102030', '#304050', 0.5)).toBe('#203040')
})

it('gives every theme a deep ground, its ink and a tint that text can be read on', () => {
  for (const { id, colors } of BUILTIN_THEMES) {
    expect(contrastRatio(colors.deepForeground, colors.deep), `${id} deep ink`).toBeGreaterThanOrEqual(7)
    expect(contrastRatio(deepMuted(colors), colors.deep), `${id} deep muted`).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(colors.foreground, colors.tint), `${id} tint ink`).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(colors.muted, colors.tint), `${id} tint muted`).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(colors.accent, colors.tint), `${id} tint accent`).toBeGreaterThanOrEqual(3)
    expect(colors.deep, `${id} deep differs from background`).not.toBe(colors.background)
    expect(colors.tint, `${id} tint differs from background`).not.toBe(colors.background)
  }
})

it('uses no pure white or pure black for a ground or for ink', () => {
  const keys = ['background', 'foreground', 'surface', 'accentForeground', 'deep', 'deepForeground', 'tint'] as const
  for (const { id, colors } of BUILTIN_THEMES) {
    for (const key of keys) {
      expect(['#ffffff', '#000000'], `${id} ${key}`).not.toContain(colors[key])
    }
  }
})

it('writes the ground tokens', () => {
  // use the file's existing fake-root helper for applyTheme tests
  // expects --slide-ground-deep, --slide-ground-deep-foreground, --slide-ground-tint to equal the theme's
  // values and --slide-ground-deep-muted to equal deepMuted(theme.colors)
})

it('hands a stored theme without ground colours the current preset', () => {
  const stored = { id: 'paper', colors: { background: '#f6f1e7' } }
  expect(resolveTheme(stored).colors.deep).toMatch(/^#[0-9a-f]{6}$/)
})
```

- [ ] **Step 2: Run** `npx vitest run src/lib/theme-tokens.test.ts`. Expected: FAIL (`mixHex` and `deepMuted` not exported, `deep` undefined).

- [ ] **Step 3: Implement.** Add the three fields to the interface with one-line doc comments, `mixHex`, `DEEP_MUTED_WEIGHT`, `deepMuted`, and the four writes in `applyTheme`. Give each of the ten themes these values, and make the listed pure-white fixes:

| Id | `deep` | `deepForeground` | `tint` | Also change |
|----|--------|------------------|--------|-------------|
| `minimal` | `#2a2550` | `#f1eefb` | `#f0edf7` | |
| `editorial` | `#3d2a1c` | `#f5efe5` | `#ece2d0` | `accentForeground` `#ffffff` to `#fffdf8`, `muted` `#76695d` to `#6f6257` |
| `midnight` | `#1b1650` | `#f0efff` | `#10152e` | |
| `bold` | `#3a1608` | `#fbeee4` | `#1b1816` | `foreground` `#ffffff` to `#f6f1ea` |
| `sage` | `#1d3b33` | `#eef5ef` | `#e3ece4` | `muted` `#61736d` to `#586a64` |
| `paper` | `#5c1712` | `#f6f1e7` | `#ede5d3` | `accentForeground` `#ffffff` to `#fbf8f1` |
| `chalk` | `#16201b` | `#f2f0e6` | `#263329` | |
| `blueprint` | `#0a2140` | `#eaf2ff` | `#133761` | |
| `pop` | `#1a1a1a` | `#fff7e0` | `#fff1cc` | `background` `#ffffff` to `#fffaf0`, `accentForeground` `#ffffff` to `#fffaf0` |
| `boardroom` | `#16304f` | `#f4f5f7` | `#e9ecf1` | `surface` `#ffffff` to `#fafbfc`, `accentForeground` `#ffffff` to `#f4f5f7` |

In `index.css` `:root` add `--slide-ground-deep`, `--slide-ground-deep-foreground`, `--slide-ground-deep-muted`, `--slide-ground-tint` beside the other slide fallbacks, with the `minimal` values (Task 4 changes the whole block to the new default).

- [ ] **Step 4: Run** `npx vitest run src/lib/theme-tokens.test.ts`. Expected: PASS, including the existing AA tests (the changed `accentForeground` and `foreground` values must still pass them; adjust by the smallest step if one does not). Then `npm run test` for anything that pinned an old hex.

- [ ] **Step 5: Commit**

```bash
git add src/lib/theme-tokens.ts src/lib/theme-tokens.test.ts src/index.css
git commit -m "feat(theme): deep and tinted grounds on every theme"
```

---

### Task 2: `groundOf`

**Files:**
- Modify: `src/engine/composition.ts`
- Test: `src/engine/composition.test.ts`

**Interfaces:**
- Consumes: `resolveLayout(layout, blocks, context)` from `src/engine/layoutEngine.ts`, `CPP_DECK` from `src/engine/fixtures/cppDeck.ts`.
- Produces:
  - `export type Ground = 'plain' | 'tint' | 'deep'`
  - `export function groundOfLayout(layout: Exclude<LayoutType, 'auto'>): Ground` : `hero` is `deep`; `quote` and `statHero` are `tint`; every other name is `plain`.
  - `export function groundOf(card: Pick<Card, 'layout' | 'blocks' | 'orderIndex'>): Ground` = `groundOfLayout(resolveLayout(card.layout, card.blocks, { isFirstCard: card.orderIndex === 0 }))`. Check how `LayoutRenderer` builds its `LayoutContext` and build the same one, so the ground and the drawn layout can never disagree.

- [ ] **Step 1: Write the failing tests**

```ts
describe('groundOf', () => {
  it('puts the title slide on the deep ground', () => {
    expect(groundOf(CPP_DECK[0])).toBe('deep')
  })
  it('puts a quote and a stat hero on the tinted ground', () => {
    expect(groundOf(CPP_DECK[5])).toBe('tint')
    expect(groundOfLayout('statHero')).toBe('tint')
  })
  it('leaves every other layout plain', () => {
    for (const i of [1, 2, 3, 4, 6]) expect(groundOf(CPP_DECK[i]), String(i)).toBe('plain')
    expect(groundOf({ layout: 'auto', blocks: [], orderIndex: 3 })).toBe('plain')
  })
  it('follows an explicit hero anywhere in the deck', () => {
    expect(groundOf({ ...CPP_DECK[1], layout: 'hero' })).toBe('deep')
  })
})
```

If `CPP_DECK[2]` resolves to `statHero` (check the fixture: it is the stats slide), drop index 2 from the plain list and assert what it resolves to instead.

- [ ] **Step 2: Run** `npx vitest run src/engine/composition.test.ts`. Expected: FAIL, `groundOf` not exported.
- [ ] **Step 3: Implement** both functions.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add src/engine/composition.ts src/engine/composition.test.ts
git commit -m "feat(engine): a card's ground, read off its layout"
```

---

### Task 3: Paint the ground on every surface

**Files:**
- Modify: `src/components/theme/SlideSurface.tsx`
- Modify: `src/index.css`
- Modify (pass `ground={groundOf(card)}`): `src/components/editor/CardCanvas.tsx`, `src/components/editor/CardOutlineSidebar.tsx`, `src/components/editor/PhoneDeckView.tsx`, `src/components/editor/SlidePreview.tsx`, `src/components/present/PresentSlide.tsx`, `src/video/renderFrame.tsx`
- Modify: `src/components/layouts/Adjustable.tsx`, `src/components/layouts/adjustContext.ts`
- Modify: `src/components/editor/LayoutWireframe.tsx`
- Test: `src/components/theme/SlideSurface.test.tsx`, new `src/components/layouts/slideGround.test.tsx`

**Interfaces:**
- Consumes: `groundOf`, `Ground` (Task 2); the four `--slide-ground-*` variables (Task 1).
- Produces: `SlideSurface` prop `ground?: Ground` (default `'plain'`), rendered as `data-ground="tint"` or `data-ground="deep"` on the surface element and no attribute for `plain`. `export const GROUND_ATTR = 'data-ground'` in `adjustContext.ts`.

- [ ] **Step 1: Write the failing tests.**

In `SlideSurface.test.tsx`: a surface with `ground="deep"` renders `data-ground="deep"`; with `ground="tint"`, `data-ground="tint"`; with no prop or `plain`, no `data-ground` attribute at all.

New `slideGround.test.tsx`, rendering the way `PresentSlide` does (through the real `PresentSlide` component with a theme, if it renders in static markup; otherwise `SlideSurface` + `SlideBody` + `LayoutRenderer` with `ground={groundOf(card)}`):

```ts
it('draws the title slide on the deep ground', () => { /* CPP_DECK[0]: markup contains data-ground="deep" */ })
it('draws the quote on the tinted ground', () => { /* CPP_DECK[5]: data-ground="tint" */ })
it('draws a list slide on the plain ground', () => { /* CPP_DECK[1]: no data-ground */ })
it('keeps the photo stage on a hero with one photo', () => {
  /* CPP_DECK[0] with one image block appended: still data-ground="deep", and data-on-photo present */
})
```

Add a source scan test in the same file: every file under `src` (not tests) that renders `<SlideSurface` also contains `ground=`, so a new surface cannot forget it.

- [ ] **Step 2: Run** `npx vitest run src/components/theme src/components/layouts/slideGround.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement the surface and the callers.** `SlideSurface` takes `ground` and sets the attribute. Each of the six callers passes `groundOf(card)`; where a caller holds a narrower card type, widen what it reads rather than casting.

- [ ] **Step 4: Add the ground rules to `index.css`**, unlayered, next to the `[data-on-photo]` rules:

```css
[data-ground='tint'] {
  --slide-background: var(--slide-ground-tint);
}

[data-ground='deep'] {
  --slide-background: var(--slide-ground-deep);
  --slide-foreground: var(--slide-ground-deep-foreground);
  --slide-muted: var(--slide-ground-deep-muted);
  --slide-accent: var(--slide-ground-deep-foreground);
  --slide-accent-foreground: var(--slide-ground-deep);
  --slide-accent-soft: var(--slide-ground-deep-muted);
  --slide-border: color-mix(in srgb, var(--slide-ground-deep-foreground) 25%, var(--slide-ground-deep));
  --slide-surface: color-mix(in srgb, var(--slide-ground-deep-foreground) 8%, var(--slide-ground-deep));
}
```

The surface's own `bg-slide-background` reads the re-pointed variable, so no layout changes. Write a comment above the block saying why the variables are re-pointed (every layout colours text with `slide-*` utilities) and that the values come from `applyTheme`.

- [ ] **Step 5: Ignore colour picks on a deep ground.** A stored pick was checked for contrast against the theme's `background` only (`engine/readableColor.ts`), so on a deep ground it can vanish. Generalise the on-photo mechanism, do not add a second one:
  - `index.css`: the `[data-deck-color='true']` rule also excludes `[data-ground='deep'] *`; add a rule beside the on-photo one that sets `color: var(--slide-ground-deep-foreground) !important` for an element or a character span carrying an inline colour inside `[data-ground='deep']`, excluding `[data-on-photo] *` (the photo rule still wins there) and text on an accent fill. Read how a colour mark is rendered (`EditableText` and the marks renderer) and target exactly that; do not force every text node, or muted text would lose its tone.
  - `Adjustable.tsx`: where it computes `onPhoto` to skip an element colour, also skip when the node is inside `[data-ground="deep"]` (use `GROUND_ATTR`).
  - Update the comments on both rules and on `readableColor.ts`'s header to say picks are checked against the plain ground and ignored on a deep one.

- [ ] **Step 6: Wireframes.** In `LayoutWireframe.tsx` the `hero` wireframe (both treatments) is drawn on a filled ground and `quote` and `statHero` on a faintly tinted one, using the picker's existing app-chrome tokens. Keep whatever its tests assert; add one assertion that the hero wireframe has the filled ground rect.

- [ ] **Step 7: Run** `npm run test`, `npm run lint`, `npm run build`. Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add src/components/theme/SlideSurface.tsx src/components/theme/SlideSurface.test.tsx src/components/layouts/slideGround.test.tsx src/index.css src/components/editor/CardCanvas.tsx src/components/editor/CardOutlineSidebar.tsx src/components/editor/PhoneDeckView.tsx src/components/editor/SlidePreview.tsx src/components/present/PresentSlide.tsx src/video/renderFrame.tsx src/components/layouts/Adjustable.tsx src/components/layouts/adjustContext.ts src/components/editor/LayoutWireframe.tsx src/engine/readableColor.ts
git commit -m "feat(layouts): title slides on the deep ground, quote and stat hero on the tint"
```

(Add any test file for the wireframe that you touched.)

---

### Task 4: Bordo, Peacock, Forest, and Bordo as the default

**Files:**
- Modify: `src/lib/theme-tokens.ts`, `src/index.css` (the `:root` slide fallback block)
- Modify: `src/components/theme/ThemeGrid.tsx`
- Test: `src/lib/theme-tokens.test.ts`, and the `ThemeGrid` assertions in `src/components/editor/ToolsPanel.test.tsx` if they count or order themes

**Interfaces:**
- Consumes: the `colors` shape from Task 1.
- Produces: `BUILTIN_THEMES` has 13 entries, in this order: `bordo`, `peacock`, `forest`, then the existing ten in their current order. `DEFAULT_THEME` is the `bordo` theme, found by id (not by index).

- [ ] **Step 1: Update and add tests** in `theme-tokens.test.ts`:
  - The order test: ids equal `['bordo', 'peacock', 'forest', ...SPACE_THEME_IDS, ...NEW_THEME_IDS]`, 13 unique ids; names `Bordo`, `Peacock`, `Forest` first. Fix any test that addresses a theme by position (`slice(5)`, `BUILTIN_THEMES[0]`) to address it by id.
  - `expect(DEFAULT_THEME.id).toBe('bordo')`, and `resolveTheme({ id: 'nope' }).id` is `'bordo'`.
  - Add `bordo`, `peacock`, `forest` to the list the "text pairings at AA" test runs over, and to the web-font tables (their faces are already imported in `main.tsx`; the test that every named web font is imported must pass with no new import).
  - Warm-theme rule: for the three new themes, `background`, `tint` and `deepForeground` each have red channel >= green channel >= blue channel (one temperature).
  - The three new themes have no `stars`, `constellations`, `orbits`, `bodies` or `grid` in `celestial` (glow only). Check the `CelestialDecor` type for the exact optional field names.

- [ ] **Step 2: Run** `npx vitest run src/lib/theme-tokens.test.ts`. Expected: FAIL.

- [ ] **Step 3: Add the themes.** Shared: `scale: [3.5, 2.5, 1.625, 1.25]`, `spacing: { unit: 0.28 }`, `shape: { radius: 0.5, radiusSm: 0.3, shadow: 'none' }`. `celestial.glow` is two or three quiet `radial-gradient(W% H% at X% Y%, rgba(...) 0%, rgba(...) N%)` layers in the theme's own deep and accent colours at 6 to 12 percent opacity (this exact form is the one the PPTX backdrop reads).

| Field | `bordo` (Bordo) | `peacock` (Peacock) | `forest` (Forest) |
|-------|-----------------|---------------------|-------------------|
| `headingFont` | `'Bricolage Grotesque', 'Bricolage Grotesque Variable', system-ui, sans-serif` | `'Source Serif 4', 'Source Serif 4 Variable', Georgia, serif` | `'Hanken Grotesk', 'Hanken Grotesk Variable', system-ui, sans-serif` |
| `bodyFont` | `'Hanken Grotesk', 'Hanken Grotesk Variable', system-ui, sans-serif` | same as bordo | same as bordo |
| `lineHeight` / `letterSpacing` | 1.5 / -0.2 | 1.55 / 0 | 1.5 / -0.1 |
| `background` | `#f4e3cc` | `#eadfc8` | `#f1e4cb` |
| `foreground` | `#3a0d12` | `#1c2b2c` | `#2b1d18` |
| `accent` | `#12403c` | `#6b3a1e` | `#6e1a22` |
| `accentForeground` | `#f7e6cf` | `#f1e7d2` | `#f4e8d0` |
| `accentSoft` | `#2f6b62` | `#8a5a3a` | `#8f3a40` |
| `muted` | `#6f4a44` | `#4f5a56` | `#66574c` |
| `border` | `#dcc6a8` | `#d3c5a6` | `#d9c8a8` |
| `surface` | `#f9ecd9` | `#f1e8d5` | `#f7ecd8` |
| `deep` | `#651620` | `#0f4a4f` | `#2c3b26` |
| `deepForeground` | `#f7e6cf` | `#f1e7d2` | `#f4e8d0` |
| `tint` | `#ecd5b8` | `#dfd1b3` | `#e6d6b8` |

Copy the exact font-stack spelling of an existing theme that already uses the same face, so the stack test passes. `DEFAULT_THEME = BUILTIN_THEMES.find((t) => t.id === 'bordo')!` (or a named constant the array includes). Update the block comment above `BUILTIN_THEMES` (it says "Ten themes").

- [ ] **Step 4: `index.css` fallback.** The `:root` slide block mirrors the default theme: set every colour, font, radius, shadow, size, line height and letter spacing there to Bordo's values, including the four ground variables and `--slide-canvas-background` (compute it with `darken('#f4e3cc', 5)` in a scratch test or node one-liner and paste the hex).

- [ ] **Step 5: `ThemeGrid` tile.** Each wireframe tile also shows the theme's deep colour: a block of `colors.deep` (for example the left third or a top band of the card rect) with one short bar in `colors.deepForeground`, so the tile reads as the theme's two grounds. Keep the existing accent, heading and muted bars.

- [ ] **Step 6: Run** `npm run test`, `npm run lint`, `npm run build`. Expected: PASS. A test elsewhere that pinned ten themes or the old default (search for `toBe(10)`, `Moonlight`, `'minimal'` in test files) is updated to the new facts, and listed in the report.

- [ ] **Step 7: Commit**

```bash
git add src/lib/theme-tokens.ts src/lib/theme-tokens.test.ts src/index.css src/components/theme/ThemeGrid.tsx
git commit -m "feat(theme): Bordo, Peacock and Forest; Bordo is the default"
```

(Add any other test file you had to update.)

---

### Task 5: The ground in the PPTX export

**Files:**
- Modify: `src/export/pptx.ts`, `src/export/slideRenderers.ts` (and its helpers only where the text colour is chosen)
- Test: `src/export/slideRenderers.test.ts` (and a small pure test beside whatever helper you add)

**Interfaces:**
- Consumes: `groundOf`, `Ground` (Task 2); `deepMuted` and the theme's `deep`, `deepForeground`, `tint` (Task 1).
- Produces: `export function groundColors(theme: ThemeTokens, ground: Ground): { background: string; foreground: string; muted: string; accent: string }` in `src/export/` (pure): `plain` returns the theme's own four; `tint` returns `tint` as background and the theme's own inks; `deep` returns `deep`, `deepForeground`, `deepMuted(colors)`, `deepForeground`.

- [ ] **Step 1: Read** the "Implementation invariants" section of `docs/superpowers/specs/2026-09-19-pptx-fit-design.md`, then how `pptx.ts` sets the master background and how a renderer picks its text colours (and how the photo path forces white text).

- [ ] **Step 2: Write the failing tests.**
  - `groundColors`: table test over the three grounds for one light and one dark theme.
  - In `slideRenderers.test.ts`, following the file's existing fake-slide pattern: the title card of `CPP_DECK` is drawn with its text in `deepForeground` and the slide's background colour set to `deep`; the quote card gets the `tint` background and the theme's own foreground; a list card sets no per-slide background. A hero with one fetched photo is unchanged (photo over the whole slide, white text).

- [ ] **Step 3: Run** `npx vitest run src/export`. Expected: FAIL.

- [ ] **Step 4: Implement.** For a `tint` or `deep` card, set that slide's background to the flat colour (a colour assignment, not image data, so the note in `pptx.ts` about one embedded media part per distinct background does not apply) and draw its text with `groundColors`. A `plain` slide keeps the master background exactly as today. The nudged (`adjusted`) path uses the same colours. On a deep slide every stored text colour pick is ignored, as on screen.

- [ ] **Step 5: Run** `npm run test`, `npm run lint`, `npm run build`. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/export/pptx.ts src/export/slideRenderers.ts src/export/slideRenderers.test.ts
git commit -m "feat(export): title, quote and stat slides keep their ground in PowerPoint"
```

(Add the helper and its test if they are separate files.)

---

### Task 6: `CLAUDE.md`

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the Theme system section** in the file's existing compact style: thirteen presets, the three new ids and their fonts first, Bordo the default (`DEFAULT_THEME` by id; the `index.css` `:root` slide block mirrors it); `colors.deep` / `deepForeground` / `tint`, the four `--slide-ground-*` variables and `deepMuted`; no pure white or black, pinned by a test.
- [ ] **Step 2: Add the grounds** next to the composition notes: `groundOf` (pure, from the resolved layout: `hero` deep, `quote` and `statHero` tint), `SlideSurface`'s `ground` prop and `data-ground`, the variable re-pointing in `index.css` (why no layout changed), the source-scan test that every `SlideSurface` caller passes `ground`, and that **text on a deep ground ignores every colour pick** (same mechanism as text on a photo; `readableColor` still checks picks against the plain ground only).
- [ ] **Step 3: Update the PPTX section**: per-slide flat ground for tint and deep cards, `groundColors`, and that those slides do not show the backdrop picture.
- [ ] **Step 4: Update the Testing list** with `slideGround.test.tsx` and the new theme tests, and state that grounds and the three themes are **unchecked in a browser as of 2026-11-14**. Also fix line 21's count ("three more render tests" now lists four).
- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: grounds and the three warm themes in CLAUDE.md"
```

---

## Notes for the executor

- Every hex in Tasks 1 and 4 was checked against the tests' floors before this plan was written (foreground, muted and accent on the plain ground and the tint; ink on the accent; ink and muted on the deep ground). A failure therefore points at a typo before it points at the value.
- `editorial`'s `accentForeground` on its `accentSoft` is below 4.5:1 today and is not covered by a test; leave it (Phase 1b redraws what uses it).
