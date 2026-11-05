# Visual slides: layouts, photos, image slides, more themes

Date: 2026-11-04. Status: draft for approval.

## Intent

Generated decks look plain: every slide is the same shape (a box sized to its
text, heading top-left, small body), there are never pictures, the big moments
(a striking number, the closing line) are drawn at body size, the two visual
treatments look alike, and all five themes are one space-themed family in
different colours. The user's reference is Gamma: images where they help and
slides that change shape from one to the next.

Success: a freshly generated 7-slide deck has photos on the slides that suit
them, no two neighbouring slides share an arrangement, a stat or quote slide
reads from across a room, and the theme picker offers looks that are not space.

## Decided by the user

- Photos appear on the slides that need them and would look good with them, not
  on every slide.
- Where a photo sits is left to us (the placements below are our call).
- A free image API supplies the photos; the user is fetching a Pexels key.
- Add an Image slide type.
- Add more themes.
- No mockup round: go straight to building.

## Goals

1. **Layout refresh.** Slides fill a presentation-shaped frame; stat and quote
   slides are drawn large; `expressive` looks clearly different from
   `structured`; neighbouring slides never share an arrangement.
2. **Photos at generation.** The model names a photo per slide where one helps;
   the app finds it on Pexels after generation; the layout engine places it.
3. **Image slide type** in Add slide and **Image** in the Insert menu, plus
   swap and remove on a selected photo.
4. **Five new themes** outside the space family.
5. **Exports carry the photos**: PPTX embeds them, the narrated video draws them.

## Non-goals

- AI image generation (only stock search).
- Uploading your own image files (needs a Storage bucket and migration; later).
- A free-form canvas: the layout engine still decides where things go; photos
  are blocks like any other.
- Changing an existing slide's type (still add-only, see Card types).
- Custom user themes.

## Anti-goals (a failure even if it works)

- A photo that fights the text: text over a photo without a scrim, or a photo
  crammed beside a long list.
- A deck lost or delayed noticeably because image search failed. Photos are
  decoration on the deck, never a reason it does not arrive.
- Breaking "generate once": finding photos must not be a second model call for
  card content.
- Breaking the block-index invariant (marks, nudges, typography keyed by index).
- Photos shown without the photographer credit Pexels requires.

## Constraints (from the codebase)

- Slides lay out at `SLIDE_WIDTH_PX` (976) everywhere and scale; layouts use
  container queries, never screen breakpoints (`slideWidthOnly.test.ts`).
- Frames end with `<Leftovers>`; `inferGroups` never reorders, drops or
  duplicates a block; a new block type or layout goes into
  `everyBlockRenders.test.tsx`.
- Every layout has a wireframe in `LayoutPicker.tsx` that must mirror its JSX.
- Keys are `VITE_*` and baked into the bundle; a missing key drops the feature,
  never the app. Users never see a variable name outside `/new` and `/login`.
- `cardRow` names only columns that exist; a new card field must ride inside an
  existing jsonb column or come with a migration that is called out.
- The video skips fonts today (`skipFonts`); adding web fonts means revisiting it.
- Both `images.pexels.com` and the Pexels API send
  `Access-Control-Allow-Origin: *` (checked 2026-11-04), so the browser can
  search, draw to canvas (video) and fetch bytes (PPTX).

## Design

### 1. Content model

- `imageBlockSchema` gains optional `credit: { name: string; url: string;
  source: 'pexels' | 'url' }` and keeps `url`, `alt`, `prompt` (the search
  phrase that found it). Optional, so every existing row still parses. Blocks
  live in the existing `cards.blocks` jsonb: **no migration**.
- The generation schema gains an optional per-card `imageQuery` (string, 2-8
  words), caught to `undefined` on anything malformed (`.catch`), so a bad value
  never costs the deck. It is not stored on the card.

### 2. Generation (prompt + pipeline)

- Prompt: delete the line "We cannot draw charts, maps, diagrams, photos or
  illustrations"; replace with an IMAGES section: add `imageQuery` only when the
  slide's point is something a photograph can show (a place, an object, people
  doing something, a natural scene); 2-6 concrete English words naming what is
  in the frame, no text, logos, charts or named real people; always give one
  for the title slide; aim for roughly a third to a half of slides; skip
  definitions, comparisons of abstract ideas and dense lists. Charts, maps and
  diagrams stay undrawable.
