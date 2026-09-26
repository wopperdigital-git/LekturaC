# Drawing layer: pen, marker, eraser (sub-project 2 of 4)

Date: 2026-09-26. Status: written spec, awaiting review. Builds on
`2026-09-26-editor-floating-toolbar-design.md` (sub-project 1, built).

## Context and decisions already made

From the conversation that split the original request into four sub-projects:

- Drawings are a **free overlay layer** above each slide, in card coordinates. Text keeps flowing under
  the layout engine; this layer is the only free-positioned content in the app. (Shapes, sub-project 3,
  will live on the same layer; PPTX export, sub-project 4, is separate.)
- A per-stroke choice of **"part of the slide"** (stored, shown in the presenter and thumbnails,
  covered by undo) or **"temporary annotation"** (kept in this browser only, survives reload, never in
  the deck).
- Storage for "part of the slide" is **option A**: a new `overlay` field on each card, migration 0013,
  written in a **separate best-effort update so it can never gate card writes** (the 0006 / 0008 lesson
  in CLAUDE.md: a missing column there breaks every card save).
- Pen, marker, eraser; three brush sizes (dot, small circle, big circle). The eraser removes **whole
  strokes** it touches (not pixels).

## Goal and success criteria

- A pen button on the floating toolbar activates the pen tool and opens a small popover: **tool**
  (Pen / Marker / Eraser), **size** (dot / small / big), **colour**, **keep** (On slide / Temporary), and
  **Clear** buttons for temporary ink.
- With the pen tool active, dragging on any slide draws a smooth stroke where the pointer goes, at any
  zoom, without selecting the slide or starting a text edit.
- "On slide" strokes persist with the deck, render in the editor, presenter, narration viewer and
  thumbnails, and undo/redo like any other edit (one step per stroke or per erase gesture).
- "Temporary" strokes render in the editor only, survive a reload, are never written to the database,
  never enter undo history, and can be cleared for the slide or the deck.
- On a database without migration 0013, **everything else still saves**; only drawings fail to save, and
  the user is told.

Non-goals: shapes (sub-project 3); PPTX export of ink (sub-project 4; until then the export ignores
overlays, stated in CLAUDE.md); pixel-level erasing; pressure or tilt; drawing in the presenter (temporary
ink is shown in the editor only for now); selecting, moving or recolouring a stroke after it is drawn.

## Data model (`engine/overlay.ts`, pure)

```ts
type Stroke = {
  id: string
  kind: 'stroke'
  tool: 'pen' | 'marker'
  /** 'accent' | 'foreground' (theme colours) or '#rrggbb'. Resolved at render. */
  color: string
  /** Line width, as a fraction of the card's content width. */
  width: number
  /** Points as [x, y], both fractions of the card's content width. */
  points: [number, number][]
}
type OverlayItem = Stroke // shapes join this union in sub-project 3
Card.overlay?: OverlayItem[]   // absent = none; never stored as []
```

- **Units** are fractions of content width for x *and* y, the same unit as `card.adjusts`, so a drawing
  scales with the card at every card width and zoom. A card's height is content-driven, so ink keeps its
  distance from the top edge if text edits change the height; accepted.
- **Sizes:** dot / small / big = 0.003 / 0.007 / 0.016 of content width (about 3 / 6 / 14 px at a normal
  width); marker draws at 2.5x width and 40% opacity with round caps. A one-point stroke (a click) is a
  dot.
- `parseOverlay(raw)` (read boundary, like `parseAdjusts`): zod-validates each item and **drops invalid
  ones** rather than failing the card; `[]`/missing gives `undefined`.
- **Bounds** (a row must stay small): `MAX_STROKES_PER_CARD = 300`, `MAX_POINTS_PER_STROKE = 1500`.
  Capture decimates points closer than 0.4% of width to the last kept point and rounds to 4 decimals. At
  the stroke limit drawing is refused and the popover says why (a silent refusal would read as broken).
- Pure helpers, all tested: `appendStroke`, `eraseStrokes(overlay, ids)`, `strokesHit(overlay, point,
  radius)` (distance from the point to each stroke's segments), `decimate`, `strokePath(stroke, width)` (SVG
  path data in pixels), `overlayChanged(a, b)`.

