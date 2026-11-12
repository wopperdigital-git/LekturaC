# Presenter view — design

## Context

Today **Present** (`src/pages/PresentPage.tsx`) is one window with only ‹ › arrows, a full-screen button and a slide counter. The teacher sees exactly what the class sees: no notes, no timer, no view of what comes next.

Almost every deck already has a **per-slide script** (`card.narration.text`). The AI writes it at creation and the teacher edits it in the Narrate tab, but today only the narrated video uses it. **Presenter view** turns those scripts into speaker notes for live teaching.

The user asked for a new feature that uses no AI and no outside API, for decks and the classroom, and picked this one from a shortlist. Confirmed with the user:
- Classrooms use an **extended display**: the laptop and the projector show different things.
- The design described below, with my guesses as stated (the user replied "Looks right").

## What gets built

**Two windows on one computer.** The current tab becomes the **console**. A second **slide window** opens; the teacher drags it to the projector and makes it full screen. The two windows talk only through the browser (`BroadcastChannel`). There are no network calls, no new tables, no migration and no AI.

### Console (teacher's laptop)
- **Current slide** large, fitted whole (never cropped or scrolled).
- **Next slide** small (`SlidePreview`). On the last slide it shows "End of presentation".
- **Script** = `card.narration?.text`, read-only, scrollable, with A−/A+ text size. A blank script shows "No script for this slide."
- **Bottom bar:** ‹ Prev · "3 / 7" · Next › · **Black screen (B)** · timer `mm:ss` with pause/resume and reset · **target length** (minutes, typed) · **pacing bar** with "On time" / "2 min ahead" / "3 min behind".
- While the screen is black, the console's current slide is dimmed with "Screen is black · press B to show".
- **"Slide window closed · Reopen"** banner when the slide window is gone. **"Your browser blocked the slide window · Open slide window"** when pop-ups are blocked.
- **End presentation** button (and Escape when no field is focused): closes the slide window and returns to `/deck/:id`.

### Slide window (projector)
- Only the slide, on the theme's stage, **filling the window and fitted whole**: no 1024 px cap and no scrolling, because nobody can scroll a projector mid-talk. Layout still happens at `SLIDE_WIDTH_PX`, so text wraps exactly as in the editor.
- States: *Waiting for the presenter…* → slide → **black** → **End of presentation** (black, small muted text) → **Presentation ended** (console gone; stays black and never closes itself, so the teacher's desktop is not shown on the projector).
- If opened directly with no console answering within ~3 s: "Open Presenter view from the editor to use this window."
- A first-time hint, "Click or press F for full screen", disappears once full screen is entered. The cursor hides after 3 s without movement.

### Keys (both windows; the slide window forwards its keys to the console)
| Keys | Action |
|---|---|
| → ↓ Space PageDown N | next |
| ← ↑ PageUp Backspace P | previous |
| Home / End | first / last |
| B or `.` | black screen on/off (clickers send `.`) |
| digits then Enter | jump to that slide |
| F (slide window only) | full screen |
| Escape (console, no field focused) | end presentation |

While the screen is black, Next or Previous only brings the slide back; they don't move (PowerPoint's behaviour). Next on the last slide shows End of presentation. Previous from there returns to the last slide.

### Pacing (no stored state)
- Each slide's budget = max(script words ÷ 150 wpm, **30 s**). The **target length** defaults to the sum of the budgets, rounded up to whole minutes, and the teacher can type 1–180 minutes.
- The current slide's planned window = target × (budgets before it ÷ total budget) up to the same with that slide included. If the elapsed time is before the window, you're ahead; after it, behind. Anything within **30 s** counts as on time. The status is rounded to whole minutes.
- The timer starts when the console opens. Pause/resume and reset are kept in local view state.