- `plan.visualType` values `hero_image`/`photo` are not checked by
  `VISUAL_MISMATCH` (a new flag would buy repair calls for decoration).
- **Photo lookup is a pipeline stage after validation/repair, before ingest**
  (`generation/images.ts`, pure over an injected `search(query, signal)`):
  for each card with an `imageQuery`, search Pexels (landscape, 1 result,
  `per_page` a few to skip duplicates already used in the deck), and **append**
  an `image` block at the end of that card's blocks (appending keeps every
  existing block index). Searches run in parallel, honour the job's signal, and
  any failure (no key, network, 429, zero results) leaves that card without a
  photo. The deck job's timeline gets a "Finding photos" row.
- Token budgets: an image query is ~10 tokens per slide; no budget change.

### 3. Image provider (`src/images/`)

- `images/pexels.ts`: the only network code. `searchPhotos(query, {signal,
  perPage, orientation})` → `{ url, alt, credit }[]`, using
  `Authorization: <key>` on `https://api.pexels.com/v1/search`. Picks the
  `large` size (~940px wide) for slides and `large2x` for background use.
- `VITE_PEXELS_API_KEY` in `.env.example`; absent → `imagesConfigured` false:
  generation skips the stage, the picker shows "Paste an image link" only, and
  the console names the variable (`warnMissingKey`), users never do
  (`setupCopy.ts` gets a line for the picker).
- Same shape as the AI providers: an `ImageProvider` interface so Unsplash or
  Openverse can be added later as a second link.
- Credits: `credit.name` + link to the photographer page, plus "Pexels".

### 4. Layouts

**Frame.** A slide's body gets a **minimum** height of 16:9 of its own width
(`min-height` from the measured `SlideBody` width or `aspect-ratio` as a
minimum via a container unit), with content vertically centred. A slide still
grows past it when its content is taller: this is a floor, not a fixed ratio,
so the "no fixed aspect ratio" rule stands (CLAUDE.md is updated to say floor).
Every surface (canvas, presenter, thumbnails, `SlidePreview`, video) gets it
through `SlideSurface`/`SlideBody`, so they cannot disagree.

