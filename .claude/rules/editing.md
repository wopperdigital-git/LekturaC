---
paths:
  - "src/components/editor/**"
  - "src/engine/**"
  - "src/store/presentationStore.ts"
  - "src/store/cardMutations.ts"
  - "src/lib/zoom.ts"
  - "src/lib/pan.ts"
  - "src/lib/temporaryInk.ts"
  - "src/pages/EditorPage.tsx"
---

# Editing model

- **Selection drills in**: first press selects the card, second the element, then edit. Escape steps out item → list → card. Scope (`engine/textScope.ts`) is element → card → deck; a character range narrows marks only.
- **Undo/redo** (`presentationStore.ts`) snapshots the whole `cards` array (cap 50), persisted by `persistCardsSync` diffing. The ⌘Z listener ignores inputs **but not a live text run** (the browser's undo only knows typing). `EditableText` repaints a live run whose text differs from the store.
- **Removal** (`engine/removeElement.ts`, pure): removing block N renumbers every later address (`textRef`, `adjusts`, typography keys, runs, item keys). Written **immediately** after dropping the card's pending `blockText:`/`inline:`/`adjusts:` saves (they'd put the element back). Removing the last element leaves a blank card.
- **Append-only adds**: list items (`engine/listItems.ts`, `MAX_LIST_ITEMS` 12) and Insert (`engine/newContent.ts`, `MAX_BLOCKS` 20) append at the end so no position-keyed formatting slides. Same immediate-write rule.
- **Add row** (`engine/insertBlock.ts`): inserts a `point` after its run. `withBlockInserted` is the **exact inverse of `withBlockRemoved`** (shared `remapInline`/`spell`; round-trip pinned at every position).
- **Marks** (`engine/marks.ts`): flags bold/italic/underline; value marks `color`, `fontFamily`, `fontScale` replace in range (no toggle); size is a multiple (`em`). `EditableText` does not clear the reported range on blur (the colour input must take focus).
- **A wider style write clears the same fields at narrower scopes** (`engine/styleOverrides.ts`), or a slide styled once ignores the deck forever. Character marks are never touched.
- **Unreadable colours are dropped** (`engine/readableColor.ts`): a stored text colour under 3:1 on the theme background is removed on `setTheme` and `loadDeck`.
- **Text colour** needs two mechanisms: `data-deck-color` + `--slide-user-color` via an **unlayered** rule in `index.css` (beats Tailwind's layered utilities), and `Adjustable` setting inline `color`.
- **Font preview on hover** (`engine/fontPreview.ts`): derived copies, never stored; shares `applyTextStylePatch` with the real write so they can't diverge.
- **Size** is a percentage of the theme's scale (70–160%; 50–300% for a range), not points.
- **Layout picker** is a grid of `LayoutWireframe`s. **Each wireframe mirrors its component's JSX**; change how a layout looks and you must update its wireframe.
- **Grid** (`engine/gridSnap.ts`): shares the frame's origin and unit (top-left of `SlideBody`, content width ÷ 40); change one side, change the other. Snap is on by default, independent of Show.
- **Zoom** is a CSS transform (`ZoomFrame`, `lib/zoom.ts`): one tree at every zoom; the column is always laid out `COLUMN_MAX_WIDTH_PX` wide and scaled to fit. **Every gesture divides by the drawn scale** (`zoom × fitScale`, from `CanvasZoomContext`). Ctrl+wheel and pinch are native non-passive listeners. Ctrl+drag / right-drag / Move tool pan (`useCanvasPan`, capture phase).
- **`ToolbarMenu` and the font dropdown close on outside press in the capture phase** (the pan hook stops presses in its own capture phase). Panel buttons refuse focus on mousedown so the caret survives.

## Element nudging (`engine/blockAdjust.ts`, `engine/frameGeometry.ts`, `Adjustable.tsx`, `SelectionLayer.tsx`)

- `BlockAdjust = {dx, dy, w?, h?, rotation}` per block index, in **fractions of content width** (height too). A delta, applied as a `transform`. A nudge back to neutral is **deleted**, not stored as zeroes (presence routes the export's per-element path).
- `Adjustable` (`display: contents`) applies the adjustment imperatively to its child; nested holders are guarded (`AdjustedIndexContext`). **Every place a block renders must be wrapped.**
- A resize probes the layout at the new size (`measureAt`) before computing displacement. A height on a column-flex child also sets `flex: none`. **Every gesture is computed from the frame captured at the press.**
- **`BlockDataContext` (data) vs `BlockAdjustContext` (interaction) is a load-bearing split**: every surface provides data so nudges, marks and typography render in presenter and thumbnails. Marks are read from `BlockDataContext`, never editor-only `TextEditingContext`.

## Drawing layer (`engine/overlay.ts`, `components/editor/OverlayLayer.tsx`, `DrawingSurface.tsx`)

- Ink is `card.overlay`: strokes and shapes in content-width fractions, origin top-left of `SlideBody`. Limits 300 items / 1500 points per stroke, enforced at capture, parse and commit. Strokes and shapes commit **once on release** (one undo step).
- **`cardRow` must never name `overlay`** (mutation-checked): it is the upsert every card save uses. Ink is written by `persistOverlay` in its own best-effort update; failure sets `overlayWarning`, never `status: 'error'`.
- Temporary ink lives in `localStorage` (user-namespaced), editor-only, never in DB/undo/export.
- **The PPTX export ignores `card.overlay`.**

## Card types (`engine/cardTemplates.ts`, `CardTypeModal.tsx`)

Add-only: a slide's type cannot be changed later (a reshape moves text to different indices). New cards are placeholder text, never a generation call. `title` names `hero`; `image` is born from a picked photo (`imageFocus`); `gallery` cannot be created.