### Starting
- The editor's top-bar **Present** icon becomes a small menu: **Present** (today's single window, unchanged), then a "Presenter view" group with **From current slide** and **From first slide** (the user's choice: offer both). The starting slide goes in the console URL (`&start=<index>`). The timer starts at 0:00, and pacing counts from that slide's planned start, so starting mid-deck doesn't read as "ahead".
- The menu shows wherever the top bar shows, including the compact layout. Compact also covers a narrow laptop window, not just an iPad.
- The phone view and the dashboard's Present stay single-window.
- **The slide window is opened inside the menu click** (a user gesture), so pop-up blockers allow it; Safari's activation window is about 1 s. The tab then navigates to the console. The console's Open/Reopen buttons also open the window inside their own click.

## Non-goals
- Drawing or a laser pointer while presenting, a phone remote, live updates while editing, and placing the window on the second screen automatically (the Window Management API).
- Any change to single-window Present beyond sharing its slide drawing.
- Remembering the target length or note size between sessions.
- Touching `cards`, the database or any provider.

## Calls I made (the user didn't specify these)
1. Same route with a query param (`/deck/:id/present?view=presenter|screen&session=…`) rather than new routes. This keeps `App.tsx` (which has the user's uncommitted edits) untouched, and both windows stay under `RequireAuth`.
2. The console **sends the deck snapshot** to the slide window (`{title, theme, textStyle, cards}`), so the slide window never reads Supabase and never shows an older saved copy. The deck is frozen at start.
3. 150 wpm, a 30 s minimum per slide, 30 s on-time tolerance, and a 3 s cursor hide.
4. In the slide window, a mouse click only serves the full-screen hint and never advances the slide.
5. The console uses the normal app chrome (`app-*` tokens, follows light/dark).
6. A polite live region in the console announces "Slide 3 of 7".
7. **Console reload (from the builder check):** the session id lives in the tab's `sessionStorage`, so a reload (an accidental F5, or a clicker's "start show" key) keeps the same channel. The **slide, black state, timer and target are restored** from `sessionStorage` for that session. This replaces the earlier guess "reload starts at slide 1", because a clicker can trigger it mid-lesson. On mount the console posts `ping`, and an open slide window answers `hello`. "Presentation ended" is not final: a later `deck`/`state` message brings the slide back. F5 is not blocked.
8. **Liveness without a window reference:** the slide window posts `alive` every 1 s, and the console treats 3 s of silence as closed and shows the Reopen banner. This replaces polling `popup.closed`, which a reloaded console can't do. Reopen uses the named target `lekturac-slides`, so an existing window is reused, not duplicated.
9. **Git:** work on a branch `presenter-view` (not `master`). Verify each commit in a temporary `git worktree` of that commit (`npm ci && npm run build && npm run test`), because the working tree holds about 40 of your uncommitted files.

## Architecture

**Data flow:** EditorPage → `PresentMenu` "Presenter view" click → `openSlideWindow(deckId, session)` (`window.open(screenUrl, 'lekturac-slides', 'popup,width=1280,height=720')`, Window kept in a module holder) → `navigate(consoleUrl)`. The slide window mounts → posts `hello` → the console answers `deck` + `state`. After that, the console owns all state and posts `state` on every change. The slide window posts `key` actions and `bye`. The console posts `bye` on `pagehide`/unmount.

**Protocol** (`src/present/protocol.ts`, zod-validated, since data from another window is untrusted): channel `lekturac:present:<session>`.
- Console → screen: `{type:'ping'}`, `{type:'deck', deck}`, `{type:'state', index, black, ended}`, `{type:'bye'}`.
- Screen → console: `{type:'hello'}`, `{type:'alive'}`, `{type:'key', action}`, `{type:'bye'}`.
- Session restore: `src/present/session.ts` + test (session id, and saved `{index, black, ended, timer, targetMinutes}` read and written through an injected storage, with a try/catch around every access).

### New files (pure ones get colocated tests)
- `src/present/presenterState.ts` + test: state `{index, count, black, ended}`, `reduce(state, action)`; actions next/prev/first/last/goto/toggleBlack; typed-jump buffer (`typeDigit`, cleared after 2 s or on another key).
- `src/present/keys.ts` + test: `presenterKeyAction(e)` → action | null. Ignores events with Ctrl, Meta or Alt held and keys typed into an input.
- `src/present/pacing.ts` + test: `wordCount`, `slideBudgets(cards)`, `estimateMinutes`, `pace(elapsedSec, index, budgets, targetSec)` → `{status, minutes}`.
- `src/present/timer.ts` + test: a pure stopwatch (`start/pause/resume/reset/elapsedMs(now)`).
- `src/present/protocol.ts` + test: message schemas, `parseMessage`, `channelName`, `screenUrl`, `consoleUrl`.
- `src/present/slideWindow.ts`: browser glue (open, hold the reference, `isClosed`, close). Thin and untested.
- `src/components/theme/FittedSlide.tsx`: like `ScaledSlide` but scales by width **and** height with `frameScale` (`src/video/timeline.ts`, a pure module, safe to import).
- `src/components/present/PresentSlide.tsx`: the shared composition taken out of PresentPage (TextStyleScope → SlideSurface → SlideBody → LayoutRenderer), so all three surfaces draw identically.
- `src/components/present/PresenterConsole.tsx`: the container (store, channel, timer tick) plus a pure `PresenterConsoleView`, with an SSR render test.
- `src/components/present/SlideWindow.tsx`: the container plus a pure `SlideWindowView`, with an SSR render test.

### Modified files
- `src/pages/PresentPage.tsx`: dispatch on `view`. With no param it keeps today's code, using `PresentSlide`.
- `src/components/editor/TopBarMenus.tsx`: new exported `PresentMenu` (reuses `Dropdown`/`MenuItem`; trigger = the existing play icon, label "Present").
- `src/components/editor/TopBar.tsx`: the Present `Link` becomes `PresentMenu`, with a new `onPresenterView` prop.
- `src/pages/EditorPage.tsx`: pass `onPresenterView` (open window, then navigate).
- `TopBar.test.tsx` (order unchanged: title, zoom, Create & export, Present, Account) and `TopBarMenus.test.tsx` (Present menu: Present, then the Presenter view group with From current slide and From first slide).
- `CLAUDE.md`: a short **Presenter view** section, plus the new render tests in the Testing list.

## Implementation tasks (TDD; implementer subagents on Sonnet per the memory rule)
0. Save this design as `docs/superpowers/specs/2026-11-12-presenter-view-design.md` and commit it. Then run superpowers:writing-plans for the step-by-step plan.
1. Pure logic, test first: `presenterState`, `keys`, `pacing`, `timer`, `protocol`.
2. `FittedSlide` and `PresentSlide`; switch single-window Present to `PresentSlide` with no visible change.
3. `SlideWindow` (view + container + render test).
4. `PresenterConsole` (view + container + render test) and `slideWindow.ts`.
5. `PresentMenu` + TopBar + EditorPage wiring, with the two test updates.
6. CLAUDE.md section, then a final review (superpowers:requesting-code-review).

## Your uncommitted edits (load-bearing)
`TopBarMenus.tsx` (+2 lines that use the untracked `src/lib/motion.ts`), `CLAUDE.md` and `App.tsx` carry your redesign edits. **Stage only this feature's hunks**: write a filtered patch and `git apply --cached` it, then check `git diff --cached` before every commit. Never `git add -A`. Committing your motion lines without `motion.ts` would break the commit. `App.tsx` isn't touched.

## Verification
- `npm run test`, `npm run lint` and `npm run build` all pass. The build's chunk list still has no `mediabunny`/`html-to-image` in the entry bundle (only `frameScale` is imported from `src/video`).
- By hand, in Chrome with a second display (or a second window on one screen):
  1. Editor → Present ▾ → Presenter view: the slide window opens and the console shows the current slide, the next slide and the script.
  2. Arrows, Space, PageDown and a clicker move both windows. B blacks out and Next brings the slide back. Typing `5` then Enter jumps to slide 5. Next past the end shows End of presentation.
  3. Press keys with the slide window focused: the console follows.
  4. Press F5 in the console mid-deck: the same slide and timer come back, and the slide window reconnects.
  5. Close the slide window: the Reopen banner appears within 3 s. Reopen restores the same slide.
  6. Close the console tab: the slide window shows "Presentation ended" and stays black.
  7. Block pop-ups: the console shows the blocked message, and its button opens the window.
  8. A tall slide is fitted whole in both windows. Photos, ink and nudges match the editor.
  9. "From current slide" opens on the selected slide with pacing showing "On time".
  10. Repeat 1–2 in Safari and Firefox.
