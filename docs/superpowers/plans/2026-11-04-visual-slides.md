# Visual Slides Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generated decks get presentation-shaped slides, larger type, distinct expressive treatments, varied neighbours, Pexels photos where they help, an Image slide type, five new themes, and photos in the PPTX.

**Architecture:** Photos are ordinary `image` blocks appended at the end of a card's blocks after generation (indices never shift), placed by the layout engine. The classifier sets aside a single photo, classifies the rest, then picks the photo-aware variant. A pure `varyLayouts` pass at ingest gives neighbouring cards different varieties. All Pexels network code lives in `src/images/pexels.ts`.

**Tech Stack:** React 19, TypeScript, Tailwind v4, zustand, zod, Vitest (no jsdom), pptxgenjs, html-to-image, @fontsource.

**Spec:** `docs/superpowers/specs/2026-11-04-visual-slides-design.md`. Read it and `CLAUDE.md` before starting.

## Global Constraints

- Key: `VITE_PEXELS_API_KEY`. Missing key → no photo stage, picker shows paste-link only; users never see the variable name (console only, via `warnMissingKey`).
- Pexels search: `GET https://api.pexels.com/v1/search?query=<q>&per_page=<n>&orientation=landscape`, header `Authorization: <key>`; slide image = `photo.src.large2x`; credit = `{ name: photo.photographer, url: photo.photographer_url, source: 'pexels' }`.
- Credit copy on slides: `Photo: <name> / Pexels` (pexels) ; no credit line for `source: 'url'`.
- Never reorder, drop or duplicate an existing block of a saved card; photos are appended.
- Layouts never use screen breakpoints (`slideWidthOnly.test.ts`); every frame ends with `<Leftovers>`; new layouts go into `everyBlockRenders.test.tsx` and get a wireframe in `LayoutWireframe.tsx`.
- `cardRow` gains no columns: all new data lives inside `blocks` jsonb. No migration.
- Existing theme ids (`minimal/editorial/midnight/bold/sage`) unchanged; new ids `paper`, `chalk`, `blueprint`, `pop`, `boardroom`.
- Photos never cost a deck: any photo-stage failure except cancel leaves the deck without that photo.
- Update `CLAUDE.md` in the task that changes the behaviour it documents.

## Review Focus

1. Cancel during "Finding photos": the job must settle with no deck (`signal` honoured in the search and checked before insert). → test in Task 6.
2. Pexels returns the same photo for two queries: the deck must not show one photo twice. → test in Task 5.
3. A model-written `image` block with an invented URL: must not reach the deck. → test in Task 5.
4. An existing deck whose cards had an image under the old classifier (heading + paragraph + image → standardSplit) keeps rendering every block. → `everyBlockRenders` + classifier test in Task 7.
5. Text over a background photo stays readable on any photo (scrim always present, even when the user picked a text colour). → by-hand check in Task 8, scrim asserted in render test.

---

## Phase 1 — Layout refresh

### Task 1: Presentation-shaped frame

**Files:**
- Modify: `src/components/theme/SlideSurface.tsx`, `src/components/layouts/LayoutRenderer.tsx` (blank slide `min-h-64` stays), `CLAUDE.md` ("Cards have no fixed aspect ratio…" bullet)
- Test: `src/components/layouts/everyBlockRenders.test.tsx` (smoke assertion on the surface class)

**Interfaces:** Produces: `SlideSurface` renders `aspect-video overflow-clip flex flex-col justify-center` instead of `overflow-hidden`; exports `SLIDE_SURFACE_CLASS` (string) for the test.

- [ ] **Step 1:** Add a test in a new `src/components/theme/SlideSurface.test.tsx`: `renderToStaticMarkup(<SlideSurface>x</SlideSurface>)` contains `aspect-video`, `overflow-clip`, `justify-center` and not `overflow-hidden`.
- [ ] **Step 2:** Run `npx vitest run src/components/theme/SlideSurface.test.tsx` → FAIL.
- [ ] **Step 3:** Change the class. Why it is a floor and not a fixed ratio: with `aspect-ratio` and `height: auto`, the automatic minimum height is the content height unless the box is a scroll container; `overflow: clip` is not one (`hidden` is), so a taller slide grows and corners still clip. Put that reason in the component comment.
- [ ] **Step 4:** Run the test → PASS; run `npm run test` → all pass.
- [ ] **Step 5:** By hand (dev server + `.impeccable/review/harness/index.html`): short slides are 16:9 with content centred; a 6-item numbered list grows past 16:9 unclipped; outline rail, presenter (`/deck/:id/present`), dashboard cover all match.
- [ ] **Step 6:** CLAUDE.md: replace "Don't add `aspect-video` to the card container" with the floor rule and the `overflow-clip` reason.
- [ ] **Step 7:** Commit `feat(slides): 16:9 floor on every slide surface`.