## Rendering

- `components/editor/OverlayLayer.tsx` (despite the folder, no editor-only imports; it is drawn on every
  surface): one absolutely positioned SVG over the card's content box, `pointer-events: none`,
  `overflow: visible`, `stroke-linecap/linejoin: round`, `fill: none`. Coordinates are `fraction *
  contentWidth`, so it needs only the content width `SlideBody` already measures.
- `SlideBody`'s `card` prop grows to `Pick<Card, 'adjusts' | 'inline' | 'overlay'>`, and the overlay rides
  `BlockDataContext` (the data half of the existing data/interaction split), so it reaches the presenter,
  narration viewer and thumbnails exactly as nudges do. Drawn above content and the grid, below the
  selection box.
- Temporary ink is a second `OverlayLayer` fed by the editor only (through the drawing context below), so
  no other surface can show it.

## Drawing surface and gestures

- `DrawingSurface` (in `components/editor/`), rendered by `SlideBody` only when the editor's drawing
  context says the pen tool is active. An absolutely positioned transparent layer over the content box
  with the same 256 px bleed as the grid (so ink can start over the card's padding), `touch-action: none`,
  crosshair cursor, above the selection box. It stops the press and the click, so drawing never selects
  the card or an element or starts a text edit.
- **Coordinates come from the content box's own screen rect:** `fraction = (clientX - rect.left) /
  rect.width` (and the same for y, divided by `rect.width`). The zoom is a CSS transform that scales the
  rect and the pointer distance together, so this is zoom-independent and needs no zoom context. Every
  gesture is computed from the rect captured at the press.
- Pointer capture on the surface; points are collected in component state and drawn live; **the stroke is
  committed once, on release** (one undo step). Ctrl+drag still pans, because the pan hook's capture-phase
  listener sits above.
- **Eraser:** on move, strokes within the eraser radius (the chosen size) of the pointer are marked and
  drawn faded; on release they are removed in one commit. Eraser acts on the layer chosen in "keep": On
  slide erases stored strokes, Temporary erases temporary ones.

## Tool state

`EditorTool` gains `'pen'`. New view state in `EditorPage`, beside zoom, grid and tool (not stored, not
undoable): `PenSettings = { tool: 'pen' | 'marker' | 'eraser'; size: 'dot' | 'small' | 'big'; color:
string; keep: 'slide' | 'temporary' }`, defaults pen / small / accent / slide. A `DrawingContext`, provided
per card by `CardCanvas` the way `BlockAdjustContext` is, carries `{ settings, commitStroke(stroke),
eraseStrokes(ids), temporaryOverlay }` with the card id already applied.

Escape while the pen tool is active returns to Select elements (before the page's own Escape handling
steps the selection out). Switching tool from the arrow menu leaves pen.

## Toolbar UI

`EditorToolbar` gains a pen button after the T button (the tool list is already data-driven). Clicking it
sets the tool to `'pen'` and toggles a popover (`ToolbarMenu`'s open/close mechanics, generalised to render
arbitrary content rather than only a list of items). Popover rows: a segmented Pen / Marker / Eraser; three
circles (dot, small, big) showing the real sizes; a colour row (accent, text colour, then the existing 12
`COLOR_CHOICES`); a segmented **On slide / Temporary**; and, when any temporary ink exists, **Clear this
slide** and **Clear all slides**. The active button state shows while the tool is pen.

## Persistence

**"On slide" strokes** (`store/presentationStore.ts`):
- `Card.overlay` is part of the card, so the existing whole-`cards` history snapshot covers undo/redo
  without new machinery. New action `setOverlay(cardId, overlay)` pushes one history entry and writes
  **immediately** (a released gesture, like `setBlockAdjust(..., commit)`).
- **`cardRow` does not include `overlay`.** A `persistOverlay(cardId, overlay)` does
  `update cards set overlay = ... where id = ...` in its own try/catch and never sets the store's error
  status. On failure the store sets `overlayWarning` (e.g. "Drawings couldn't be saved. Run migration
  0013 in Supabase."), which `EditorPage` shows as a non-blocking notice next to the existing save
  banners. The deck itself still saves.
- Undo/redo and card deletion/re-insertion go through `persistCardsSync`, which upserts rows without the
  overlay column. After it, `overlaysToWrite(previous, next)` (pure, tested) lists the cards whose overlay
  differs, including cards re-created by undoing a delete, and each is written with `persistOverlay`.
- `cardFromRow` gains `overlay: parseOverlay(row.overlay)`; a database without the column simply has
  none. A test pins that `cardRow` omits `overlay` and `cardFromRow` reads it.
- `supabase/migrations/0013_add_card_overlay.sql`:
  `alter table cards add column if not exists overlay jsonb not null default '[]'::jsonb;`. RLS on `cards`
  already applies per row; nothing new. **Not applied by this work**; it is run by hand, like every
  migration here.

**Temporary ink** (`lib/temporaryInk.ts`, pure over a storage-like interface):
- `localStorage` key `lekturac:temp-ink:<uid>:<deckId>`, value `{ [cardId]: OverlayItem[] }`. **Namespaced
  by user id**, and never falling back to an un-namespaced key while the session hydrates (the rule in
  CLAUDE.md's brief-drafts section, for the same reason: `signOut()` does not clear storage). Reads and
  writes are try/catch'd; blocked storage means ink is simply not kept. Cards that no longer exist are
  pruned on load. Same bounds as stored ink, plus a total size cap so one deck cannot fill the quota.
- It is never written to the database, exported, or put in undo history.

## Files

- new: `engine/overlay.ts` + test, `lib/temporaryInk.ts` + test, `components/editor/OverlayLayer.tsx` +
  test, `components/editor/DrawingSurface.tsx`, `components/editor/drawingContext.ts`,
  `components/editor/PenPopover.tsx`, `supabase/migrations/0013_add_card_overlay.sql`
- changed: `engine/contentBlocks.ts` (`overlay` on `Card`), `engine/editorTool.ts` (+ test),
  `store/presentationStore.ts` (`setOverlay`, `persistOverlay`, `overlaysToWrite`, `cardFromRow`,
  `overlayWarning`), `components/layouts/SlideBody.tsx`, `components/layouts/adjustContext.ts`
  (`BlockDataContext` carries `overlay`), `components/editor/CardCanvas.tsx`, `EditorToolbar.tsx` (+ test),
  `ToolbarMenu.tsx`, `pages/EditorPage.tsx`, `CLAUDE.md`.

## Testing

Pure, colocated (the repo's bar): `overlay.test.ts` (`parseOverlay` drops invalid items and maps empty to
`undefined`; `decimate` keeps endpoints and honours the cap; `strokesHit` on segments, not just vertices;
`eraseStrokes` never touches other strokes; the stroke and point limits), `temporaryInk.test.ts` (key is
user-namespaced; no key while the user is unknown; corrupt JSON and a throwing store are survived; pruning),
`overlaysToWrite` (undo of a delete re-writes the overlay; unchanged cards are not written), the `cardRow`
omits / `cardFromRow` reads round-trip, `editorTool` (`'pen'` never pans). Render smoke tests, the same
deliberate exception as `ToolsPanel.test.tsx`: `OverlayLayer` draws a path per stroke and a dot for a
one-point stroke, and draws nothing for an empty overlay; the toolbar has a pen button. Mutation-check the
rule that `cardRow` must not name `overlay`.

Not testable without a browser, to be tried by hand: the drawing gesture itself at several zooms,
pointer capture, eraser feel, the popover, reload persistence of temporary ink, and behaviour against a
database with and without migration 0013.

## Risks and open questions for review

1. **Temporary ink is editor-only for now.** The natural use of a temporary annotation is while
   presenting, but drawing in the presenter is a different surface with its own pointer model; deferred,
   not designed here. Say if it should come first.
2. **Ink is anchored to the card's top-left in width units.** Editing a slide's text so its height changes
   does not move the ink with the text. Inherent to a free layer over reflowing content.
3. **Eraser removes whole strokes**, chosen for simplicity; a long stroke cannot be partly erased.
4. **Migration 0013 must be run** before "On slide" drawings persist; until then the notice appears and
   the strokes exist only in memory for the session.
5. PPTX export ignores ink until sub-project 4, so an exported deck will silently lack drawings; CLAUDE.md
   records that.