**Type.** Raise every built-in theme's scale from about `[2.75, 1.875, 1.375,
1]` to about `[3.5, 2.5, 1.625, 1.25]` (tuned per theme). `statHero`'s value
goes to ~6rem (expressive ~8rem), the quote frame's text to ~2.25rem. The PPTX
export reads the theme scale and fits text itself, so it follows; check its
fit tests.

**Visual treatments.** `structured` stays calm (surface, hairline rules).
`expressive` becomes visibly bolder in every frame and family: accent-filled
panel behind the heading or the number, oversized numerals and quote marks,
heavier heading weight. Both treatments are drawn in each wireframe.

**Photo placements** (decided by the classifier from blocks, never stored as
pixels):

| Card has a photo and… | Arrangement | New/changed |
|---|---|---|
| is the title slide (`hero`) | photo fills the slide, dark gradient scrim, white h1 bottom-left | `HeroLayout` gains a background-photo branch |
| is a quote | photo fills the slide, scrim, large quote centred | `QuoteLayout` gains it |
| one paragraph or short text | photo half the slide, text the other half; side alternates by deck position | `standardSplit`, side from `orderIndex` parity |
| one stat | huge number one side, photo the other | `statHero` gains a photo side |
| list / timeline / comparison | photo as a band across the top (~30% height), content below | `FlowLayout` draws the band itself, so every list/timeline/comparison variety keeps working with a photo (no separate frame) |
| image slide (photo + heading + caption) | photo large, heading and caption beside or under it | new `imageFocus` frame |
| two or more photos, no paragraph | gallery (unchanged) | |

Text over a photo always sits on a scrim that keeps it at AA contrast whatever
the photo; `readableColor`'s user colour rule still applies on top of the
scrim colour. Each photo shows its credit in small text on its bottom edge
(`data-photo-credit`), on every surface, not selectable as an element.

**Variety across the deck.** `engine/varyLayouts.ts` (pure, tested), run at
ingest after `generatedLayout`: walk the cards in order; where a card on
`'auto'` would resolve to the same layout as the previous card, give it the
next variety of its own type (`layoutVarieties`: e.g. `iconGrid` → `checklist`,
`timeline` → `timelineRow`, `statGrid` → `statList`, `comparison` →
`comparisonTable`) as an explicit `layout`. Never changes blocks, so the index
invariant holds. The classifier still never awards the varieties on its own.

### 5. Image slide type and editing

- `CREATABLE_KINDS` gains `image`; `starterBlocks('image')` = heading + image +
  paragraph caption. `cardKindOf` recognises one image + heading as `image`;
  `layoutVarieties('image')` = `imageFocus`, `standardSplit`.
- Because an image needs a URL, choosing Image in Add slide opens
  **`ImagePicker`** (modal): a search field (Pexels, results in a grid with
  credits), and "Paste an image link" (credit `source: 'url'`, no credit line).
  The card is created only when a photo is picked.
- Insert menu gains **Image** (appends an image block via the same picker;
  `newContent.ts`).
- Selecting a photo shows a **Replace** action next to the bin
  (`ElementActions`), opening the picker; it rewrites that block's `url`,
  `alt`, `credit`, `prompt` in place (same index, one undo step). Remove is the
  existing bin.
- `gallery` stays non-creatable.

### 6. Exports

- **PPTX**: replace the alt-text stand-in with the picture: fetch the image
  bytes at export time, embed as data, cover-crop to the block's box; on any
  fetch failure fall back to today's alt-text box. Background photos (hero,
  quote) go full-slide behind a semi-transparent dark rectangle. Credit as small
  text. The `2026-09-19-pptx-fit-design.md` invariants are read first and
  updated where this changes one.
- **Video**: html-to-image already draws `<img>` from CORS hosts; verify by
  hand that photos appear and that the frame waits for images to decode.

### 7. Themes

Five new built-ins, new ids, in addition to the five space themes (existing ids
and decks untouched):

| Name (id) | Feel | Decoration |
|---|---|---|
| Paper (`paper`) | warm off-white, black ink, red accent, serif headings | thin rules, a margin line |
| Chalkboard (`chalk`) | green-black board, chalk white text, yellow accent | faint chalk-dust texture (CSS noise) |
| Blueprint (`blueprint`) | deep blue, white lines, mono labels | engineering grid lines |
| Pop (`pop`) | bright white with saturated colour blocks, heavy sans | big offset colour shapes |
| Boardroom (`boardroom`) | neutral greys, navy accent, clean sans | none, a single accent rule |

- The theme's decoration field is generalised: `celestial` keeps its meaning
  for the space themes; the new themes use new decoration kinds (rules, grid,
  noise, colour blocks) as CSS layers, never images. The "two or three
  decoration kinds" test is scoped to the space themes.
- Fonts come from `@fontsource` packages (bundled, no CDN) like the chrome's
  Archivo. That ends "the app loads no web fonts": the video's `skipFonts` must
  be revisited so frames use the theme fonts, and the PPTX names the font
  (falls back if the viewer lacks it, accepted).
- Every palette's text/background pairs are AA-checked in `theme-tokens.test.ts`
  like the existing ones; each theme gets its `ThemeGrid` wireframe.

## Order of work

1. Layout refresh (frame floor, type scale, expressive, variety pass).
2. Image provider + generation stage + photo placements + credits.
3. Image slide type, picker, Insert, Replace.
4. Five themes (+ fonts, video font check).
5. PPTX embedding; video check.

Each step ships on its own with tests passing.

## Testing

- Pure, colocated: `images/pexels.test.ts` (request, parsing, abort, error
  mapping, missing key), `generation/images.test.ts` (append keeps indices, a
  failure leaves the card unchanged, duplicates skipped, signal honoured),
  `varyLayouts.test.ts`, schema `.catch` for `imageQuery`, `cardTemplates`
  round-trip for `image`, theme contrast.
- `everyBlockRenders.test.tsx` gains `imageFocus`, the photo band in every
  family, and the photo branches of hero/quote/statHero/split.
- By hand in the browser: a generated deck with the key, without the key, with
  the network blocked during the photo stage; presenter, thumbnails, dashboard
  cover, video, PPTX opened in PowerPoint.

## Left to the builder

- Exact type sizes per theme, scrim gradient, band height, credit styling.
- How the frame floor is implemented (container units vs measured width), as
  long as every surface gets it from one place.
- The decoration CSS for each new theme and font picks within the stated feel.
- Whether `ImageProvider` is an interface now or a single module with the shape
  ready for a second provider.
