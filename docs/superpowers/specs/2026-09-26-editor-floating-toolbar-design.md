# Editor floating toolbar (sub-project 1 of 4)

Date: 2026-09-26. Status: design approved in conversation; written spec awaiting review.

## Context

The user asked for a floating toolbar at the top of the editor holding: undo/redo, an arrow tool
(hover menu: *Select elements* / *Move screen*), a **T** tool (pick a text level), a **pen** tool
(pen / marker / eraser, three brush sizes) and a **shapes** tool (six basic shapes).

That request is four independent pieces and is being built as four sub-projects, each with its own
spec, plan and build:

1. **Toolbar shell (this spec):** undo/redo, arrow tool with Select / Move screen, T tool.
2. Drawing layer: pen, marker, eraser, brush sizes, "part of slide" vs "temporary" (temporary is kept
   in `localStorage` per user/deck/card, survives reload, never in the deck), migration 0013 storing an
   `overlay` on each card in a *separate best-effort write* (must not gate card writes, see the 0006 /
   0008 lesson in CLAUDE.md).
3. Shapes: rectangle, rounded rectangle, ellipse, triangle, diamond, arrow, on the same free overlay.
4. PPTX export of the overlay.

This sub-project ships on its own, touches no data model and needs no migration. It also owns the
"active tool" state that sub-projects 2 and 3 extend.

## Goal and success criteria

- A floating toolbar sits at the top centre of the canvas column and does not scroll with the cards.
- Undo/redo work from it and are **removed** from the tools panel header (one place for history).
- The arrow button shows the active tool. Its hover/focus/click menu switches between *Select
  elements* (today's behaviour) and *Move screen* (a plain left-drag pans the canvas).
- The T button opens a menu of Heading 1, Heading 2, Heading 3 and Body text; picking one appends that
  element to the selected slide and opens it for typing (existing `addContent`).
- Nothing about selection, typing, zoom, Ctrl+drag panning or undo history regresses.

Non-goals: pen, marker, eraser, shapes (later sub-projects); keyboard shortcuts for tools; free-positioned
text (text placement stays with the layout engine).

## Design

### Placement

`components/editor/EditorToolbar.tsx`, rendered by `EditorPage`. `<main>` (the scroller, which keeps
`canvasRef`) is wrapped in a new `relative min-w-0 flex-1` container; the toolbar is a sibling of `<main>`
inside it, absolutely positioned at the top and centred, in a `pointer-events-none` row whose toolbar
has `pointer-events-auto`. Being outside `<main>` means it is not part of the scroll and a press on it
never reaches `CardCanvas`'s "press empty canvas to deselect" handler. It is app chrome (`app-*` tokens,
`shadow-app`), not part of the deck theme.

Every button refuses focus on `mousedown` (`preventDefault`), as the tools panel's buttons do, so a live
text run's caret and character selection survive a click.

### Undo / redo

Two icon buttons, same handlers and `canUndo`/`canRedo` as today's panel header. The panel header keeps
Present and the Design tab with zoom; `ToolsPanel` loses `canUndo`, `canRedo`, `onUndo`, `onRedo` props.
`ToolsPanel.test.tsx` moves its Undo/Redo expectations to the toolbar test.

### Tool state and the arrow tool

`engine/editorTool.ts` (pure): `type EditorTool = 'select' | 'pan'`, `DEFAULT_TOOL = 'select'`, labels, and

```ts
isPanPress(press: { button: number; ctrlKey: boolean }, tool: EditorTool): boolean
// true for a left press when tool === 'pan' or ctrlKey is held
```

`EditorPage` holds `const [tool, setTool] = useState<EditorTool>(DEFAULT_TOOL)`: a view setting like zoom
and grid, not stored, not undoable. Sub-projects 2 and 3 add `'pen'` and `'shape'` to the union.

`useCanvasPan(ref, enabled, tool)` replaces its inline `e.button !== 0 || !e.ctrlKey` test with
`isPanPress`. It stays a **capture-phase native listener** on the canvas, so in Move screen a plain
drag beats element selection, starts no gesture of its own and has its resulting click swallowed, exactly
as Ctrl+drag does. The grab cursor is driven by the existing `data-pan-ready` attribute: the hook sets it
persistently while `tool === 'pan'` (and while Ctrl is held, as now). Ctrl+drag keeps working in both
tools.

The arrow button shows the active tool's icon (arrow / hand). Hovering or focusing it, or clicking it,
opens a menu with **Select elements** and **Move screen**; choosing one sets the tool and closes the
menu. Clicking the button itself does not toggle the tool.

### T tool

The button opens a menu built from `CONTENT_OPTIONS` filtered to `h1`, `h2`, `h3`, `body` (labels
"Heading 1", "Heading 2", "Heading 3", "Body text": one source of names, no second list). Picking one calls
`addContent(type)`, which appends the block to the **selected** slide and opens its first run for
typing (existing behaviour, including `MAX_BLOCKS`). The button is disabled, with the tooltip "Select a
slide first", when no slide is selected. It does not change the active tool. The menu closes after a pick.

### Menus

One small `ToolbarMenu` component used by both buttons: closes on outside press, Escape and pick; anchors
under its button; `role="menu"` / `menuitem`; keyboard reachable (the arrow menu also opens on focus and
click, not only hover, so keyboard and touch users can reach it). Hover uses a short close delay so the
pointer can travel from the button to the menu.

### Pen and shapes

Not rendered in this sub-project (no dead controls). `EditorToolbar` takes its tool buttons as a
list so sub-projects 2 and 3 add theirs without restructuring.

## Files

- new: `components/editor/EditorToolbar.tsx`, `components/editor/ToolbarMenu.tsx`,
  `engine/editorTool.ts`, `engine/editorTool.test.ts`, `components/editor/EditorToolbar.test.tsx`
- changed: `pages/EditorPage.tsx` (wrapper, state, wiring), `components/editor/useCanvasPan.ts`,
  `components/editor/ToolsPanel.tsx` and its test (undo/redo out), `index.css` only if the persistent
  grab cursor needs it, `CLAUDE.md`.

## Testing

- `editorTool.test.ts`: `isPanPress` for left/right/middle buttons with and without Ctrl, in both tools
  (mutation-check that Move screen needs no Ctrl and that non-left buttons never pan).
- `EditorToolbar.test.tsx` (SSR smoke test, the same deliberate exception as `ToolsPanel.test.tsx`):
  undo/redo present and disabled per state; arrow button reflects the tool; T disabled with no slide and
  enabled with one; menus closed by default; no Pen/Shape buttons yet.
- `ToolsPanel.test.tsx`: undo/redo no longer in the panel; Present and zoom still are.
- Not tested in a browser (as with the rest of the live editing DOM): hover timing, the actual pan drag,
  focus behaviour. To be exercised by hand.

## Risks

- Move screen must never leave a stuck grab cursor or eat a later click (the hook already clears its
  swallow flag on a timer; the persistent attribute must be removed on tool change and unmount).
- The wrapper around `<main>` must keep `min-w-0` or the flex row can overflow horizontally.
- Moving undo/redo leaves the panel's history keyboard shortcuts untouched (they live in `EditorPage`).
