---
paths:
  - "src/engine/**"
  - "src/components/layouts/**"
  - "src/components/theme/**"
  - "src/pages/DevSlidesPage.tsx"
---

# Content model & layout engine (`src/engine/`, `components/layouts/`)

## Guard tests new layout work must extend or keep passing

- `components/layouts/everyBlockRenders.test.tsx`: every layout (forced + automatic, both visual treatments, kitchen-sink / image-free / one-photo runs) draws each block's text exactly once. **A new layout or block type must be added to it.**
- `components/layouts/slideGround.test.tsx`: source scan that every `<SlideSurface` in a non-test `.tsx` has `ground={` and every `groundOf(` gets the first-card flag.
- `components/layouts/slideWidthOnly.test.ts`: no screen breakpoints (`sm:`, `md:`…) in layouts, and no class token glued to `${` (Tailwind can't see it).
- `accentBudget.test.tsx` (≤1 `data-accent-owner` per slide), `noHeadingFill.test.tsx`, `redrawRules.test.tsx`, `fillsBody.test.tsx`, `selfCentring.test.tsx`, `densityCompositions.test.tsx`, `newLayouts.test.tsx`, `structuredBlocks.test.tsx`, `termRows.test.tsx`, `LayoutWireframe.test.tsx`.

## Model

- `contentBlocks.ts`: `ContentBlock` union (`heading`, `paragraph`, `bulletList`, `stat`, `image`, `quote`, `timelineStep`, `comparisonGroup`, and structured `point`, `callout`, `code`; a heading may carry a `kicker`). `Card`: `id`, `orderIndex`, `blocks`, `layout`, `visualStyle`, `textStyle`, `inline`, `adjusts`, `narration`, `overlay`. **`blocks: []` is a real blank card; nothing may assume a card has a block.**
- A block's **index** is its `textRef`, `card.adjusts` key, `data-block-index` and selection. Anything that inserts or removes a block must renumber all of them (see `editing.md` rule: Removal / Add row).
- `card.visualStyle` (`'structured'|'expressive'`) is picked by the AI per card and passed to each layout as `variant`; legacy rows default to `'structured'`.

## Layout choice

- `chooseLayout(blocks, {isFirstCard})` is a rule-based classifier; `resolveLayout` defers to it when `card.layout === 'auto'` (nearly every card). It never awards `section` or `statement`, and awards a variety only for `statSplit`, `photoList` and `termRows` (each on an exact block signature).
- Only three things name a layout: the layout picker, a `title` card added anywhere but the front (`hero`), and ingest (`generatedLayout`: `hero` for card 0, a role hint, then `structuralLayout` → `section`/`statement`, then `varyLayouts`).
- **`section`/`statement` are named at ingest, never by the classifier**: a live card re-resolves on every keystroke, and a length rule there swapped the whole slide (ground, heading size, caret) when a paragraph crossed 140 characters.
- `varyLayouts` may assign a variety so neighbouring `auto` slides don't share an arrangement; it changes only `layout`, never blocks. Other varieties (`checklist`, `statList`, `timelineRow`, `steps`, `comparisonTable`, `beforeAfter`, `twoColumn`, …) are picker-only. `layoutVarieties` lists them.

## Families vs frames

- *Families* (`FLOW_LAYOUTS`: stat/timeline/comparison/list/gallery families, `steps`, `beforeAfter`, `termRows`) render through `FlowLayout`: `inferGroups` → leaves via `BlockRenderer`, runs of same-type blocks via `GroupRenderer` (exhaustive switch). `FlowLayout` gets the **resolved** layout, plus the stored one as `hint`.
- *Frames* (`hero`, `statHero`, `quote`, `textFocus`, `standard`, `standardSplit`, `imageFocus`, `section`, `statement`, `twoColumn`, `statSplit`, `photoList`) have their own components.
- **`hero`, `statHero`, `quote`, `section`, `statement` compose themselves and must end with `<Leftovers blocks consumed />`**, naming exactly the indices they drew (a frame showing only the first of a type names only that one). Everything else draws through `SlideFrame`, whose body draws every index `slotsOf` gives it.
- Heading size is `h2` everywhere except `hero`, `section`, `statement` (`h1`, ignoring a heading's stored `size`). Don't add more per-layout variance.
- **Grouping is derived at render, never stored**: `inferGroups` never reorders, drops or duplicates a block; runs are consecutive only.

## Composition (`engine/composition.ts`, pure)

- `slotsOf(blocks)` → indices for `claim` (first heading), `lead` (paragraph right after it), `aside` (the lone photo) and `body`. **Total**: every index in exactly one slot, so nothing is moved or renumbered.
- `accentOwner(blocks, layout)` names the **one block allowed an accent fill**: first `callout`, else statHero's first `stat`, else a comparison's first group, else none. Accent as text colour or a hairline is free. **No layout draws a fill behind a heading.**
- `SlideFrame` (`layouts/SlideFrame.tsx`): head zone (claim + lead) and body zone; optional `aside` photo beside the text from 640px container width up. Never centres vertically, never fixes a height.
- **Vertical placement belongs to the layout.** `SlideBody` is `flex-1` and centres nothing. Frames ask for it on their own root: `my-auto` (`quote`, `statHero`, `statement`, blank card) or `mt-auto` (hero without photo, `section`). **A new frame must choose its own placement.**
- **Density compositions** (`compositionOf`): `stack` | `sideHead` (short claim, two+ body units, head left / body on a tinted zone panel) | `splitBody` (two units side by side). Counts blocks only, never word weight; never stored; no picker option. Each zone panel is its own `@container` and sets `--zone-width: 100cqi`. The picker wireframes and PPTX still show the stacked form.
- **Type and gap steps** (`lib/theme-tokens.ts`): `SLIDE_SIZE` (`eyebrow`, `lead`, `caption`, ratios of body size) and `SLIDE_GAP` (`tight`, `group`, `section`). **Three gap values only; don't add a fourth.**
- **Redrawn arrangement rules** (both treatments): a lone group fills the body (`fillNode` → `data-fill` + `flex-1`); numerals/figures are accent text ≥ h3, never a disc; rules and space, not boxed cards or side tabs; `itemStep` picks roomy vs body text size.
- **Gotcha: `Adjustable` is `display: contents`** around one child, so `divide-*` and `first:` on a parent of holders never draw. Rules between items are per-element borders.

## Grounds

- `Ground` = `'plain'|'tint'|'deep'`. `groundOfLayout`: `hero`, `section` deep; `quote`, `statHero`, `statement` tint; rest plain. `groundOf(card, context)` resolves like the surface; an empty card is always plain.
- **Every `SlideSurface` caller must pass `ground`, computed with the same first-card flag it hands the layout** (source scan enforces it). `SlideSurface` stamps `data-ground`; `index.css` re-points the `--slide-*` variables inside it, so no layout changes.
- **Text on a deep ground ignores every colour pick** (deck, card, element, character marks), like text on a photo. Picks are kept, not dropped. The Fill bar is disabled with a reason on a deep card.
- **Local deep grounds:** `beforeAfter`'s second half and the `code` panel carry their own `data-ground="deep"`. On a deep slide the code panel instead draws as a light panel (`[data-ground='deep'] [data-code]`).
- **A layout changing ground means changing its wireframe** (`LayoutWireframe` follows `groundOfLayout`).

## Structured blocks

Spec: `2026-11-18-structured-blocks-design.md` (Part 1, hand-made) and `2026-11-19-ai-structured-blocks-design.md` (Part 2, the AI writes them).

- **Kicker** (heading's small label): added by the toolbar's "Add small heading". **An emptied kicker is removed when its editing ends, never stored as `""`**; the read boundary reads `""` as absent.
- **Points** `{label, text}`: a consecutive run of 2+ is one `rows` group / one unit; `pointRuns` folds runs in frames that draw blocks themselves. Rows ruled by a hairline per element in both treatments (user's choice).
- **Callout**: the first owns the accent fill; any other is quiet (tint, `data-callout-quiet`).
- **Code**: monospace panel, `white-space: pre` (scrolls/clips, never wraps or widens the slide). **Marks, font and colour picks are refused on the `code` run** (`refusesMarks`); size applies. **`CODE_FONT` must stay in the video's font probe.**
- Kicker and quiet callout label ink is a 70% accent/foreground mix so it reaches 4.5:1 on every theme (`theme-tokens.test.ts`).

## Photos

- `singlePhoto`: exactly one image; two or more is a gallery and never a background.
- `hero`/`quote` draw it as the slide's ground (`BackgroundPhoto` + `PhotoStage`). The photo is an absolute `Adjustable fixed` at `inset: calc(-1 * var(--slide-pad))`, so it must be a **sibling** of the text, never inside a positioned wrapper. **`SlideSurface` owns padding as `--slide-pad`**; callers pass `padding`, never `p-*`.
- **Text on a photo is white and ignores every colour pick** (`[data-on-photo]` in `index.css`). Code panels and quiet callouts are excluded and keep their own inks.
- `standardSplit` (right on even positions, left on odd) and `imageFocus` put the photo in `SlideFrame`'s `aside` and bleed to the slide edge from 640px up. Families draw a lone photo as a 6:1 band.
- The credit (`PhotoCredit`, "Photo: name / Pexels") is plain text, **never a link** (slides sit inside `aria-hidden` previews and buttons).

## Surface and sizing

- **16:9 floor, not a fixed ratio**: `SlideSurface` is `aspect-video … overflow-clip`; a taller slide grows. **Must be `overflow-clip`, never `overflow-hidden`** (`hidden` makes it a scroll container and pins it to 16:9, cutting content). Don't give the card a fixed height.
- **Every surface lays a slide out at `SLIDE_WIDTH_PX` (976) and scales the picture** (editor, thumbnails, `SlidePreview`, presenter, video). Nudges are fractions of width but text is rem, so another width wraps differently. A new surface must do the same.
- **Layouts never use screen breakpoints**; use container queries (`@min-[640px]:`) against `SlideBody`'s `@container`.
- `Enter` in a run inserts a real `\n`; runs render `white-space: pre-wrap`.
