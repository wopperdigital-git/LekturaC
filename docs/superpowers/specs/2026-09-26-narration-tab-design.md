# Narration tab (replaces the narration page)

Date: 2026-09-26. Status: approved; implemented on branch feat/narration-tab.
Supersedes `2026-09-02-narration-page-design.md` for everything about *where* narration lives.
That spec's data rules (script shape, statuses, merge, token budgets) are unchanged and still apply.

## Context

Narration has its own page, `/deck/:id/narrate` (`pages/NarratePage.tsx`): a read-only slide viewer
with Previous/Next, and a side panel with one slide's script and two Generate buttons. Getting to it
means leaving the editor through the "Narrate PPT" button in `TopBar`.

The user wants the page **eliminated** and narration reachable as a **second tab in the editor's
right panel, beside "Design"**.

## Decisions (agreed)

1. **The tab writes the script for the slide the editor is on**: `selectedCardId ?? activeCardId`
   (the same rule the pen already uses for `inkCardId`). Click a slide and the tab shows that slide's
   script. There is **no slide stepper** in the tab; the canvas is the viewer.
2. **The page goes**: `NarratePage`, its route, and the "Narrate PPT" link in `TopBar`.
3. **The old URL redirects** to `/deck/:id` rather than 404.
4. **Nothing about narration data changes**: `engine/narration.ts`, `store.applyGeneratedNarration`,
   `setNarrationText`, `resetNarration`, `ai/narrationPrompt.ts` and the provider call are untouched.
   This is a move of the UI, not a change to how narration works.

## Design

### Tab state and `ToolsPanel`

`ToolsPanel` gains three props, all optional so existing callers and tests are unaffected:

- `tab: 'design' | 'narration'` (default `'design'`), `onTabChange`, and
- `narrationTab?: ReactNode`, a slot.

`ToolsPanel` knows nothing about narration, the store or providers; `EditorPage` supplies the node.
The region's `aria-label` changes from "Design" to "Tools" (it now holds two tabs); no test or other
code reads the old label.

The tab row replaces today's single styled `<span>Design</span>` with a `role="tablist"` of two
`role="tab"` buttons, **Design** and **Narration**, in the existing selected-tab style. The zoom
control stays on the right of the row and shows on both tabs (it is a view setting for the canvas,
which is visible either way). The Present link stays above the row.

The tab is view state in `EditorPage` beside zoom, grid and the active tool: not stored, not
undoable, resets when the editor unmounts. Every tab button refuses focus on mousedown like the rest
of the panel, so a run's caret and character selection survive a tab click.

Body:
- **Design**: unchanged sections, in the unchanged order.
- **Narration**: the `narrationTab` slot, filling the scroll body's height.

**Both bodies stay mounted; the inactive one gets `hidden`.** Unmounting the Narration body on a tab
switch would run its cleanup and abort a generation in flight, silently cancelling a request the user
only looked away from. (Collapsing the whole panel is already safe: the `aside` only animates its
width to 0 and stays mounted.) The Design body stays mounted for symmetry and so its section state
(the open font list, the Insert grid) is not reset by a tab click.

### `NarrationTab` (`components/editor/NarrationTab.tsx`)

Props: `cards: Card[]` (sorted by `orderIndex`), `cardId: string | null`.

It is today's `ScriptPanel` plus the logic that lives in `NarratePage`, moved together:

- **State it owns**: `generating`, `error`, `choosing`, `confirmingOne`, and the `AbortController`
  ref. Unmount aborts the controller (the "cancel must stop the request" rule in CLAUDE.md).
- **`runGeneration(targets)`**: moved verbatim. It takes an explicit set of **0-based positions in
  the sorted deck**, feeds `narrationSlides(sorted, targets)` to
  `FallbackProvider(PROVIDER_CHAIN).generateNarration`, and applies the result with
  `store.applyGeneratedNarration(scripts, targets)`. A cancel returns to the panel and reports
  nothing; a missing chain reports the same "No AI provider is configured…" message.