### Task 2: Larger type, big numbers and quotes, distinct expressive treatment

**Files:**
- Modify: `src/lib/theme-tokens.ts` (5 themes' `typography.scale`), `src/components/layouts/StatHeroLayout.tsx`, `QuoteLayout.tsx`, `HeroLayout.tsx`, `TextFocusLayout.tsx`, `StandardLayout.tsx`, `StandardSplitLayout.tsx`, `GroupRenderer.tsx` (expressive branches), `src/components/editor/LayoutWireframe.tsx` (mirror the JSX)
- Test: `src/lib/theme-tokens.test.ts`

**Interfaces:** Produces: none new.

- [ ] **Step 1:** Test `every built-in theme has presentation-sized type`: for each `BUILTIN_THEMES` theme, `scale[0] >= 3.25`, `scale[1] >= 2.25`, `scale[2] >= 1.5`, `scale[3] >= 1.2`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Set scales near `[3.5, 2.5, 1.625, 1.25]` per theme (Solar Flare's heavy face may sit lower within the floors).
- [ ] **Step 4:** StatHero value `clamp`-free fixed rem: structured `6rem`, expressive `8rem`; quote text `2.25rem` (expressive `2.75rem` with an oversized accent quote mark). Expressive in every frame and family: accent-filled panel (`bg-slide-accent text-slide-accent-foreground`) behind the heading block or the number, heavier heading weight (`font-extrabold`); structured unchanged. Update each wireframe to show the panel in the expressive treatment.
- [ ] **Step 5:** Run `npm run test` (includes PPTX fit tests, which read the theme scale) → PASS; fix any fit test whose expectation was a hard-coded old size by recomputing, not by loosening.
- [ ] **Step 6:** By hand in the harness: each layout in both treatments in all five themes; no text overflowing its box at 976px.
- [ ] **Step 7:** Commit `feat(slides): presentation-sized type and a bolder expressive treatment`.

### Task 3: Neighbouring slides never share an arrangement

**Files:**
- Create: `src/engine/varyLayouts.ts`, `src/engine/varyLayouts.test.ts`
- Modify: `src/store/presentationStore.ts:780-795` (`insertGeneratedDeck`), `src/engine/layoutEngine.ts` (export `componentsForKind`), `CLAUDE.md` (Layout engine section: the classifier still never awards varieties; ingest may)

**Interfaces:**
- Consumes: `chooseLayout`, `cardKind`, `componentsForKind(kind, blocks)` from `layoutEngine.ts`.
- Produces: `varyLayouts(cards: { blocks: ContentBlock[]; layout: LayoutType }[]): LayoutType[]` — one layout per card, same order.

- [ ] **Step 1:** Tests:
  - `two consecutive short-list cards → second gets a list variety other than iconGrid` (e.g. `checklist`)
  - `three timeline cards alternate timeline / timelineRow / timeline`
  - `an explicit layout is returned unchanged and still counts as the previous arrangement`
  - `a card whose kind has one component (quote) stays 'auto' even after another quote`
  - `first card uses isFirstCard when resolving`
  - `never returns a layout outside componentsForKind of that card`
- [ ] **Step 2:** Run `npx vitest run src/engine/varyLayouts.test.ts` → FAIL.
- [ ] **Step 3:** Implement: walk in order keeping `previous` (resolved layout); for an `'auto'` card whose `chooseLayout(blocks, {isFirstCard: i===0})` equals `previous`, return the first entry of `componentsForKind(cardKind(blocks), blocks)` that differs from `previous` (none → `'auto'`); otherwise `'auto'`.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** In `insertGeneratedDeck`, after `generatedLayout`, apply `varyLayouts` over the mapped cards (only cards still `'auto'` can change).
- [ ] **Step 6:** `npm run test` → PASS. Commit `feat(generation): vary neighbouring slide arrangements at ingest`.

---

## Phase 2 — Photos

### Task 4: Image credit field and Pexels client

**Files:**
- Modify: `src/engine/contentBlocks.ts` (`imageBlockSchema`), `.env.example` (add `VITE_PEXELS_API_KEY=` with the baked-into-bundle note), `src/lib/setupCopy.ts` (`PHOTOS_NOT_SET_UP = "Photo search isn't set up on this site yet. Whoever runs it needs to add a Pexels key."`)
- Create: `src/images/pexels.ts`, `src/images/pexels.test.ts`, `src/images/types.ts`

**Interfaces:** Produces:
```ts
// types.ts
export interface PhotoCredit { name: string; url: string; source: 'pexels' | 'url' }
export interface Photo { url: string; alt: string; credit: PhotoCredit }
// pexels.ts
export const imagesConfigured: boolean
export class ImageSearchError extends Error { status: number | null }
export function searchPhotos(query: string, options?: {
  signal?: AbortSignal; perPage?: number; orientation?: 'landscape' | 'portrait' | 'square';
  apiKey?: string; fetchImpl?: typeof fetch
}): Promise<Photo[]>
```
`imageBlockSchema` gains `credit: z.object({ name: z.string(), url: z.string(), source: z.enum(['pexels','url']) }).optional()`.

- [ ] **Step 1:** Tests (mocked `fetch`): builds the URL with encoded query, `per_page` default 5, `orientation=landscape`; sends `Authorization: <key>`; maps `src.large2x`, `alt` (falls back to the query when empty), credit; non-2xx → `ImageSearchError` with status; abort → rejects with `AbortError` (not `ImageSearchError`); no key → rejects without calling fetch; `contentBlockSchema` parses an old image block without `credit`.
- [ ] **Step 2:** Run `npx vitest run src/images` → FAIL.
- [ ] **Step 3:** Implement. Key read from `import.meta.env.VITE_PEXELS_API_KEY`.
- [ ] **Step 4:** Run → PASS. Commit `feat(images): Pexels search client and image credits`.

### Task 5: The model names photos; the pipeline finds them

**Files:**
- Modify: `src/generation/schemas.ts` (`generatedCardSchema`), `src/ai/prompts.ts` (VISUAL CHOICE + new IMAGES section), prompt tests beside it
- Create: `src/generation/photos.ts`, `src/generation/photos.test.ts`

**Interfaces:**
- Consumes: `Photo` (Task 4).
- Produces: `generatedCardSchema` field `imageQuery: z.string().trim().min(2).max(80).optional().catch(undefined)`; `addPhotos(deck: GeneratedDeck, search: (query: string, signal?: AbortSignal) => Promise<Photo[]>, signal?: AbortSignal): Promise<GeneratedDeck>`.

- [ ] **Step 1:** Tests for `addPhotos`:
  - appends one `{type:'image', url, alt, prompt: query, credit}` as the **last** block of each card with `imageQuery`; earlier blocks deep-equal the input
  - removes every model-written `image` block before appending (invented URLs)
  - a card whose search rejects, or returns `[]`, keeps its other blocks and gets no image
  - two cards whose searches return the same first photo: the second gets the next unused one
  - aborted signal → rejects with `AbortError`; input deck not mutated
  - schema: `imageQuery: 42` parses to `undefined`; a deck without `imageQuery` still parses
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement; searches run in parallel (`Promise.allSettled`), duplicates resolved in card order afterwards.
- [ ] **Step 4:** Prompt: delete "photos or illustrations" from the cannot-draw sentence (charts, maps, diagrams stay); add an `IMAGES` section (exact rules from spec §2: only when a photograph can show the point; 2-6 concrete English words naming what is in the frame; no text, logos, charts, named real people; always for the title slide; about a third to a half of slides; skip definitions, abstract comparisons, dense lists); add `"imageQuery"` to the card JSON shape example. Prompt test: the built prompt contains `imageQuery` and no longer contains `photos or illustrations`.
- [ ] **Step 5:** `npm run test` → PASS. Commit `feat(generation): image queries and the photo stage`.

### Task 6: Photo stage in the deck job

**Files:**
- Modify: `src/jobs/deckJob.ts`, `src/jobs/timelines.ts`, `src/jobs/start.ts`, their tests, `CLAUDE.md` (Creation flow step 2, Background jobs)

**Interfaces:**
- Consumes: `addPhotos`, `searchPhotos`, `imagesConfigured`.
- Produces: `DeckJobDeps.addPhotos(deck: GeneratedDeck, signal: AbortSignal): Promise<GeneratedDeck>`; `deckTimeline` stage `'photos'` (row label `Finding photos`, progress `0.88`) between repair and save.

- [ ] **Step 1:** Tests: job calls `addPhotos` after `generate` and inserts its result; cancel while `addPhotos` is pending → no insert, job settles cancelled; `addPhotos` rejecting with a non-abort error → inserts the un-photographed deck; timeline shows `Finding photos` active during the stage.
- [ ] **Step 2:** Run `npx vitest run src/jobs` → FAIL.
- [ ] **Step 3:** Implement; `start.ts` wires `addPhotos: imagesConfigured ? (deck, signal) => addPhotos(deck, (q, s) => searchPhotos(q, { signal: s }), signal) : async (deck) => deck`, and calls `warnMissingKey('Photos', 'VITE_PEXELS_API_KEY')` once when unconfigured.
- [ ] **Step 4:** Run → PASS. Commit `feat(jobs): find photos before saving a generated deck`.

### Task 7: Classifier sets a single photo aside

**Files:**
- Modify: `src/engine/layoutEngine.ts` (`chooseLayout`, `cardKind`, `CardKind`, `KIND_BY_LAYOUT`, `componentsForKind`), `src/engine/contentBlocks.ts` (`layoutTypeSchema` + `'imageFocus'`), `src/export/slideGroup.ts` (map `imageFocus` → its text arrangement), `src/components/editor/LayoutPicker.tsx` (`LAYOUT_LABELS.imageFocus = 'Image'`)
- Test: `src/engine/layoutEngine.test.ts`, `layoutOptions.test.ts`

**Interfaces:** Produces: `CardKind` gains `'image'` (label `Image`); `componentsForKind('image') = ['imageFocus', 'standardSplit']`; `KIND_BY_LAYOUT.standardSplit = 'image'`, `imageFocus: 'image'`.

Rule: when a card has exactly one image, classify the blocks without it (`core`). Result: `standard`/`textFocus` with ≥1 paragraph → `standardSplit`; `standard` with no paragraph (heading only) → `imageFocus`; anything else → the core result (hero, quote, statHero, families keep their own photo handling in Task 8). `cardKind` likewise: core kind `text` → `image`, else the core kind. Two or more images keep today's gallery rules.

- [ ] **Step 1:** Tests: `first card heading+paragraph+image → hero`; `quote+image → quote`; `one stat+image → statHero`; `short list+image → iconGrid`; `heading+paragraph+image → standardSplit` (unchanged from today); `heading+image → imageFocus`; `cardKind(heading+paragraph+image) === 'image'`; `layoutVarieties` for it lists imageFocus and standardSplit in both treatments.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS (the frame for `imageFocus` comes in Task 8; until then map it to `StandardSplitLayout` in `LAYOUT_COMPONENTS`).
- [ ] **Step 5:** Commit `feat(layout): classify around a single photo`.

### Task 8: Photo placements and credits

**Files:**
- Create: `src/components/layouts/PhotoCredit.tsx`, `src/components/layouts/ImageFocusLayout.tsx`, `src/components/layouts/BackgroundPhoto.tsx`
- Modify: `HeroLayout.tsx`, `QuoteLayout.tsx`, `StatHeroLayout.tsx`, `StandardSplitLayout.tsx`, `FlowLayout.tsx`, `BlockRenderer.tsx` (image case renders credit), `LayoutRenderer.tsx` (frames receive `position: number` = `card.orderIndex`; `imageFocus` → `ImageFocusLayout`), `Adjustable.tsx` + `components/editor/SelectionLayer.tsx` (a `fixed` element: selectable, shows the bin and later Replace, no move/resize/rotate handles), `SlideSurface.tsx` (sets `--slide-pad` from the caller's padding so a background can bleed), `LayoutWireframe.tsx`, `everyBlockRenders.test.tsx`, `CLAUDE.md` (Families vs frames; photo placements)

**Interfaces:**
- Produces: `PhotoCredit({ credit }: { credit?: PhotoCredit })` (renders `Photo: <name> / Pexels` linking `credit.url`, `data-photo-credit`, nothing for `source:'url'` or absent); `BackgroundPhoto({ block, index })` (absolute, `inset: calc(-1 * var(--slide-pad))`, `object-cover`, scrim `bg-gradient-to-t from-black/75 via-black/40 to-black/20`, `Adjustable fixed`); frame props `{ blocks; variant; position: number }`.

Placements (spec §4 table): hero and quote with a photo → `BackgroundPhoto` + white text over the scrim (text gets `data-on-photo` so the unlayered user-colour rule in `index.css` is excluded like text on an accent fill); statHero with a photo → number one side, photo the other (`@min-[640px]:grid-cols-2`); standardSplit → photo side `position % 2 ? 'left' : 'right'`; FlowLayout with exactly one image among other groups → photo as a top band (`aspect-[21/6] object-cover`), its leaf skipped via a `skip` index set so `inferGroups` is untouched; ImageFocusLayout → photo ~60% width, heading and caption beside (stacked under `@min-[640px]` threshold).

- [ ] **Step 1:** Extend `everyBlockRenders`: the every-block card plus variants with exactly one image appended for hero, quote, statHero, standardSplit, imageFocus and each family; assert each block's text once, every image `src` once, and a `data-photo-credit` for a pexels credit.
- [ ] **Step 2:** Test in `BackgroundPhoto` render: markup contains the scrim class.
- [ ] **Step 3:** Run → FAIL. **Step 4:** Implement. **Step 5:** Run `npm run test` → PASS; `slideWidthOnly.test.ts` passes (container queries only).
- [ ] **Step 6:** By hand: harness deck with photos (use real Pexels URLs) in all themes; select a background photo (box + bin, no handles); credit visible on canvas, presenter, cover.
- [ ] **Step 7:** Commit `feat(layout): photo placements, background photos and credits`.

---

## Phase 3 — Image slides and editing

### Task 9: Image picker

**Files:**
- Create: `src/components/images/ImagePicker.tsx`, `src/components/images/ImagePicker.test.tsx`, `src/images/link.ts`, `src/images/link.test.ts`

**Interfaces:**
- Produces: `photoFromLink(text: string): Photo | null` (http/https URL only; `alt: ''`, credit `{name:'', url:'', source:'url'}`); `ImagePicker({ open, onClose, onPick, initialQuery }: { open: boolean; onClose(): void; onPick(photo: Photo): void; initialQuery?: string })` — `Modal` with a search field (debounced 400 ms, aborts the previous request), a 3-column grid of results with credits, a "Paste an image link" field, and `PHOTOS_NOT_SET_UP` in place of search when `!imagesConfigured`.

- [ ] **Step 1:** Tests: `photoFromLink` accepts `https://x/y.jpg`, rejects `javascript:…`, `ftp:…`, plain words; render test: unconfigured → contains the not-set-up copy and the paste field, no `VITE_`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS. Commit `feat(images): photo picker`.

### Task 10: Image slide type, Insert → Image, Replace

**Files:**
- Modify: `src/engine/cardTemplates.ts`, `src/engine/newContent.ts`, `src/store/presentationStore.ts` (`replaceImage`), `src/components/editor/CardTypeModal.tsx`, `ContentPicker.tsx`/`ContentGrid` (Image tile + wireframe), `ElementActions.tsx` (Replace), `CLAUDE.md` (Card types, Add content, bin-and-plus)
- Test: `cardTemplates.test.ts`, `newContent.test.ts`, a store test beside the existing ones

**Interfaces:**
- Consumes: `Photo`, `ImagePicker`.
- Produces: `CREATABLE_KINDS` + `'image'`; `starterBlocks(kind, photo?: Photo)` (`'image'` requires the photo: heading `Image title`, image block, paragraph `Add a caption`); `layoutForKind('image') = 'imageFocus'`; `CONTENT_TYPES` + `'image'`, `imageBlock(photo: Photo): ImageBlock`; store `replaceImage(cardId: string, blockIndex: number, photo: Photo): void` (rewrites `url`, `alt`, `credit`, keeps `prompt` if the photo has none; one undo step; written immediately).

- [ ] **Step 1:** Tests: image template round-trips through `cardKindOf` as `'image'`; `starterBlocks('image')` without a photo throws; `imageBlock` shape; `replaceImage` keeps every other block and the card's `inline`/`adjusts` deep-equal.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement: choosing Image in Add slide or Insert opens `ImagePicker`; the card/block is created on pick only. Replace appears in `ElementActions` beside the bin when the selected block is an image and stops press and click like the bin.
- [ ] **Step 4:** Run → PASS. By hand: add an image slide, insert an image, replace, undo, remove. Commit `feat(editor): image slides, insert image, replace photo`.

---

## Phase 4 — Themes

### Task 11: Five new themes with their fonts

**Files:**
- Modify: `package.json` (add `@fontsource-variable/source-serif-4`, `@fontsource/caveat`, `@fontsource/atkinson-hyperlegible`, `@fontsource-variable/jetbrains-mono`, `@fontsource-variable/bricolage-grotesque`; Boardroom uses the installed `@fontsource-variable/hanken-grotesk`), `src/main.tsx` (imports), `src/lib/theme-tokens.ts` (5 themes), `src/lib/theme-tokens.test.ts` (decoration-kinds rule scoped to the five space ids), `src/video/renderFrame.tsx` (`skipFonts: false` with `fontEmbedCSS` from one `getFontEmbedCSS(stage)` per video), `src/components/editor/ToolsPanel.tsx` ThemeGrid if it assumes five, `CLAUDE.md` (Theme system: ten built-ins; fonts are now loaded; video embeds them)

**Interfaces:** Produces themes:

| id | name | heading / body font | bg / fg / accent | decor (via `celestial.glow` CSS layers + optional `grid`) |
|---|---|---|---|---|
| `paper` | Paper | Source Serif 4 / Source Serif 4 | `#f6f1e7` / `#1b1a17` / `#b3261e` | thin horizontal rules + one red margin line |
| `chalk` | Chalkboard | Caveat / Atkinson Hyperlegible | `#1f2a24` / `#f2f0e6` / `#f2c94c` | chalk-dust noise (layered radial dots) |
| `blueprint` | Blueprint | JetBrains Mono / Atkinson Hyperlegible | `#0f3057` / `#eaf2ff` / `#7fd1ff` | `grid` lines, heavy every 5th |
| `pop` | Pop | Bricolage Grotesque / Bricolage Grotesque | `#ffffff` / `#111111` / `#ff4f1f` | two large offset colour blocks (corner) |
| `boardroom` | Boardroom | Hanken Grotesk / Hanken Grotesk | `#f4f5f7` / `#16202c` / `#1f4e8c` | none beyond a faint top rule |

Caveat is headings only (legibility); exact hexes may be tuned to pass the AA tests.

- [ ] **Step 1:** Tests: `BUILTIN_THEMES` has 10 themes with the ids above; each new theme passes the existing AA pairing checks; the scale floors from Task 2 hold.
- [ ] **Step 2:** Run → FAIL. **Step 3:** `npm install` the packages; implement themes and wireframe tiles. **Step 4:** Run → PASS; `npm run build` passes and the font files are separate assets (not inlined into the entry chunk).
- [ ] **Step 5:** By hand: harness in all ten themes; one narrated video frame in Chalkboard shows Caveat headings. Commit `feat(themes): Paper, Chalkboard, Blueprint, Pop, Boardroom`.

---

## Phase 5 — Exports

### Task 12: Photos in the PowerPoint

**Files:**
- Create: `src/export/imageData.ts`, `src/export/imageData.test.ts`
- Modify: `src/export/slideRenderers.ts` (`case 'image'`, hero/quote background), `src/export/exportDeck*.ts` entry (prefetch), `docs/superpowers/specs/2026-09-19-pptx-fit-design.md` (images are now embedded; failures fall back to alt text), `CLAUDE.md` (PPTX export)

**Interfaces:** Produces: `fetchImageData(url: string, fetchImpl?: typeof fetch): Promise<string | null>` (data URL `image/<type>;base64,…`; `null` on any failure or non-image content type); `prefetchDeckImages(cards: Card[]): Promise<Map<string, string>>` (url → data, parallel, failures omitted).

- [ ] **Step 1:** Read the "Implementation invariants" of both PPTX specs.
- [ ] **Step 2:** Tests: data URL from a mocked JPEG response; `null` on 404, on network error, on `text/html`; `prefetchDeckImages` dedupes urls.
- [ ] **Step 3:** Run → FAIL. **Step 4:** Implement; renderer: image in its box with `sizing: { type: 'cover' }`; hero/quote background photo full-slide with a black rectangle at 45% transparency over it and white text; credit as 8pt text bottom-right; missing data → today's alt-text box.
- [ ] **Step 5:** Run `npm run test` → PASS. By hand: export a deck with photos, open in PowerPoint. Commit `feat(export): embed photos in the PowerPoint`.

### Task 13: End-to-end check

- [ ] Generate a deck with the Pexels key: photos on some slides, title slide has a background photo, no neighbouring repeats.
- [ ] Remove the key, restart, generate: deck arrives with no photos, no error shown.
- [ ] Block `api.pexels.com` in DevTools during "Finding photos": deck still arrives.
- [ ] Cancel during "Finding photos": no deck.
- [ ] Narrated video of a photo deck: photos visible in frames.
- [ ] `npm run lint`, `npm run build`, `npm run test` all pass. Report results faithfully.
