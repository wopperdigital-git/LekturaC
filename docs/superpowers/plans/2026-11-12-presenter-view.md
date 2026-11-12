# Presenter View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A two-window presenter view: the teacher's console shows the current and next slide, the slide's script, a timer and pacing, while a second window shows only the slide on the projector.

**Architecture:** The editor's Present button becomes a menu. "Presenter view" opens the slide window inside the click, then navigates this tab to the console. Both are modes of the existing `/deck/:id/present` route (`?view=presenter|screen`). The windows talk only over `BroadcastChannel`. The console owns all state, saves it to `sessionStorage` for reloads, and sends the slide window a frozen deck snapshot. All rules (navigation, keys, pacing, stopwatch, messages, saved session) are pure modules in `src/present/`. The components are thin containers around pure views that get SSR render tests.

**Tech Stack:** React 19, TypeScript, zustand (`presentationStore`), react-router, zod, Vitest (`renderToStaticMarkup`, no jsdom), Tailwind v4 (`app-*` tokens for chrome).

**Spec:** `docs/superpowers/specs/2026-11-12-presenter-view-design.md`

## Global Constraints

- No AI, no provider, no network call, no Supabase write, no migration. Nothing writes `cards`.
- `src/present/*` and the new components must not import `@/video/generate`, `encode`, `narrate`, `renderFrame` or `storage`. Only `frameScale` from `src/video/timeline.ts` (pure) is allowed.
- Slides are laid out at `SLIDE_WIDTH_PX` and scaled; layouts use no screen breakpoints.
- Chrome uses `app-*` tokens only; slides use `slide-*` inside `ThemeProvider`.
- Exact copy: "Waiting for the presenter…", "Open Presenter view from the editor to use this window.", "Presentation ended", "End of presentation", "Click or press F for full screen", "No script for this slide.", "Screen is black · press B to show", "Slide window closed", "Reopen", "Your browser blocked the slide window", "Open slide window", "End presentation", "On time", "N min ahead", "N min behind", "No slides to present."
- Values: `WORDS_PER_MINUTE = 150`, `MIN_SLIDE_SECONDS = 30`, `ON_TIME_TOLERANCE_SECONDS = 30`, target 1–180 minutes, `JUMP_TIMEOUT_MS = 2000`, `ALIVE_INTERVAL_MS = 1000`, `SILENCE_MS = 3000`, `ORPHAN_AFTER_MS = 3000`, `CURSOR_HIDE_MS = 3000`, `SLIDE_WINDOW_NAME = 'lekturac-slides'`, popup features `'popup,width=1280,height=720'`.
- **The user's uncommitted edits are in the working tree (about 40 files).** Never `git add -A`/`git add .`. Stage new files by name. `src/components/editor/TopBarMenus.tsx` and `CLAUDE.md` carry the user's hunks, so stage those with the procedure in Task 0. `src/App.tsx` is not touched.
- Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Implementer subagents run on model `sonnet`.

## Review Focus

1. **A deck with no slides.** The console shows "No slides to present." and the reducer no-ops at `count: 0`. Tested in Task 1 and Task 6.
2. **A restored session pointing past the end**, because slides were deleted in another tab before an F5. The index is clamped to the last slide and `ended` is dropped. Tested in Task 3.
3. **Typing into the target-minutes field** must not jump, blacken or move slides (`inField`). Tested in Task 1.
4. **Bad target input** ("", "0", "abc", "999", "12.6") is clamped or refused, never NaN. Tested in Task 2.
5. **Jumping to "0" or "99"** clamps to the first or last slide. A buffer older than 2 s is ignored. Tested in Task 1.

---

### Task 0: Branch hygiene (no code)

Already done: branch `presenter-view` exists, and the design is committed (`64fcda5`).

- [ ] **Step 1: Save the user's baseline diffs** for the two shared files, before any edit:

```bash
cd /c/Projects/LekturaC && J="$CLAUDE_JOB_DIR/tmp"; mkdir -p "$J"
git diff -- CLAUDE.md > "$J/claude-user.patch"
git diff -- src/components/editor/TopBarMenus.tsx > "$J/menus-user.patch"
```

- [ ] **Step 2: The staging procedure** (used in Tasks 7 and 8). It stages "HEAD + only our hunks" for a shared file `F`, with user patch `P`:

```bash
cp "$F" "$J/ours"; patch -R "$J/ours" < "$P"        # strip the user's hunks from a copy
blob=$(git hash-object -w --path="$F" "$J/ours")
git update-index --cacheinfo 100644,"$blob","$F"
git diff --cached -- "$F"                              # must show only this feature's lines
```

If `patch -R` reports a rejected hunk, stop and report it; don't force it.

---

### Task 1: Navigation state and keys

**Files:**
- Create: `src/present/presenterState.ts`, `src/present/presenterState.test.ts`
- Create: `src/present/keys.ts`, `src/present/keys.test.ts`

**Interfaces — Produces:**
```ts
// presenterState.ts
export interface PresenterState { index: number; count: number; black: boolean; ended: boolean }
export type PresenterAction =
  | { type: 'next' } | { type: 'prev' } | { type: 'first' } | { type: 'last' }
  | { type: 'goto'; index: number } | { type: 'toggleBlack' }
export function initialPresenterState(count: number, start: number): PresenterState // start clamped
export function reducePresenter(state: PresenterState, action: PresenterAction): PresenterState
export const JUMP_TIMEOUT_MS = 2000
export interface JumpBuffer { digits: string; at: number }
export function typeDigit(buffer: JumpBuffer | null, digit: string, now: number): JumpBuffer // restarts if expired
export function commitJump(buffer: JumpBuffer | null, now: number): number | null // 0-based target, null if empty/expired
// keys.ts
export type KeyIntent = PresenterAction | { type: 'digit'; digit: string } | { type: 'enter' } | { type: 'fullscreen' } | { type: 'exit' }
export interface KeyInput { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; inField: boolean }
export function presenterKeyIntent(e: KeyInput): KeyIntent | null
```

Reducer rules:
- `count === 0`: return the state unchanged for every action.
- `next`: if `black`, only clear black. If `ended`, unchanged. On the last slide, set `ended`. Otherwise `index + 1`.
- `prev`: if `black`, only clear black. If `ended`, clear `ended` (index stays on the last slide). Otherwise `max(0, index - 1)`.
- `first` / `last` / `goto`: set the clamped index and clear `black` and `ended`.
- `toggleBlack`: flip `black`.

Key map:
- next: `ArrowRight ArrowDown ' ' PageDown n N`
- prev: `ArrowLeft ArrowUp PageUp Backspace p P`
- `Home` → first, `End` → last
- `b B .` → toggleBlack
- `0`–`9` → digit
- `Enter` → enter
- `f F` → fullscreen
- `Escape` → exit
- Any Ctrl, Meta or Alt held, or `inField`, → `null`.