- **The current slide** is `cards.find(c => c.id === cardId)` and its position in `cards` is the
  `index` used everywhere below ("Slide N script", and the single-slide target set `{index}`).
- **Generate script for this slide only**: `narrationStatus(card.narration) === 'edited'` opens
  `ConfirmReplaceModal` first, exactly as today (a narrower action must not destroy hand-written
  words silently). Otherwise it generates.
- **Generate scripts for all slides**: opens `GenerateScriptsModal`, unchanged, which returns the
  chosen target set.
- **Error line**: the save error (`store.status === 'error'`) outranks a stale generation error.
  The reasoning in `NarratePage`'s comments moves with the code; a silently failed save of hand-typed
  text is the worst outcome here, and it is how a missing migration 0008 announces itself.
- **The script box**: `textarea` bound to `store.setNarrationText(card.id, …)`, with status line
  ("No script yet" / "Generated" / "Edited by you"), "Reset to generated" when `isResettable`, and
  the word count and speaking time. All as today.
- **No slide** (`cardId` null, or the deck is empty): the script area shows "Select a slide to write
  its script." (an empty deck: "This deck has no slides yet."). Generate-all stays available whenever
  the deck has slides; the single-slide button is disabled.
- **The modals** render from inside the tab. They are `fixed inset-0 z-50` (`ui/Modal`) and no
  ancestor in the panel applies a transform, so the panel's `overflow-hidden` does not clip them. The
  `aside` animates `width`, `margin` only.

The panel is 280px wide (`RIGHT_PANEL_WIDTH_PX`) against the old page's 384px side panel. The script
box fills the remaining height and scrolls; nothing is truncated.

### `EditorPage`

- Holds `panelTab` state; passes `tab`, `onTabChange` and
  `narrationTab={<NarrationTab cards={sortedCards} cardId={selectedCardId ?? activeCardId} />}`.
- **Saves need no new code.** `EditorPage` already flushes pending writes on unmount and on
  `beforeunload`, which is what `NarratePage` did for its own scripts. A script typed in the tab is
  the same 500ms-debounced `narration:<cardId>` write, so it is covered by the flush that is already
  there.
- **Keys**: the page's shortcut listener already returns for `INPUT`/`TEXTAREA`/`SELECT` targets, so
  typing a script does not delete elements (Backspace/Delete), step selection (Escape) or fire undo.
  The store's own undo still covers narration text (`narration:<cardId>` coalescing); inside the
  textarea the browser's native undo applies, which drives the controlled `onChange`. The old page's
  arrow/space/Escape slide stepping is gone with the viewer and is **not** re-created.

### Routes and navigation

- In `App.tsx`, drop the `NarratePage` import and point the existing `/deck/:id/narrate` route at a
  small `NarrateRedirect` (reads `:id` from `useParams`, renders `<Navigate to={`/deck/${id}`} replace />`),
  still inside `<RequireAuth>` so a signed-out visitor is sent to login first. It is a redirect, not a
  page, so it lives in `App.tsx` beside the routes.
- Remove the "Narrate PPT" `Link`/`Button` from `TopBar` (and its `Link` import if it becomes unused).
  The `TopBar` grid (`1fr auto 1fr`) is unaffected: the right cell just has one fewer item.

### Deletions

Verified used **only** by the old page, so they go with it:

- `pages/NarratePage.tsx`
- `components/narrate/SlideViewer.tsx`, `SlideCanvas.tsx`
- `lib/fitScale.ts`, `lib/fitScale.test.ts` (only `SlideCanvas` reads it)

`ScriptPanel`, `GenerateScriptsModal` and `ConfirmReplaceModal` live on. `ScriptPanel` is folded into
`NarrationTab`; the two modals stay in `components/narrate/` (a folder of two files is acceptable and
avoids a rename that is noise in the diff).

## Accessibility

