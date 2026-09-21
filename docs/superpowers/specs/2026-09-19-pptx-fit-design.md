# PPTX export: fit text ourselves so the deck survives every app

**Date:** 2026-09-19
**Status:** approved design (user, 2026-09-19)
**Builds on:** `2026-08-25-pptx-export-design.md`

## The problem

A deck exported to .pptx and opened in Canva showed three failures:

- **Sliced headings.** A two-line heading at the H2 size (≈34pt) needs about
  1.13 in, and `addHeading`'s box is a fixed 0.9 in. Canva clips text to its box, so
  the top or bottom of the letters was cut off. The title slide had the same problem
  at H1 (≈50pt) in a fixed 1.6 in box.
- **Text too large.** `pointSize` = theme rem × `PT_PER_REM` (18) gives a 50pt title,
  a 34pt heading and an 18pt body. Those sizes assume something will shrink them.
- **Crowded at the top.** Every box has a fixed `y`, so a short slide's content sits
  at the top and the bottom half is empty.

**One root cause:** every renderer sizes boxes to fixed heights and relies on
`fit: 'shrink'` (`<a:normAutofit/>`). That shrinking only happens when **PowerPoint**
recalculates the file on open. Canva, Google Slides and Keynote draw the stored size
into the stored box.

## Decisions (user, 2026-09-19)

| Question | Decision |
| --- | --- |
| Target apps | PowerPoint, Google Slides, Canva, Keynote — all four. |
| Fonts | **Keep each theme's fonts and add headroom.** Size text so it still fits if a wider fallback font is used. |
| Measuring | **The browser measures** (canvas `measureText` in the real font). The layout maths stays pure and takes the measurer as a parameter; tests use a deterministic fake. |

Found while designing: the app never loads Inter as a web font. `index.css` only
names it in font stacks, so Inter renders only where it is installed. The browser
measurer therefore measures whatever font the browser resolves, and the headroom
covers the difference. Loading Inter as a web font is a separate, app-wide decision
and is not part of this work.

## Design

### 1. `export/textFit.ts`: pure fitting

- **`TextMeasurer`**: `(text: string, font: FontSpec) => number`. It returns the
  width in inches, where `FontSpec = { face: string; sizePt: number; bold: boolean;
  italic: boolean }`.
- **`estimateMeasurer`**: a deterministic fallback that needs no DOM. It uses an
  average glyph width per em (≈0.55 regular, ≈0.6 bold, widened for all caps and
  digits). It is used when no canvas is available and as the tests' fake.
- **`wrapLines(text, widthIn, font, measure)`**: greedy word wrap that honours
  explicit line breaks. A single word longer than the line is broken by characters.
- **`fitText(paragraphs, box, sizing, measure)`** returns `{ sizePt, heightIn }`.
  - `paragraphs` is a list of `{ text, bold?, indentIn? }`.
  - `box` is `{ widthIn, maxHeightIn }`.
  - `sizing` is `{ preferredPt, minPt, lineSpacing, face, bold, italic }`.
  - It returns the largest size from `preferredPt` down to `minPt`, in 1pt steps,
    whose wrapped height fits `maxHeightIn`. If nothing fits at `minPt`, it keeps
    stepping down to `FLOOR_PT` (10). **Words are never dropped.**
- **Headroom:** measured widths are multiplied by `WIDTH_HEADROOM = 1.1` before
  wrapping, and the returned height is multiplied by `HEIGHT_HEADROOM = 1.1`. That
  covers a wider substitute font and each app's line-metric differences.
- **Height model:** `lines × sizePt × lineSpacing / 72` plus paragraph spacing,
  plus the box's own top and bottom insets. `lineSpacing` defaults to 1.2 (the
  "single" line height PowerPoint and Canva use) and to the theme's `lineHeight`
  where a renderer already passes one.
- **Insets** are set explicitly on every text box (`TEXT_INSET_IN`), so the maths
  and every app agree on the usable width. Before choosing the option value, check
  what unit pptxgenjs expects for `margin`/`inset`.