- [ ] **Step 1: Write failing tests.** `presenterState.test.ts`:
  - `next` walks to the last slide, then sets `ended`. A further `next` keeps it. `prev` from ended returns `{index: last, ended: false}`.
  - While black, `next` and `prev` return the same index with `black: false`.
  - `goto(99)` → last, `goto(-3)` → 0, and both clear black and ended.
  - `initialPresenterState(5, 9).index === 4`.
  - At `count 0`, every action returns an equal state.
  - Jumps: `commitJump(typeDigit(typeDigit(null,'1',0),'2',500), 900) === 11`. A buffer typed at `0` and committed at `2001` → `null`. A digit at `2500` after one at `0` restarts with only that digit. `"0"` commits to `-1` (the reducer's `goto` clamps it to 0; assert through `reducePresenter`).

  `keys.test.ts`: one assertion per row of the key map. `{key:'5', inField:true}` → `null`. `{key:'ArrowRight', ctrlKey:true}` → `null`. `{key:'b', metaKey:true}` → `null`.

- [ ] **Step 2: Run** `npx vitest run src/present` and check that it fails (modules missing).
- [ ] **Step 3: Implement** both modules.
- [ ] **Step 4: Run** `npx vitest run src/present`: PASS.
- [ ] **Step 5: Commit**

```bash
git add src/present/presenterState.ts src/present/presenterState.test.ts src/present/keys.ts src/present/keys.test.ts
git commit -m "feat(present): navigation state and key map for presenter view" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Pacing and stopwatch

**Files:**
- Create: `src/present/pacing.ts`, `src/present/pacing.test.ts`
- Create: `src/present/timer.ts`, `src/present/timer.test.ts`

**Interfaces — Produces:**
```ts
// pacing.ts
export const WORDS_PER_MINUTE = 150
export const MIN_SLIDE_SECONDS = 30
export const ON_TIME_TOLERANCE_SECONDS = 30
export const MIN_TARGET_MINUTES = 1
export const MAX_TARGET_MINUTES = 180
export function wordCount(text: string | undefined): number
export function slideBudgets(scripts: readonly (string | undefined)[]): number[] // seconds, each ≥ 30
export function estimateMinutes(budgets: readonly number[]): number // ceil(sum/60), clamped 1..180
export function parseTargetMinutes(input: string): number | null // null = refuse, caller reverts
export type PaceStatus = 'ahead' | 'on-time' | 'behind'
export interface Pace { status: PaceStatus; minutes: number; elapsedFraction: number; plannedFraction: number }
export function pace(elapsedSec: number, index: number, budgets: readonly number[], targetSec: number, startIndex: number): Pace
// timer.ts
export interface Stopwatch { startedAt: number | null; accumulatedMs: number } // running iff startedAt !== null
export function startStopwatch(now: number): Stopwatch
export function pauseStopwatch(sw: Stopwatch, now: number): Stopwatch
export function resumeStopwatch(sw: Stopwatch, now: number): Stopwatch
export function elapsedMs(sw: Stopwatch, now: number): number
export function formatClock(ms: number): string // "06:12", "1:02:03" past an hour
```

The pacing algorithm (the signature doesn't determine it):
```
B(i) = sum(budgets[0..i-1]); total = B(n)
lo(i) = targetSec * B(i)/total ; hi(i) = targetSec * B(i+1)/total
effective = elapsedSec + lo(startIndex)          // starting mid-deck reads on time
diff = effective < lo(index) ? lo(index)-effective : effective > hi(index) ? effective-hi(index) : 0
status = diff <= 30 ? 'on-time' : (effective < lo(index) ? 'ahead' : 'behind')
minutes = status === 'on-time' ? 0 : max(1, round(diff/60))
elapsedFraction = clamp(effective/targetSec, 0, 1); plannedFraction = lo(index)/targetSec
```
Any empty budgets or `targetSec <= 0` → `{on-time, 0, 0, 0}`. Reset is `startStopwatch(now)`.

- [ ] **Step 1: Write failing tests.**
  - `wordCount('  two  words ') === 2`, `wordCount(undefined) === 0`.
  - `slideBudgets(['', 'x '.repeat(300)])` → `[30, 120]`.
  - `estimateMinutes([30, 120]) === 3`, `estimateMinutes([]) === 1`.
  - `parseTargetMinutes`: `'15'`→15, `'12.6'`→13, `'0'`→1, `'999'`→180, `''`→null, `'abc'`→null.
  - With budgets `[60,60,60]` and target 180: `pace(0,0,b,180,0)` on-time. `pace(150,0,b,180,0)` → behind, 2 min. `pace(10,2,b,180,0)` → ahead, 2 min. `pace(0,1,b,180,1)` → on-time (mid-deck start). `pace(20,1,b,180,0)` → ahead with diff 40 → 1 min (the minimum).
  - `pace(5,0,[],180,0).status === 'on-time'`.
  - Stopwatch: start at 1000, pause at 4000, resume at 10000, `elapsedMs(…, 12000) === 5000`. `formatClock(372000) === '06:12'`, `formatClock(3723000) === '1:02:03'`.
- [ ] **Step 2: Run** `npx vitest run src/present`: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run src/present`: PASS.
- [ ] **Step 5: Commit** the four files by name, message `feat(present): pacing and stopwatch for presenter view`.

---

### Task 3: Window messages and saved session

**Files:**
- Create: `src/present/protocol.ts`, `src/present/protocol.test.ts`
- Create: `src/present/session.ts`, `src/present/session.test.ts`

**Interfaces — Consumes:** `PresenterAction`, `PresenterState` (Task 1); `Stopwatch` (Task 2); `Card` (`@/engine/contentBlocks`), `ThemeTokens` (`@/lib/theme-tokens`), `TextStyle` (`@/engine/textStyle`).

**Produces:**
```ts
// protocol.ts
export const SLIDE_WINDOW_NAME = 'lekturac-slides'
export const ALIVE_INTERVAL_MS = 1000
export const SILENCE_MS = 3000
export const ORPHAN_AFTER_MS = 3000
export interface DeckSnapshot { title: string; theme: ThemeTokens; textStyle: TextStyle; cards: Card[] } // cards sorted
export type ForwardedKey = PresenterAction | { type: 'digit'; digit: string } | { type: 'enter' }
export interface ShownState { index: number; black: boolean; ended: boolean }
export type ConsoleMessage = { type: 'ping' } | { type: 'deck'; deck: DeckSnapshot } | ({ type: 'state' } & ShownState) | { type: 'bye' } | { type: 'end' }
export type ScreenMessage = { type: 'hello' } | { type: 'alive' } | { type: 'key'; key: ForwardedKey } | { type: 'bye' }
export function parseConsoleMessage(data: unknown): ConsoleMessage | null
export function parseScreenMessage(data: unknown): ScreenMessage | null
export function channelName(session: string): string                     // `lekturac:present:${session}`
export function screenUrl(deckId: string, session: string): string        // `/deck/${id}/present?view=screen&session=${s}`
export function consoleUrl(deckId: string, session: string, start: number): string // `?view=presenter&session=${s}&start=${n}`
export type PresentParams = { view: 'single' } | { view: 'presenter'; session: string | null; start: number } | { view: 'screen'; session: string | null }
export function parsePresentParams(search: string): PresentParams // bad/missing start → 0
// session.ts
export interface SavedSession { index: number; black: boolean; ended: boolean; stopwatch: Stopwatch; targetMinutes: number }
export interface KeyValueStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
export function sessionKey(session: string): string // `lekturac:presenter:${session}`
export function loadSession(storage: KeyValueStorage | null, session: string): SavedSession | null
export function saveSession(storage: KeyValueStorage | null, session: string, saved: SavedSession): void
export function restoreState(saved: SavedSession, count: number): PresenterState // clamps index; drops ended if index was clamped
```

Message validation uses zod with `safeParse` → `null` on failure. The deck is checked shallowly: `title` a string, `theme` and `textStyle` non-null objects, and `cards` an array of objects each with a string `id` and a numeric `orderIndex`. Only this app's own windows can post on the channel, so a deep schema buys nothing. `ForwardedKey` digits must match `/^[0-9]$/`. Every storage access is inside try/catch, and an unreadable or invalid saved session reads as `null`.

- [ ] **Step 1: Write failing tests.**
  - Round-trip one valid example of every message type through its parser.
  - Reject `null`, `{type:'nope'}`, `{type:'state', index:'1'}`, `{type:'key', key:{type:'digit', digit:'12'}}`, and a deck whose `cards` is not an array.
  - `parsePresentParams('')` → single. `'?view=presenter&session=s&start=4'` → presenter s 4. `'?view=presenter&start=x'` → presenter, session null, start 0. `'?view=screen&session=s'` → screen.
  - `screenUrl('d1','s1') === '/deck/d1/present?view=screen&session=s1'`.
  - Session: save then load returns an equal object. `loadSession` with storage whose `getItem` throws → `null`. Malformed JSON → `null`. `loadSession(null, …)` → `null`.
  - `restoreState({index: 9, ended: true, …}, 4)` → `{index: 3, ended: false}`. `restoreState({index: 2, black: true, …}, 4)` keeps black.
- [ ] **Step 2: Run** `npx vitest run src/present`: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run src/present`: PASS.
- [ ] **Step 5: Commit** the four files by name, message `feat(present): window messages and saved session for presenter view`.

---

### Task 4: Shared slide drawing and whole-slide fit

**Files:**
- Create: `src/components/theme/FittedSlide.tsx`
- Create: `src/components/present/PresentSlide.tsx`
- Modify: `src/pages/PresentPage.tsx` (lines 104–115 use `PresentSlide`; nothing else changes)

**Interfaces — Produces:**
```ts
export function FittedSlide({ children }: { children: ReactNode }): JSX.Element
// fills its parent (h-full w-full, centred); lays children out at SLIDE_WIDTH_PX; scale = frameScale(SLIDE_WIDTH_PX, contentOffsetHeight, box.clientWidth, box.clientHeight); ResizeObserver on box and content, like ScaledSlide
export function PresentSlide({ card, textStyle, isFirstCard }: { card: Card; textStyle: TextStyle; isFirstCard: boolean }): JSX.Element
// TextStyleScope(mergeTextStyle(textStyle, card.textStyle)) → SlideSurface className="w-full rounded-slide shadow-slide-card" → SlideBody card → LayoutRenderer context {isFirstCard}. No ThemeProvider (callers provide it).
```

- [ ] **Step 1: Implement both.** Swap PresentPage's inline composition for `<PresentSlide card={card} textStyle={store.textStyle} isFirstCard={i === 0} />` inside its existing `ScaledSlide`.
- [ ] **Step 2: Run** `npm run test` and `npx tsc -b`: PASS (no behaviour change; `everyBlockRenders` still green).
- [ ] **Step 3: Commit** the three files by name, message `refactor(present): share the presenter's slide drawing; add FittedSlide`.

---

### Task 5: Slide window

**Files:**
- Create: `src/components/present/SlideWindow.tsx`, `src/components/present/SlideWindow.test.tsx`
- Modify: `src/pages/PresentPage.tsx`: at the top, `parsePresentParams(location.search)`. `view: 'screen'` renders `<SlideWindow session={…} />` before any deck loading. Keep today's code as the `single` branch. The `presenter` branch arrives in Task 6.

**Interfaces — Consumes:** Task 1 (`presenterKeyIntent`), Task 3 (all protocol exports), Task 4 (`FittedSlide`, `PresentSlide`). **Produces:**
```ts
export type ScreenPhase = 'waiting' | 'orphan' | 'live' | 'gone' // gone = console said bye/end
export function SlideWindowView(props: { phase: ScreenPhase; deck: DeckSnapshot | null; shown: ShownState | null; showFullscreenHint: boolean }): JSX.Element
export function SlideWindow({ session }: { session: string | null }): JSX.Element
```

What the view renders, on a black full-screen stage:
- `waiting` → "Waiting for the presenter…"
- `orphan` → "Open Presenter view from the editor to use this window."
- `gone` → "Presentation ended"
- `live` + `shown.black` → black, no slide text
- `live` + `shown.ended` → "End of presentation"
- `live` otherwise → `ThemeProvider(deck.theme)` + `SlideStage` + `FittedSlide` + `PresentSlide(deck.cards[shown.index], isFirstCard index===0)`
- the hint "Click or press F for full screen" when `showFullscreenHint`

The container:
- Opens `BroadcastChannel(channelName(session))` and posts `hello` on mount and on every `ping`. Posts `alive` every `ALIVE_INTERVAL_MS` and `bye` on `pagehide`.
- `deck` and `state` messages set `live`; this also revives from `gone`. `bye` → `gone`. `end` → `window.close()`, then `gone` (the close may be refused).
- `orphan` if no deck arrives within `ORPHAN_AFTER_MS`, or immediately when `session` is null.
- On keydown, run `presenterKeyIntent({…, inField: false})`. `fullscreen` toggles `document.documentElement` full screen here. `exit` is ignored. Everything else is posted as `{type:'key', key}`.
- A click requests full screen. The hint hides on `fullscreenchange` into full screen. The cursor hides (`cursor: none`) after `CURSOR_HIDE_MS = 3000` without pointer movement.

- [ ] **Step 1: Write failing render tests** (`renderToStaticMarkup`; fixture `card()` copied from `src/components/editor/NarrationTab.test.tsx`, theme `BUILTIN_THEMES[0]`):
  - Each phase shows its exact sentence.
  - `live` with index 1 contains "Slide 2" and not "Slide 1".
  - Black contains neither "Slide 1" nor "Slide 2".
  - `ended` shows "End of presentation".
  - The hint appears only when `showFullscreenHint`.
- [ ] **Step 2: Run** `npx vitest run src/components/present`: FAIL.
- [ ] **Step 3: Implement** the view, the container and the PresentPage branch.
- [ ] **Step 4: Run** `npx vitest run src/components/present`, then `npx tsc -b`: PASS.
- [ ] **Step 5: Commit** the three files by name, message `feat(present): slide window for presenter view`.

---

### Task 6: Presenter console

**Files:**
- Create: `src/present/slideWindow.ts` (browser glue, untested)
- Create: `src/components/present/PresenterConsole.tsx`, `src/components/present/PresenterConsole.test.tsx`
- Modify: `src/pages/PresentPage.tsx`: the `view: 'presenter'` branch renders `<PresenterConsole deckId={id} session={…} start={…} />`. If `session` is null, generate one and `navigate(consoleUrl(…), {replace: true})`.

**Interfaces — Consumes:** Tasks 1–4. **Produces:**
```ts
// slideWindow.ts
export function newSessionId(): string                         // crypto.randomUUID()
export function openSlideWindow(deckId: string, session: string): Window | null // window.open(screenUrl, SLIDE_WINDOW_NAME, 'popup,width=1280,height=720'); records the outcome
export function lastOpenOutcome(session: string): 'opened' | 'blocked' | 'unknown'
export function closeSlideWindow(): void                       // closes the held reference if any
// PresenterConsole.tsx
export type ScreenLink = 'connecting' | 'open' | 'closed' | 'blocked'
export const NOTE_SIZES = ['text-base', 'text-lg', 'text-xl', 'text-2xl', 'text-3xl'] as const // default index 1
export interface PresenterConsoleViewProps {
  deck: DeckSnapshot; state: PresenterState; startIndex: number
  clock: string; running: boolean; targetMinutes: number; pace: Pace; noteSize: number; screen: ScreenLink
  onPrev(): void; onNext(): void; onToggleBlack(): void; onPauseResume(): void; onReset(): void
  onTargetChange(input: string): void; onNotesSmaller(): void; onNotesLarger(): void; onOpenScreen(): void; onEnd(): void
}
export function PresenterConsoleView(props: PresenterConsoleViewProps): JSX.Element
export function PresenterConsole({ deckId, session, start }: { deckId: string; session: string; start: number }): JSX.Element
```

What the view renders (app chrome, `app-*` tokens):
- **Header:** the deck title and **End presentation**.
- **Banner:** `closed` → "Slide window closed" + **Reopen**; `blocked` → "Your browser blocked the slide window" + **Open slide window**.
- **Left:** the current slide in `ThemeProvider` + `FittedSlide` + `PresentSlide`. When `state.black`, it's dimmed with "Screen is black · press B to show" over it. When `state.ended`, it shows "End of presentation".
- **Right:** "Next", then `SlidePreview` of `index+1`, or "End of presentation" on the last slide. Below it the script (`cards[index].narration?.text`, `whitespace-pre-wrap`, `NOTE_SIZES[noteSize]`) with A− / A+, or "No script for this slide."
- **Bottom bar:** ‹ Prev, "3 / 7", Next ›, Black screen (B, `aria-pressed`), the clock with Pause/Resume and Reset, the target field (number, 1–180), the pacing bar (fill = `elapsedFraction`, tick = `plannedFraction`) and its status text ("On time" / "N min ahead" / "N min behind").
- A polite live region: "Slide 3 of 7".
- **Empty deck:** "No slides to present." and nothing else.

The container:
- `store.loadDeck(deckId)` exactly as PresentPage does, with the same Loading text and `DeckLoadError`.
- The snapshot comes from the store, with cards sorted by `orderIndex`, built once when the deck is ready (frozen).
- Restore: `loadSession(sessionStorage, session)` → `restoreState`, or else `initialPresenterState(count, start)` + `startStopwatch(Date.now())` + target `estimateMinutes(slideBudgets(scripts))`. Every change goes through `saveSession`.
- Channel: post `ping` on mount. Answer `hello` with `deck` then `state`. Post `state` on every change. `hello` or `alive` → `open` and remember the time. `connecting`/`open` with `SILENCE_MS` of silence → `closed`. Start in `blocked` when `lastOpenOutcome(session) === 'blocked'`.
- `key` messages and local keydown both go through one handler: `digit` → `typeDigit`; `enter` → `commitJump` then `goto`, else `next`; `exit` → End (local keys only); any other action → `reducePresenter`. Local keys use `inField` = the target is an input/textarea/select.
- Open/Reopen: `openSlideWindow(deckId, session)` inside the click. Set `blocked` on `null`, else `connecting`.
- End: post `end`, `closeSlideWindow()`, navigate to `/deck/${deckId}`. On `pagehide`/unmount, post `bye`.
- A 1 s interval re-renders the clock. `pace(elapsed/1000, ended ? count-1 : index, budgets, target*60, startIndex)`.

- [ ] **Step 1: Write failing render tests** for `PresenterConsoleView`, with a 3-card fixture where card 2 has a blank script:
  - It shows the current slide's script and the "2 / 3" counter.
  - A blank script shows "No script for this slide."
  - On the last slide, Next shows "End of presentation".
  - With `black`, it shows "Screen is black · press B to show".
  - `screen:'closed'` shows "Slide window closed" and "Reopen". `'blocked'` shows the blocked sentence and "Open slide window". `'open'` shows neither.
  - The pace statuses render "On time", "2 min ahead" and "3 min behind".
  - An empty deck renders "No slides to present." and no "Next".
  - The live region says "Slide 2 of 3".
- [ ] **Step 2: Run** `npx vitest run src/components/present`: FAIL.
- [ ] **Step 3: Implement** `slideWindow.ts`, the view, the container and the PresentPage branch.
- [ ] **Step 4: Run** `npx vitest run src/components/present src/present`, then `npx tsc -b`: PASS.
- [ ] **Step 5: Commit** the four files by name, message `feat(present): presenter console`.

---

### Task 7: Present menu in the editor

**Files:**
- Modify: `src/components/editor/TopBarMenus.tsx`: add the exported `PresentMenu`; move `PlayIcon` here from TopBar.
- Modify: `src/components/editor/TopBar.tsx`: replace `presentHref: string` with `onPresent: () => void` and `onPresenterView: (from: 'current' | 'first') => void`; render `<PresentMenu …/>` where the Present `Link` was.
- Modify: `src/pages/EditorPage.tsx` (~line 1124). `onPresent` → `navigate(`/deck/${id}/present`)`. `onPresenterView(from)`:
  - `start = from === 'first' ? 0 : max(0, sorted cards index of (selectedCardId ?? activeCardId))`
  - `session = newSessionId()`
  - `openSlideWindow(id, session)` (synchronously, in the click)
  - `navigate(consoleUrl(id, session, start))`
- Modify: `src/components/editor/TopBar.test.tsx`, `src/components/editor/TopBarMenus.test.tsx`

**Interfaces — Consumes:** `newSessionId`, `openSlideWindow` (Task 6), `consoleUrl` (Task 3). **Produces:**
```ts
export function PresentMenu(props: { onPresent(): void; onPresenterView(from: 'current' | 'first'): void; defaultOpen?: boolean }): JSX.Element
// Dropdown label "Present", title "Present this deck", trigger = PlayIcon in the old link's classes; items:
// "Present" ; MenuGroup caption "Presenter view": "From current slide", "From first slide"
```

- [ ] **Step 1: Write failing tests.**
  - `TopBarMenus.test.tsx`: the open `PresentMenu` lists "Present", then the "Presenter view" group with "From current slide" before "From first slide".
  - `TopBar.test.tsx`: swap `presentHref` for the two callbacks in the fixture. The existing order assertions (`aria-label="Present"` between Create & export and Account) must still pass. Replace the `'Present</a>'` check with "no visible Present word on the trigger" (`not.toContain('>Present</button>')`).
- [ ] **Step 2: Run** `npx vitest run src/components/editor/TopBar`: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm run test`, `npm run lint`, `npx tsc -b`: PASS.
- [ ] **Step 5: Commit.** Stage `TopBar.tsx`, `TopBar.test.tsx`, `TopBarMenus.test.tsx` and `EditorPage.tsx` by name, and stage `TopBarMenus.tsx` with Task 0's procedure (`F=src/components/editor/TopBarMenus.tsx P="$J/menus-user.patch"`). Check `git diff --cached` has no `dropFromTop`. Commit with the message `feat(present): Present menu with presenter view from current or first slide`.

---

### Task 8: Docs and whole-branch check

**Files:**
- Modify: `CLAUDE.md`.
  - Add a `## Presenter view (src/present/, components/present/)` section after "Motion" with: the two windows and the `?view=` modes; console-owned state; the frozen snapshot; `sessionStorage` restore; the alive/silence liveness; the window opened inside the click (pop-up blockers); no network/AI/DB.
  - Add "untested in a browser: two real windows, BroadcastChannel delivery, pop-up blocking, full screen on a projector, a clicker" to that section.
  - In Testing, add `components/present/SlideWindow.test.tsx` and `PresenterConsole.test.tsx` to the render smoke tests, and the Present menu to the `TopBarMenus.test.tsx` description.

- [ ] **Step 1: Edit CLAUDE.md**, then stage it with Task 0's procedure (`F=CLAUDE.md P="$J/claude-user.patch"`). Commit with the message `docs: presenter view in CLAUDE.md`.
- [ ] **Step 2: Clean-tree check** (the working tree hides missing files):

```bash
cd /c/Projects/LekturaC && W="$CLAUDE_JOB_DIR/tmp/wt" && git worktree add "$W" presenter-view
cd "$W" && npm ci && npm run build && npm run test && npm run lint
cd /c/Projects/LekturaC && git worktree remove --force "$W"
```
Expected: all pass. The build's entry chunk contains no `mediabunny` or `html-to-image` (`grep -l mediabunny dist/assets/index-*.js` prints nothing).
- [ ] **Step 3: Final review** with superpowers:requesting-code-review over `master..presenter-view`.
- [ ] **Step 4: Hand the user the by-hand checklist**, spec "Verification" items 1–10.
