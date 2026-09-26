# Shapes (sub-project 3 of 4)

Date: 2026-09-26. Status: written spec, built straight after per the user's standing instruction ("I'll
check later and change it if necessary"). Builds on the toolbar shell and the drawing layer
(`2026-09-26-editor-floating-toolbar-design.md`, `2026-09-26-drawing-layer-design.md`).

## Decisions carried over

- Shapes live on the **same free overlay** as pen strokes (`card.overlay`), in fractions of the card's
  content width for x and y. One model, one save path, one undo path.
- The same **Keep** choice applies: *On slide* (stored, shown everywhere, undoable, needs migration 0013 to
  persist) or *Temporary* (this browser only, editor only).
- **Six basic shapes only:** rectangle, rounded rectangle, ellipse, triangle, diamond, arrow.
- The overlay is written by its own best-effort update; nothing here touches `cardRow`.

## Goal and success criteria

- A shapes button on the floating toolbar opens a popover: the six shapes, **Outline / Filled**, colour,
  and Keep. Choosing a shape makes the shape tool active.
- Dragging on a slide rubber-bands the shape; a plain click drops a default-sized one. On release the
  shape is committed (one undo step), the tool returns to Select elements, and the new shape is selected.
- A selected shape shows the existing selection box: drag an edge to **move**, drag a handle to
  **resize**, a bin (or Backspace/Delete) to **delete**. No rotation in this version.
- With the grid's Snap on (the default), a drawn, moved or resized shape snaps to the grid, the same
  arithmetic as element nudges.
- In Select elements, pressing a shape selects it. The eraser also removes shapes.

Non-goals: rotation, per-shape colour editing after drawing, text inside shapes, lines/connectors, z-order
controls, PPTX export of shapes (sub-project 4).

## Data model (`engine/overlay.ts`)

```ts
type Shape = {
  id: string; kind: 'shape'
  shape: 'rectangle' | 'rounded' | 'ellipse' | 'triangle' | 'diamond' | 'arrow'
  color: string          // 'accent' | 'foreground' | '#rrggbb', as for strokes
  width: number          // outline width, fraction of content width
  fill: boolean          // true = the colour at 35% inside the outline
  x: number; y: number; w: number; h: number   // fractions of content width
}
type OverlayItem = Stroke | Shape
```

- `parseOverlay` validates each item by `kind` and drops malformed ones, as before. `w`, `h` must be in
  (0, 3]; `x`, `y` may run a little off the card (ink over the padding).
- The per-card limit (300) and `canAppendStroke` now count **items**, strokes and shapes together.
- `strokesHit` becomes `inkHit`: a shape is hit on its outline, or anywhere inside when filled, tested
  against `shapePolygon` (the shape as a closed polygon; an ellipse is sampled). Pure and tested.
- `normalizeShapeRect(a, b)` turns two drag corners into `{x, y, w, h}`, with a minimum size; a click
  (no drag) gives a default size centred on the point.

## Rendering

`OverlayLayer` draws by kind: `<rect>` (rounded via `rx`), `<ellipse>`, `<polygon>` for triangle, diamond and
arrow; outline `color` at `width`, fill at 35% when `fill`. It stays `pointer-events: none` **except** that,
when the editor passes `onPressItem`, shapes take `pointer-events: visiblePainted` so a press selects them
(an outline-only shape is hit on its outline, a filled one on its area, so an empty rectangle never blocks
text beneath it).

## Interaction

- `DrawingSurface` (already pointer-capturing and zoom-independent) gains a shape gesture: rubber-band
  from the press corner, live shape from local state, committed once on release.
- `ShapeSelectionLayer` (in `SlideBody`, editor only) reuses `SelectionOverlay` (with a new `rotatable`
  flag, off here) and `ElementActions` (the bin). The gesture's live frame is held in `SlideBody` state and
  merged into whichever layer holds the shape, so it tracks the pointer; it is **committed once, on
  release** (one undo step, one write), like a stroke. Snap uses `snapMove` / `snapResize` and `gridCell`.
- Selection is separate from element selection: `EditorPage` holds `selectedShape = { cardId, id, keep }`.
  Selecting a card or element clears it; selecting a shape clears the element selection. Escape clears it
  first; Backspace/Delete removes it; an undo that removes it clears the selection; leaving Select
  elements clears it.

## Tool state and UI

`EditorTool` gains `'shape'`. `ShapeSettings = { shape, fill }` is view state beside `PenSettings`; **colour
and Keep are shared with the pen** (changing one changes the other; they are "the ink"). The toolbar gets a
shapes button after the pen, with `ShapePopover` (a grid of the six shape icons, Outline/Filled, colour,
Keep, and the same "slide is full" note).

## Files

new: `components/editor/ShapePopover.tsx` + test, `components/editor/ShapeSelectionLayer.tsx`,
`engine/shapeSettings.ts` + test. changed: `engine/overlay.ts` + test, `engine/editorTool.ts` + test,
`components/editor/OverlayLayer.tsx` + test, `DrawingSurface.tsx`, `drawingContext.ts`,
`SelectionOverlay.tsx`, `EditorToolbar.tsx` + test, `CardCanvas.tsx`, `components/layouts/SlideBody.tsx`,
`pages/EditorPage.tsx`, `CLAUDE.md`.

## Testing

Pure: parsing shapes (drops malformed, bounds), `shapePolygon`, `inkHit` on shapes (outline vs filled
interior), `normalizeShapeRect` (any drag direction, minimum size, click default), shape settings. Render
smoke tests: `OverlayLayer` draws each of the six kinds and only makes shapes pressable when asked;
`ShapePopover` offers six shapes; the toolbar has a shapes button. Not tested without a browser: the
gestures themselves.

## Risks

- A filled shape can cover text and blocks presses on it; that is inherent to a free layer over text, and
  selecting/deleting it is one press away.
- Snap can nudge a resize by up to half a cell.
- PPTX export ignores shapes until sub-project 4.
