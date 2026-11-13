# Slide composition: design

Date: 2026-11-13. Status: draft for approval. Plan: phases 1, 1c, 1b, then 2 (own spec section below, own implementation plan later).

## Why

Side by side with a Gamma deck on the same topic (Control Structures in C++), a Lektura deck reads as a school project. The cause is not too few layouts. The engine has no rules for how a slide is put together, so each layout improvises:

- Two levels of hierarchy (heading, grey paragraph). The Gamma slide has five: eyebrow, claim, lead, label, rows.
- A centred title above a left-aligned paragraph, and even gaps everywhere, so nothing groups.
- Accent fill on everything: a slab behind the heading (`headingPanel`, the hero's panel), behind stats, behind chips. When everything is highlighted, nothing is.
- Type has four steps (h1, h2, h3, body) and no eyebrow, lead or caption. Sizes themselves are already presentation-sized in every theme (body 1.2 to 1.3rem, h2 2.25 to 3.25rem); only the unscoped fallback in `index.css` is stale at 1rem.
- Arrangements are only as tall as their text and float in the middle of the slide.
- Palettes pair a pale page with one bright accent. The user wants deep, warm colour pairs instead (references: bordo / deep green / cream; peacock / tobacco / parchment; ivory / forest / burgundy / walnut).

## Intent

The engine holds composition rules and every layout is drawn from them. A slide should look planned, be readable from the back of a classroom, and let a student see the structure of the idea before reading a word.

## The seven principles, as rules

| # | Principle | Rule the code enforces |
|---|-----------|------------------------|
| 1 | One slide, one idea; the heading states it | The first heading is the **claim** slot, always in the same place. (Phase 2: the prompt asks for a claim, not a topic label.) |
| 2 | Form copies the shape of the idea | Phase 2: `plan.shape` picks the form. Phase 1b: each arrangement is drawn so its shape is visible (a track for a sequence, two panels for a contrast). |
| 3 | Importance by contrast, not decoration | A type scale with wide steps. No fill behind a heading, ever. |
| 4 | Distance means relationship | Three gap sizes only: tight (same unit), group (related), section (new thought). |
| 5 | One alignment edge, one entry point | Everything in the text column starts on the same left edge. The claim is top-left. No centred text except inside a `quote`. |
| 6 | Accent is a budget | At most one accent-**filled** element per slide, named by a pure function. Accent as text colour or a hairline rule is free. |
| 7 | Same places across slides | Claim, lead and body zones are in the same position on every non-title slide. |

## Goals

- Every existing deck looks better with no data change and no AI call.
- Rules are pure functions with tests, like the deck validators.
- The same rules drive screen, presenter, thumbnails, video and (where an arrangement exists) PPTX.

## Non-goals

- No new block types before Phase 2. Phase 1b adds layouts, but only ones the existing blocks can fill.
- No image generation, no animation.
- No change to Lektura's own app colours (`app-*`). That is a separate redesign. **Open question for the user.**
- No change to "generate once", to block-index addressing, or to the no-free-canvas rule.

## Anti-goals

- A slide that looks designed but drops, reorders or duplicates a block.
- A redraw that makes text less legible (every text/ground pair stays AA).
- A layout that changes arrangement between editor and presenter (container queries only, as today).

## Constraints that shape the design

- A block's index is its `textRef`, its `adjusts` key and its selection. Slots and grounds are therefore **derived at render**, never stored, the way `inferGroups` works.
- Every surface lays the slide out at `SLIDE_WIDTH_PX` (976) and scales the picture. All sizes below are at that width.
- The card is a 16:9 floor, not a fixed box (`overflow-clip`). "Fill the body zone" uses the floor: a zone stretches to the 16:9 height and a slide with more content still grows.
- The grid and ink origin is the top-left of `SlideBody`'s box. It does not move.
- Each `LayoutWireframe` mirrors its component. Every redraw updates its wireframe.
- `everyBlockRenders.test.tsx` and `slideWidthOnly.test.ts` keep passing.
- Read the "Implementation invariants" of `2026-09-19-pptx-fit-design.md` before touching `src/export/`.

## Phase 1: composition rules

### Type scale

Themes hold `typography.scale` as `[h1, h2, h3, body]` and already use presentation sizes (Moonlight: 3.5 / 2.5 / 1.625 / 1.25rem). The tuple stays. Three steps are added as **ratios of body, applied at the use site** (`calc(var(--slide-size-body) * r)`), so a user's `fontScale` on an element or card, which rewrites `--slide-size-body`, carries to them with no change to `Adjustable` or `TextStyleScope`:

| Step | Ratio of body | Use |
|------|---------------|-----|
| eyebrow | 0.65 | Uppercase, letter-spacing 0.12em, weight 600, body font |
| lead | 1.2 | The lead paragraph, line height 1.35 |
| caption | 0.7 | Labels under figures |

Claim line height drops from 1.15 to 1.08. The stale fallback block in `index.css` is brought in line with the default theme.

Density is handled by composition, not by shrinking text: see "Density compositions" in Phase 1b.

### Spacing scale

`--slide-gap-tight: 0.5rem`, `--slide-gap-group: 1.25rem`, `--slide-gap-section: 2.25rem`. Eyebrow to claim and claim to lead are tight. Lead to body is section. Items inside an arrangement are group. No other gap value appears in a layout.

### Slots (`src/engine/composition.ts`, pure)

`slotsOf(blocks)` returns indices, never blocks moved or copied:

- `claim`: the first heading.
- `lead`: a paragraph at the index directly after the claim.
- `aside`: the lone photo (`singlePhoto`), for layouts that put it beside the text.
- `body`: every other block, in author order.

Total: every index appears in exactly one slot (test exhaustively, like `groups.test.ts`). A card with no heading has no claim and everything is body.

### The frame (`SlideFrame`)

One component that `FlowLayout`, `StandardLayout`, `TextFocusLayout`, `StandardSplitLayout` and `ImageFocusLayout` draw through:

- Head zone at the top: claim, then lead, on the left edge. Max text width about 62% of the content width when there is an aside, 80% otherwise.
- Body zone below, `flex-1`, so it reaches the bottom of the 16:9 floor. A text-only body starts at its top; an arrangement stretches to fill it (Phase 1b).
- Aside on the right for a lone photo where the layout uses one.
- `SlideSurface` stops centring vertically (`justify-center` goes); the frame owns vertical placement. `HeroLayout`, `QuoteLayout` and `StatHeroLayout` keep their own composition and centre themselves where they need to.

The `StandardLayout` left accent bar goes (it is a decoration, not a signal).

### Emphasis budget

`accentOwner(blocks, layout)` (pure) returns the one block index allowed an accent fill, or `null`. Priority: a `callout` (Phase 2), else the single stat of a `statHero`, else the featured comparison group, else none. Removed outright: `headingPanel`, `Heading`'s `panel`, the hero's accent panel, accent-filled stat boxes beyond the owner, gradient number discs.

`expressive` versus `structured` stays as two treatments of the same rules: structured uses hairline rules and columns, expressive uses larger numerals and a tinted panel for the accent owner. Neither fills a heading.

### Contrast

`theme-tokens.test.ts`: `muted` on `background` is at least 4.5:1 in every theme, and every text/ground pair that the grounds below create passes AA.

## Phase 1c: palette

### Rules for a theme's colours

1. No `#ffffff` and no `#000000` as a ground or as text. The light is a warm cream; darks are deep, slightly desaturated colours.
2. Three or four roles: a light ground, one or two deep grounds, optionally a dark neutral for text.
3. One temperature: every colour shares an undertone.
4. Deep colours are grounds (a whole slide, a whole panel), not small accents on a pale page.
5. Every pair used for text passes AA. Cream on a deep wine is about 10:1, so softer does not mean fainter.

### Tokens

`colors` gains `deep`, `deepForeground` and `tint` (a ground one step off `background`). `applyTheme` writes `--slide-ground-deep`, `--slide-ground-deep-foreground`, `--slide-ground-tint`. A stored theme lacking them gets them from `resolveTheme` (match on `id`), as with `celestial`/`accentSoft`.

### Grounds

`groundOf(card)` (pure) returns `plain | tint | deep`, derived at render: a `hero` card is `deep`; `quote` and `statHero` are `tint`; everything else `plain`. `SlideSurface` takes the ground and paints it.

On a `deep` ground every text colour pick is ignored, the same way text on a photo is (`data-on-photo`, the unlayered rule in `index.css`, `Adjustable` skipping an element colour): `readableColor` checks picks against the theme's `background` only, so a dark pick would vanish on a deep slide. Generalise the attribute rather than adding a second mechanism.

### Themes

Three new themes, ids additive. Starting values; the AA test decides the final ones:

| Id | Light ground | Deep | Second deep (accent) | Text on light |
|----|--------------|------|----------------------|---------------|
| `bordo` | `#f4e3cc` | `#651620` | `#12403c` | `#3a0d12` |
| `peacock` | `#eadfc8` | `#0f4a4f` | `#6b3a1e` | `#1c2b2c` |
| `forest` | `#f1e4cb` | `#2c3b26` | `#6e1a22` | `#2b1d18` |

Fonts: reuse faces already imported in `main.tsx` (my call: Bricolage Grotesque + Hanken Grotesk for `bordo`, Source Serif 4 + Hanken Grotesk for `peacock`, Hanken Grotesk throughout for `forest`). Backdrops: glow layers only, quiet; no stars.

`bordo` becomes the default theme for a new deck (my call; the `index.css` fallback block mirrors the default and changes with it).

The ten existing themes keep their ids and character. Each gets `deep`/`deepForeground`/`tint`, loses any pure white or black, and has its accent pulled toward its ground's temperature where the pair is harsh. Old decks pick this up through `resolveTheme`.

`ThemeGrid` wireframes draw from tokens and follow. The PPTX slide background uses the card's ground.

## Phase 1b: redraw

Five rules for every arrangement and frame, both treatments:

1. **Fill the body zone.** Rows and grids stretch to the zone's height (`grid-auto-rows: 1fr`, `flex-1`), with the composition (below) choosing the text step.
2. **Scale contrast inside the item.** Numerals, stat figures and step labels are drawn at h2 to h1 size in the accent colour as text, not as small filled discs.
3. **Rules and space, not boxes.** No bordered-and-filled cards. Hairline rules, columns and whitespace separate items. One panel per slide at most (the accent owner).
4. **Asymmetry and a featured item.** Where a group has a natural lead (first comparison group, the largest stat), it is drawn larger or on the tint.
5. **Grounds** as above.

Per layout:

- `hero`: deep ground. Eyebrow rule, then the title at h1, bottom-left; subtitle at lead size beneath. With a photo, the existing scrim treatment stays.
- `iconGrid`, `numberedList`, `checklist`, `splitList`: a large numeral (or tick) above or beside each item; columns for up to 4 short items, ruled rows otherwise; all fill the zone.
- `statHero`, `statGrid`, `statList`: one dominant figure; in a grid, figures at h1 on a shared baseline with a rule above each; the list is a ledger with the figure column right-aligned.
- `timeline`, `timelineRow`: one continuous track across the full width (row) or height (column), nodes evenly spaced on it, labels at h3.
- `comparison`, `comparisonTable`: two or more panels of different tone divided by a rule; the first on the tint ground. The table keeps its subgrid rows.
- `quote`: tint ground, an oversized quotation mark as the graphic, text at h3 to h2, attribution as an eyebrow.
- `textFocus`, `standard`: claim, lead, body on the shared edge through `SlideFrame`.
- `standardSplit`, `imageFocus`: the photo bleeds to the slide edge on its side (it already alternates by position); text in the frame's column.
- `gallery`: unchanged apart from gaps and radius.

### Density compositions

A detailed slide is a legitimate request (`ai/detailLevel.ts` has brief, balanced and detailed), so it gets a composition made for it. It is never a simple layout with smaller text.

Reference: two detailed Gamma slides (Selection; Switch). They hold a claim, a sub-claim, an explanation, a table and a code sample, and do not feel full. Why:

1. **Zones.** The slide is split into two or three areas, each with one job (explain, show, example). Each zone alone is a simple slide.
2. **Tone, not borders.** A zone is a panel one step lighter or darker than the ground. No outlines.
3. **Every chunk is labelled.** A small mono eyebrow ("BRANCH EXAMPLE") says what a chunk is before it is read.
4. **Each zone is a different form.** Prose, table, code, diagram. Never three paragraphs side by side.
5. **Density comes from more chunks, not longer text.** One bold sentence, a two-line explanation, table cells of one to three words.
6. **Size steps down with depth.** The claim stays large on every slide. Detail zones use a smaller step. Only the deepest level is small.
7. **Padding is kept.** Panel padding and the slide margin do not shrink as content grows.

`compositionOf(blocks, layout)` (pure, `engine/composition.ts`) counts the **body units** (the render nodes `inferGroups` returns for the body: a leaf or a group is one unit) and their weight (characters, items), and returns:

| Composition | When | Arrangement |
|-------------|------|-------------|
| `stack` (simple) | 0 or 1 light body unit | Head top-left, body below at the `roomy` text step (lead/body/h3 × 1.1). Lots of air. |
| `stack` (moderate) | 1 body unit of normal weight | Head top-left, body fills the zone at the normal step. Today's mockups. |
| `sideHead` (detailed) | 2 or more body units and a head that fits a narrow column | Head (claim, lead, first paragraph) in a left column about 40% wide on the plain ground; the body units stacked in a right panel on the tint ground, each under its label (Gamma's Selection slide). |
| `splitBody` (detailed) | 2 body units and a long claim or lead | Head across the top; the two units side by side below, the first on a tint panel (Gamma's Switch slide). |

Rules:

- The claim is the same size in every composition. Only zone text steps down, to no less than 0.85 of body. Past that the slide grows, as it can today.
- A panel's padding is fixed (`--slide-gap-group`), and so is the gap between zones (`--slide-gap-section`).
- Two units of the same form side by side are allowed but not preferred; `varyLayouts` already avoids like neighbours across slides.
- Zone labels need data: Phase 1b draws zones without labels; Phase 2 adds an optional `label` to groups and blocks (below).
- Thresholds are the builder's call, tuned on the fixture deck plus one detailed deck, and must agree with `DENSITY`: a "balanced" slide lands on moderate, a "detailed" one on a detailed composition.
- The picker offers the compositions as varieties, so a user can overrule the choice.

### New layouts in Phase 1b (existing blocks only)

Added to `layoutTypeSchema`, `LAYOUT_COMPONENTS` or the group arrangements, the picker's varieties and wireframes, `everyBlockRenders.test.tsx` and the PPTX mapping. The classifier awards one only where the block signature is unambiguous; the rest are reached through `varyLayouts` and the picker, like today's extra varieties.

| Layout | Blocks it needs | What it is |
|--------|-----------------|------------|
| `section` | a heading alone, not the first card | A divider on the deep ground: section number as a large numeral, the heading at h1. |
| `statement` | a heading and one short paragraph, nothing else | The one sentence to remember, at h1 on the tint ground. Today this falls to `standard`. |
| `twoColumn` | a heading and two or more paragraphs | Prose in two columns under the claim, for slides that are text by nature. |
| `statSplit` | one stat and one bullet list | The figure as the focal point with the list as a ruled ledger beside it (mockup 4). |
| `steps` | timeline steps (a timeline variety) | Chevron or arrow-linked steps across the width: a process, where `timelineRow` is dates. |
| `photoList` | one photo and one bullet list | The photo bleeding to one edge, the list in the text column. Today the photo is a thin band. |
| `beforeAfter` | exactly two comparison groups (a comparison variety) | Two halves with an arrow between them, the second on the deep ground. |

Layouts that need new data are Phase 2 and 3: term-and-meaning table, callout, **code block** (monospace panel with a caption; the C++ deck has nowhere to show code today), hub, cycle, pyramid, funnel, charts.

Each redraw and each new layout is checked by hand in all thirteen themes, in the editor, a thumbnail, Present and the dashboard cover.

## Phase 2: structured content (outline; detailed plan after phase 1b is on screen)

- Prompt: the heading states the point. A `low` flag for label-style headings; never repaired.
- Heading gains an optional `kicker` (the eyebrow), `textRef` field `kicker`.
- New `point` block `{label, text}`; a consecutive run groups into `rows` (a ruled two-column table) or `cards`.
- New `callout` block `{label?, text}`; it is the accent owner.
- New `code` block `{code, language?, caption?}`: a monospace panel, plain text only (no marks inside), exported to PPTX as a monospace text box.
- `plan.shape` (`parallel | sequence | contrast | partWhole | single`, zod `.catch('single')`) mapped to a layout at ingest next to `roleLayoutHint`.
- Every new block: schema, grouping, both renderers, Insert menu, `contentLines`, quiz and narration deck text, export, `everyBlockRenders`.
- Detailed decks: the prompt's SLIDE DENSITY section asks for **more chunks of different forms, each short** (a sub-claim, a table of terms, an example), not longer paragraphs. `DENSITY` gains a chunks-per-slide range per level beside its word ranges.
- Optional `label` (the zone eyebrow, e.g. "Short example") on `point` runs, `code`, `bulletList` and `comparisonGroup` runs; additive, `textRef` field `label`.
- Bold key terms inside sentences are already supported (`applyEmphasis`); the prompt asks for them on first use of a term.
- Re-check `deckMaxTokens` and `DENSITY`.

## Known costs

- **Hand-nudged decks.** A nudge is a delta on the layout's position. The layout's positions change, so a nudged element lands somewhere new. Accepted: there is no stored absolute position to preserve. Resizes (`w`, `h`) carry over.
- **Bigger type means fewer words fit.** Density tiers absorb most of it; a dense old slide grows past 16:9 as it can today.
- **PPTX.** Type sizes and the ground colour follow. The redrawn arrangements export through the existing five arrangements, so the export will look plainer than the screen until it gets its own pass.

## Testing

- `composition.test.ts`: slots are total and order-preserving over every block combination; `accentOwner` returns at most one index; `groundOf` and the density tier are table-tested; mutation-check the totality rule.
- `theme-tokens.test.ts`: no pure white/black; every text/ground pair AA; new themes' fonts imported by `main.tsx` (existing test's table).
- `everyBlockRenders.test.tsx`: unchanged assertions, all layouts, both treatments.
- A render smoke test that no layout emits an accent-filled heading.
- A fixture deck (the C++ topic: title, parallel list, stats, timeline, comparison, quote, photo split) in `src/engine/fixtures/` for tests and for by-hand before/after.
- By hand: editor, thumbnails, Present, presenter view, cover, video frame, PPTX, on the fixture and on one old nudged deck.

## Left to the builder

Density thresholds; exact colour values within the AA test; which existing-theme accents need pulling; whether `SlideFrame` is one component or a head component plus a zone wrapper; wireframe drawing details.