### 2. Size ladder: caps and minimums

Preferred size = `min(cap, pointSize(themeRem, fontScale))`. This keeps each theme's
ratios below the cap and still honours a user's font scale.

| Role | Cap (pt) | Min (pt) |
| --- | --- | --- |
| title (H1, hero) | 44 | 28 |
| heading (H2) | 30 | 20 |
| subheading (H3: quote text, column heading, subtitle) | 22 | 16 |
| body | 18 | 12 |
| stat value, single | 54 | 28 |
| stat value, grid | 40 | 24 |

### 3. Layout from measured heights

- **Heading (all non-title arrangements):**
  - top-anchored at `y = TOP` (0.45 in), `valign: 'top'`;
  - `h` = its fitted height, with `maxHeightIn` ≈ 1.5 in, so a heading wraps to at
    most about 3 lines before shrinking;
  - the accent rule sits under the heading's real bottom, and the content area
    starts a fixed gap below the rule.
- **Body:**
  - fitted into the content area (down to the slide's bottom margin);
  - the box spans the whole area with `valign: 'middle'`, so short content sits
    centred instead of crowding the top;
  - all four apps honour the anchor.
- **Title slide:**
  - the title and subtitle are fitted independently;
  - the pair is placed as one group, vertically centred on the slide, with each box
    exactly its fitted height;
  - the subtitle's `maxHeightIn` is whatever remains after the title.
- **Stat:**
  - the value and the label are each fitted to their cell;
  - rows are laid out in the content area;
  - paragraphs keep a bottom slice, fitted.
- **Two-column:** each column heading and each column's bullets are fitted to the
  column. The bullet sizes are unified: every column uses the smallest size any
  column needed, so the columns match.
- **Quote:** the quote is fitted into the content area at the subheading size; the
  attribution is fitted beneath it; the pair is centred.
- **Adjusted:**
  - boxes keep the user's size;
  - each run is fitted inside its box, with `fittedPointSize` as the preferred size
    and the body minimum as the floor, so user-sized boxes are no longer overflowed
    in Canva.
- `fit: 'shrink'` stays on every box. The text now fits, so PowerPoint never needs
  it, and it remains a harmless backstop.

### 4. Plumbing

- `SlideRenderer` gains a fifth parameter, `measure: TextMeasurer`.
- `exportDeckToPptx` builds the measurer once:
  - `createCanvasMeasurer()` (new file `export/measureText.ts`) awaits
    `document.fonts.ready`;
  - it measures on an offscreen canvas, with `ctx.font` set from the `FontSpec`
    (`italic`, `700`/`400`, `${sizePt}pt "${face}", Arial, sans-serif`);
  - it converts the canvas width to inches (CSS px / 96, since the font is set in
    `pt`);
  - it falls back to `estimateMeasurer` when no `document` or 2D context exists.
- Nothing else in `src/export/` touches the DOM. `measureText.ts` is the one browser
  file, alongside the existing `backdrop/rasterize` step.

### 5. Testing

- **`textFit.test.ts`** (pure, fake measurer with fixed per-character widths) covers:
  - wrapping, explicit breaks and long-word breaking;
  - that fitting steps down to the preferred size, stops at the size that fits, and
    goes below `minPt` to `FLOOR_PT` only when needed;
  - that headroom is applied;
  - the ladder: preferred = min(cap, theme size × scale).
- **`slideRenderers.test.ts` gains a fit harness:**
  - it renders every arrangement (title, body, stat single and grid, two-column,
    quote, adjusted) with a deliberately long heading and long body;
  - it uses `estimateMeasurer`;
  - it asserts that every text box's re-measured wrapped height is ≤ its `h`, and
    that every box stays inside the 10 × 5.625 in slide;
  - the existing "every word arrives" tests keep passing.
- **Manual check:** export one deck and open it in Canva.

## Not in this work

- Loading Inter (or any theme font) as a web font.
- Embedding fonts in the .pptx (pptxgenjs cannot do it).
- Generation speed (a separate investigation: log each stage's duration first).
- Changing which of the five arrangements a card gets (`slideGroup.ts`).

## Corrections after review

The final whole-branch review (`2026-09-19`, against `pptxgen.es.js` v4.0.1)
found four places where this design's assumptions didn't match what
pptxgenjs actually does, and fixed them:

- **Line spacing is emitted in points (`lineSpacing`), not `lineSpacingMultiple`.**
  pptxgenjs's `lineSpacingMultiple` writes `<a:spcPct>`, which PowerPoint
  defines as a percentage of *single* spacing — roughly 1.2× the font size for
  most faces, not 1.0× — so this design's original reading of it as "× font
  size" under-counted the real line pitch by about 20%. Every text box now
  emits `lineSpacing = sizePt × spacing` (`textFit.ts`'s `spacingPt`) instead,
  where `spacing` is whichever value the box's own fit used.
- **`TEXT_MARGIN_PT` is a scalar (5.4pt), not the `[3.6, 7.2, 3.6, 7.2]`
  array this design specified.** pptxgenjs applies an array `margin` as
  `[left, right, bottom, top]`, not the `[top, right, bottom, left]` order its
  own `.d.ts` claims — a scalar sets all four sides identically regardless of
  that quirk, which is what actually guarantees the fit maths and the drawn
  box agree. `INSET_X_IN`/`INSET_Y_IN` are both `(2 × TEXT_MARGIN_PT) / 72`
  (0.15in) as a result.
- **Bullet indent is `27 / 72`in (`BULLET_INDENT_IN`, matching pptxgenjs's own
  `DEF_BULLET_MARGIN`), not the 0.3in this design's renderers originally
  guessed.** A nested `indentLevel: 1` item uses twice that.
- **`fitText` never enlarges text past `sizing.preferredPt`.** The floor it
  descends to is `Math.min(FLOOR_PT, sizing.preferredPt)`, not `FLOOR_PT`
  alone — a caller asking for something smaller than `FLOOR_PT` (an adjusted
  card's box-proportional size) must get that back unchanged, not raised to
  10pt.

## Risks

- **Fonts measured in the browser can differ from the app that opens the file.** The
  1.1 × width/height headroom is the mitigation. A wider-than-expected substitute
  could still wrap one extra line.
- **Vertically centred body text reads differently** from the old top-aligned text.
  This was chosen to fix the empty-bottom look.
- **Canvas `measureText` for a font that isn't loaded** measures the fallback font,
  which is accepted and covered by headroom.


---

## Implementation invariants (moved from CLAUDE.md)

As-built rules for the export, kept here so CLAUDE.md stays small. Read before changing anything in `src/export/`. Companion to `2026-08-25-pptx-export-design.md`.

`exportDeckToPptx(deck)` makes native, editable slides. Designs: `docs/superpowers/specs/2026-08-25-pptx-export-design.md`, `…/2026-09-19-pptx-fit-design.md`. Nothing in `src/export/` imports React or a component (bar the `useExportPptx` hook), so the dashboard can export a deck it never opened via **`fetchDeck`, not `loadDeck`** (the store holds one deck; loading another would overwrite the open one). `pptxgenjs` (~1MB) is dynamically imported and confined to `pptx.ts`; renderers use the structural `PptxSlide` interface. `starPositions` is shared with on-screen backdrops.

- **The export fits text itself**: `fit: 'shrink'` only runs in PowerPoint (Canva/Google Slides/Keynote draw the stored size), so every renderer computes its own size and box height up front. `fit: 'shrink'` is kept as a backstop. `textFit.ts` is pure/DOM-free (`wrapLines`/`textHeight`/`fitText` take a `TextMeasurer`); `measureText.ts` is the one browser file (`createCanvasMeasurer` awaits `document.fonts.ready`, caches, falls back to `estimateMeasurer` without a DOM/2D context — the only branch Vitest exercises).
- Headroom: widths ×`WIDTH_HEADROOM` (1.1) before wrapping, height ×`HEIGHT_HEADROOM` (1.1) once. `fitText` steps size down in whole points from `preferredPt`; the floor is `Math.min(FLOOR_PT, preferredPt)` — **never enlarges past what was asked**, and never drops words (over-budget height is returned). `SIZE_LADDER` (cap/min pt): title 30/24, heading 30/20, subheading 18/14, body 14/10, single stat value 54/28, stat-grid value 40/24; `preferredSize(role, rem, fontScale)` clamps the theme size (`PT_PER_REM` 18) into the band. Sizes were cut against a measured Gamma export (body 14pt; title reuses heading size — bold weight + centred group carry the distinction); prompt word limits and `BODY_TOO_DENSE` move with them.
- Text boxes set a **scalar** `margin = TEXT_MARGIN_PT` (5.4pt; pptxgenjs applies array margins as `[left,right,bottom,top]`, contradicting its `.d.ts`, so a scalar avoids depending on the order); `INSET_X_IN`/`INSET_Y_IN` derive from it. **Line spacing is exact points (`lineSpacing` via `spacingPt(sizePt, spacing)`), never `lineSpacingMultiple`** (`spcPct` is a % of *single* spacing ≈ 1.2× font size, so it under-counts ~20%); spacing is `theme.typography.lineHeight` where a box passes one, else `DEFAULT_LINE_SPACING` (1.2). Bullet indent is `BULLET_INDENT_IN` (27/72in, matches pptxgenjs `DEF_BULLET_MARGIN` for `indentLevel: 0`; nested = 2×).
- Arrangements lay out from **measured heights**: `addHeading` fits up to `HEADING_MAX_H` (1.5in), top-anchored at `TOP` (0.45), returns the y past its accent rule (`RULE_GAP` 0.08 / `RULE_H` 0.045 / `CONTENT_GAP` 0.22). `renderBody` fits down to `BOTTOM`, `valign: 'middle'`. `renderTitle` centres title+subtitle as one group, `groupY = Math.max(TOP, …)` (clamped so an overflowing subtitle doesn't push the title off the top). Stat grids/two-col fit each cell/column then use the **smallest** fitted size across the row; two-col shares the tallest heading height so bullets start at one y; stat cells carry `CELL_PAD_IN` (0.08in).
- The app never loads Inter or any theme font as a web font, so the measurer measures whatever the browser resolves; the headroom constants are the accepted mitigation.
- **Twelve layouts → five arrangements** (`slideGroup.ts`: title/body/stat/twoCol/quote; exhaustive record). `resolveLayout` runs first (grouping on the stored `'auto'` would bucket the whole deck). `visualStyle` is not represented. A sixth group, **`adjusted`**, short-circuits everything when any element has a nudge (checked before the classifier; untouched cards take the normal path). `export/blockBoxes.ts` recomputes a plain stacked baseline in the normalized nudge space and applies nudges on top (no DOM, can't measure real layout): direction/distance/size survive exactly, hero/timeline treatment does not; content aspect is fitted and centred in 16:9, not stretched. Its `naturalHeight` is width-blind (character-count vs `CHARS_PER_LINE`/`QUOTE_CHARS_PER_LINE`) — accepted gap: a strongly narrowed box can overflow at the floor size rather than lose words. Adjusted text starts from `fittedPointSize` (card-relative), then `fitText` has the final word (`minPt = Math.min(preferredPt, SIZE_LADDER.body.min)`).
- `styleFor` merges deck/card → element (bare block index) → run typography. A merged `body` box can't vary alignment/face/size per paragraph, so only colour, underline, italic and bold ride paragraph runs (`runsForLine`); element alignment/font/size on a body slide isn't exported. Colour and face ride each run (`markedRuns`); size travels under `SIZE_SCALE_KEY` and `withRunSizes` (wrapped around every renderer in `RENDERERS`) converts it to points where box runs and `fontSize` are both known; the fit measures a paragraph at its largest enlarged run (`FitParagraph.scale`); smaller words are ignored. Composite lines (`value — label`, `label — text`) drop inline marks (no single `textRef`).