- `role="tablist"` / `role="tab"` with `aria-selected`, `aria-controls` and matching
  `role="tabpanel"` bodies (`aria-labelledby`); the inactive panel is `hidden`, so it is out of the
  accessibility tree too.
- Left/Right arrows move between tabs when a tab has focus (roving `tabIndex`); Home/End optional.
- The textarea keeps its placeholder and gains an `aria-label` naming its slide ("Script for slide
  N").

## Testing

Pure Vitest plus small SSR render smoke tests, per CLAUDE.md. **No jsdom.**

- **`ToolsPanel.test.tsx`** (extend): the tab row renders both tabs with Design selected by default;
  with `tab="narration"` the Design sections are `hidden` and the slot is visible; the slot is
  rendered even when Design is selected (it stays mounted); with no `narrationTab` passed the panel
  renders as before. Existing assertions (section order, zoom in the header, Remove fill only with a
  fill, no Add item button) must still pass unchanged.
- **`NarrationTab.test.tsx`** (new, SSR): empty-deck message; no slide selected shows the prompt and
  disables the single-slide button; an `edited` script shows "Edited by you" and "Reset to generated";
  a `generated` script shows "Generated"; the word count and speaking time render; Generate-all is
  enabled with slides.
- **Unchanged and still required green**: `narrationRow.test.ts`, the narration prompt/merge tests,
  `everyBlockRenders`.
- **Deleted with its module**: `fitScale.test.ts`.
- **Not testable here (no jsdom), to be tried by hand in the browser**: switching tabs mid-generation
  does not cancel it; cancel does; the modals open and centre from inside the panel; a script typed
  then a click on another slide saves and shows the right script; typing in the box does not trigger
  editor shortcuts; the old `/narrate` URL lands on the editor.

## Docs

- `CLAUDE.md`: rewrite "Narration page" as **"Narration tab"** (path list, "read-only slide viewer"
  → the tab follows `selectedCardId ?? activeCardId`, drop the `SlideViewer`/`SlideCanvas` bullet, the
  `NarratePage` flush bullet becomes "the editor's existing flush covers it", and keep every data
  bullet: `{text, generated}`, `mergeNarration`, `narrationMaxTokens`, the debounce). Update the
  Editor bullet's `TopBar` description (remove "Narrate PPT link") and its tab-row description
  ("Design tab row" → "Design / Narration tab row"; the panel is no longer Design-only), and the
  Core-rule and Quiz mentions that name the narration *page*.
- Mark `2026-09-02-narration-page-design.md` as superseded by this spec (one line at its top).

## Slides changing during a generation (added while planning)

The old page could not change the deck while a generation ran; the editor can. A generation's
targets are *positions* in the sorted deck, so a slide added, deleted or moved before the reply
lands would put a script on a slide the user never selected — breaking the feature's core invariant.
`runGeneration` records the slide ids at the start; on completion, `sameSlides(startIds, nowIds)`
(pure, in `engine/narration.ts`, tested) must hold or **nothing is applied** and the tab says: "Slides
were added, removed or reordered while the scripts were being written, so nothing was applied. Try
again." Text edits to a targeted slide during the request are not guarded (the old page had the same
behaviour: the generated script replaces it).

## Out of scope

- Any change to how narration is generated, validated, merged or stored.
- A slide preview or stepper in the tab.
- Narration in the presenter view, or export of narration (still never rendered or exported).
- Persisting the selected tab across reloads.

## Risks

- **Narrow panel.** 280px is tight for prose. Accepted: it scrolls, and the canvas beside it is the
  reference. If it proves too narrow, widening the panel is a separate change.
- **Two bodies mounted.** Slightly more work per render in `ToolsPanel`; the Narration body is small
  and the Design body was always mounted, so this is negligible.
- **Follow-the-selection surprise.** Selecting an element inside a slide keeps that slide's script
  (selection resolves to its card), but pressing empty canvas clears `selectedCardId`, and the tab then
  falls back to the outline's active slide, which may differ. Accepted and consistent with the pen.
