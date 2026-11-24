---
paths:
  - "src/present/**"
  - "src/components/present/**"
  - "src/pages/PresentPage.tsx"
---

# Presenter view (`src/present/`, `components/present/`)

Spec: `2026-11-12-presenter-view-design.md`. Console (`PresenterConsole`) + projector window (`SlideWindow`), same route as Present with `?view=presenter|screen&session=<id>`. No network, AI or DB.

- **The console owns all state** (`presenterState.ts`, pure); the slide window renders what it's sent. `BroadcastChannel` `lekturac:present:<session>`; **every message is zod-parsed** (`protocol.ts`).
- The deck is a frozen snapshot message; the slide window never reads Supabase. Only `frameScale` is imported from `src/video`; keep it that way.
- A reload resumes from `sessionStorage`. **Liveness is silence** (`alive` every 1 s, banner after 3 s; 10 s grace while connecting), not `popup.closed`. The slide window never closes on its own (`bye` only blacks it); only `end` closes it.
- **`window.open` runs inside the click**, or pop-up blockers refuse it.
- **Escape must be pressed twice within 2 s to end** (a clicker's button alternates F5/Esc). Console buttons refuse focus on mousedown, or a clicked Pause eats the next Space.
- **Present is always the presenter view**: the editor's Present menu offers only "From current slide" / "From first slide" (plain single-window Present is left for the dashboard's deck menu and the phone view).
- **Live ink** (`liveInk.ts`, console icon row `liveToolIcons.tsx`: Pointer, Pen, Highlighter, Laser, Eraser, Undo, Redo, Clear slide): per slide for the talk, kept in `sessionStorage` (`inkKey`) across a console reload, **never written to the deck**. The console posts `ink` in the same turn as the change (before `inkLive: null`, so the stroke never blinks out), `inkLive` on every move, `laser` per move and `null` on slide or tool change. Drawing reaches `SlideBody` through `PresentSlide`'s `drawing` prop (`presentDrawing.ts`); `SlideBody` draws `LaserLayer` when the drawing has a trail.
- **Ink undo is per slide** (`recordInk`/`undoInk`/`redoInk`, cap `INK_UNDO_LIMIT`): Undo only changes the slide on screen; Clear slide is one undoable step. History is memory-only (a reload keeps ink, not undo). Ctrl/Cmd+Z, Ctrl+Shift+Z / Ctrl+Y via `inkUndoKey`.
- **Whiteboard** (`Whiteboard.tsx`, view maths in `boardView.ts`): an infinite white board seen through the page (`BoardView` x/y/zoom in page-width units, zoom 0.25–4; the whole `SlideBody` is moved by one transform so presses land in board units). Right drag, middle drag or Ctrl+left drag pans in any tool (`isBoardPanPress`; the board swallows its context menu), and a plain left drag with the Pointer tool, wheel zooms at the cursor, console −/%/+ (the % resets); the view is posted as `boardView` and kept while the board is put away. The pen and Text surfaces reach everywhere (`BOARD_BLEED_PX` via `CardDrawing.bleed`). It is a page in place of the slide on both windows, toggled from the console; the `state` message carries `board` (defaults false for an older sender). Its ink lives in `LiveInk` under `WHITEBOARD_ID`, so undo, eraser, reload and mirroring are shared. Only the board takes typed text (`LiveText`, Text tool shown only while the board is up), edited in place and mirrored per keystroke; one edit = one undo step, an emptied text is removed. Any slide move (not Black screen) closes the board. It draws through `SlideBody` at the 976px width, and pins "Text colour" to a dark ink because the theme's foreground may be light.
- **Tool menus** (`LiveToolMenu.tsx`, `liveToolMenu`): pressing the chosen tool again opens its menu above the row: size for pen, highlighter, eraser and text (`LIVE_TEXT_SIZES`), colour for pen, highlighter and text (text shares the pen's colour). Colours live only in the menu; the button shows a colour dot. The console owns `toolMenu`; an outside press closes it (capture phase, the press still draws), and **Escape closes an open menu before it can count toward ending the talk**.
