# Background generation (decks, quizzes, videos)

Date: 2026-10-02. Status: approved in conversation, awaiting spec review.

## Goal

The three long-running generations (a deck from a brief, a quiz from a deck, a narrated video from
a deck) stop holding the user on the page that started them. Each runs in the background while the
user keeps working, reports progress in a persistent corner panel (the quiz also in the editor's
top bar), and announces its result. Decks with something new get a dot on their dashboard card.

## Decisions (from the user)

- **One job of each kind at a time** (one deck, one quiz, one video). Starting a kind that is
  already running is refused with a reason; there is no queue.
- A quiz generating while the user is away from its deck's editor shows in the **corner panel**,
  like the others. Inside that deck's editor it shows in the **top bar** instead.
- "Something is new" is stored **in this browser only** (localStorage, user-namespaced). No
  migration.
- A deck card's dot clears **per kind, when the user opens the new thing** (the deck, the deck's
  quiz list, the deck's video). The dot shows while any kind is still unseen.
- The panel sits **bottom right**.
- A failed job **stays** in the panel with its reason and a way back until dismissed.
- Architecture **A**: one zustand store outside React plus one panel mounted at the app root.

## Constraints that do not change

- Jobs run in this browser tab (the AI calls and the encoder are client side). Reloading or closing
  the tab ends every job; `beforeunload` warns while any job runs. Nothing resumes after a reload.
- The video still needs the tab **visible** while slides are drawn (`whenVisible` in
  `renderFrame`); the panel says "Keep this tab open" while it is waiting.
- Cancel means what it means today: no deck is created, no quiz saved, no video saved, and the
  video's upload is still the point of no return (cancel disabled from then on).
- "Generate once" is untouched: no job ever rewrites `cards`.

## Architecture

New folder `src/jobs/`.

### `jobs/jobsStore.ts` (zustand, module level)

```ts
type JobKind = 'deck' | 'quiz' | 'video'
type JobStatus = 'running' | 'done' | 'failed'

interface StageEntry { id: string; label: string; state: 'pending' | 'active' | 'done' }

interface Job {
  id: string                 // crypto.randomUUID(), so a stale callback can tell it is not current
  kind: JobKind
  deckId: string | null      // null for a deck job until the deck exists
  title: string              // the brief's topic, or the deck title
  status: JobStatus
  progress: number           // 0..1
  timeline: StageEntry[]
  waitingForVisibility?: boolean   // video only
  error?: string
  result?: { deckId: string }
}

interface JobsState {
  jobs: Record<JobKind, Job | null>
  startDeckJob(input: DeckJobInput): boolean      // false = refused (one already running)
  startQuizJob(input: QuizJobInput): boolean
  startVideoJob(input: VideoJobInput): boolean
  cancel(kind: JobKind): void
  retry(kind: JobKind): void                      // failed jobs only; re-runs with the kept input
  dismiss(kind: JobKind): void                    // removes a done/failed job from the panel
  abortForDeck(deckId: string): void              // deck deletion
  reset(): void                                   // sign-out / user change
}
```

- `cancel` aborts the job's `AbortController` and removes the job (a cancel is the user's own act;
  no row is left behind). Controllers and job inputs live in a module-level `Map`, not in state.
- Every callback checks that its job id is still the current one for its kind before writing, so a
  cancelled run that settles late never overwrites a newer job.
- `useAuthStore.subscribe`: when the user id changes (sign-out or a different sign-in), `reset()`
  aborts every job and clears the store. Without this a deck generated for one account would land
  in the next.
- `presentationStore.deleteDeck(id)` calls `abortForDeck(id)` first and clears that deck's new
  dots.
- One `beforeunload` listener, registered by the store, warns while any job is `running`.

### Runners

Each runner holds the logic that today sits in a component, moved mostly as is, and reports
through a small `JobReporter` (`setStage`, `setProgress`, `setWaiting`) so the runners are testable
against fakes.

- **`jobs/runDeck.ts`**: `generatePresentation` (its `onStage` drives the timeline) →
  `insertGeneratedDeck` → `deleteDraft(draftId)` → `done` with `result.deckId` →
  `markNew(deckId, 'deck')`. The aborted-after-resolve check in `CreatePage` moves here: a deck
  whose signal aborted is never inserted.
  - **`presentationStore.createDeckFromGeneration` is split.** Its last line `set({...})` replaces
    the editor's open deck, which in the background would clobber whatever deck the user is
    editing. The insert work moves to a pure-ish exported `insertGeneratedDeck(deck,
    requestedCount, result): Promise<{ id, cards }>` (no store writes); the store method keeps its
    current behaviour by calling it then `set`. The runner calls only `insertGeneratedDeck`.
  - Timeline: Researching sources → Writing slides → Checking quality → Tightening N slides
    (inserted only when the `repair` stage fires) → Saving. A skipped research stage is marked done
    when `write` starts.
- **`jobs/runQuiz.ts`**: the body of `QuizModal`'s `generate()` and `save()`: `generateSections`
  (one timeline row per test, "Test n of N") then `createQuiz` (Saving). On a `SectionFailure` the
  job keeps `err.written` in its input so **Try again resumes at the failed test**; a failure after
  `createQuiz` succeeded keeps `savedId` so a retry never creates a duplicate (same rule as today's
  `Pending`). On `done` → `markNew(deckId, 'quiz')`. Editing the quiz form in the modal calls
  `clearQuizResume(deckId)` (drops the kept tests, as `edit()` does now).
- **`jobs/runVideo.ts`**: `import('@/video/generate')` then `generateVideoForDeck` with the deck
  snapshot and voice settings taken at start. `onProgress` maps the existing `VideoStage`s
  (narrating, drawing, encoding, uploading) with their n/total onto the timeline and progress.
  Cancel is refused (no-op, × disabled) once the stage is `uploading` (`canCancelVideo`). On `done`
  → `markNew(deckId, 'video')`. The voice is still saved by the modal before the job starts, so a
  missing migration 0014 warns in the modal exactly as now.

### `jobs/newItems.ts`

- localStorage key `lekturac:new-items:<uid>` → `{ [deckId]: ('deck'|'quiz'|'video')[] }`.
  User-namespaced with **no un-namespaced fallback**; `storageKey()` returns `null` while the
  session hydrates and reads/writes skip (the `briefDrafts.ts` rules). Writes are try/catch'd.
- API: `markNew(deckId, kind)`, `clearNew(deckId, kind)`, `clearDeck(deckId)`,
  `useNewItems(deckId): readonly kind[]` via `useSyncExternalStore` with a cached snapshot rebuilt
  only on mutation or a `storage` event (an unstable snapshot re-renders forever).
- Clearing: opening `/deck/:id` clears `deck`; opening the quiz modal's "Quizzes from this deck"
  tab clears `quiz`; opening the voice modal while it shows a saved video clears `video`.

## UI

### Corner panel (`components/jobs/JobTray.tsx`)

Mounted once inside `BrowserRouter`, beside `<Routes>`; renders only for a signed-in user and only
while some job exists. App chrome (`app-*` tokens, light/dark), fixed bottom right, 320 px wide,
one row per job (at most three), above page content (`z` below modals).

- **Running row**: title, a thin progress bar, then the timeline: each stage on its own line, ✓
  for done, a spinner on the active one, a muted dot for pending. Video adds "Keep this tab open"
  while `waitingForVisibility`. A × cancels after an inline confirm ("Stop generating?"
  Stop / Keep going); disabled during a video upload.
- **Done**: the spinner becomes a check that draws in (~400 ms), then the row collapses and morphs
  into one button: **View Slide** (deck), **View Quiz** (quiz), **View Video** (video).
  - The deck and quiz buttons stay until clicked or dismissed.
  - The video button fades out after ~6 s (the card's dot still marks it).
- **Failed**: red row with the reason and actions; stays until dismissed (×).
  - Deck: **Edit brief** (`/new?draft=<id>`; the draft survives because it is deleted only on
    success) and **Try again**.
  - Quiz and video: **Try again**.
- **In the editor** (`/deck/:id`): the panel collapses to a thin pill per job (label and percent);
  clicking expands it. A quiz job for the deck that is open is not shown in the panel there (the
  top bar shows it).
- Motion is CSS transitions/keyframes only (no new dependency) and is skipped under
  `prefers-reduced-motion`.

Navigation targets:

- View Slide → `/deck/:id`.
- View Quiz → `/deck/:id?quiz=list`; the editor reads the param once, opens `QuizModal` on the
  "Quizzes from this deck" tab, and removes the param (`replace`).
- View Video → `/deck/:id?video=1`; the editor opens the voice modal, which loads and shows the
  saved video, and removes the param.

### Quiz strip in the top bar (`components/editor/QuizJobStrip.tsx`)

Rendered by `TopBar` between the save status and the zoom group, only while the quiz job belongs
to the open deck.

- Running: "Generating quiz" with a small progress bar and a ×.
- Done: "Quiz generated · **View**" for 3 s, then fades out and unmounts. Then, until the quiz list
  is opened:
  - the Export trigger carries a highlight ring;
  - inside the Export menu, **Generate Quiz** is highlighted;
  - the quiz modal's **Quizzes from this deck** tab carries a yellow dot.
  All three read `useNewItems(deckId).includes('quiz')`, so they clear together when the tab is
  opened.
- Failed: "Quiz failed · **Try again**" with a dismiss ×.

### Deck card dot

`DeckCard` and `DeckListRow` read `useNewItems(deck.id)`. A 10 px yellow circle with a ring in the
page background colour sits over the card's top-right corner (`-top-1 -right-1`), clear of the
hover menu at `top-3 right-3`; list rows put it beside the title. `aria-label` names what is new
("New quiz and video").

### Starting points

- **`CreatePage`**: the last answer calls `startDeckJob({ brief, draftId })` and navigates to `/`.
  Its own `AbortController`, stage state, spinner and leave-mid-generation prompt are removed. The
  draft is saved before handing off, as today. If a deck job is already running the Generate step
  is disabled with "A deck is already generating".
- **`QuizModal`**: Generate calls `startQuizJob(...)` and closes the modal. Its generating/saving
  phases and progress UI are removed; the Create tab's Generate is disabled with the reason when a
  quiz is running. The "done" result view (preview, PDF) is reached from the Quizzes list (the
  existing preview modal).
- **`CloneVoiceModal`**: Generate Presentation saves the voice, calls `startVideoJob(...)`, closes
  the modal and navigates to `/`. Its in-modal progress rows go; the saved-video player stays.
- `HomePage` reloads its deck list when a deck job reaches `done`.

## Error handling summary

| Case | Result |
| --- | --- |
| Cancel at any point before a video upload | Job removed; nothing created or saved |
| Deck job aborted after the pipeline resolved | No deck inserted |
| Provider failure | Job `failed` with the existing friendly message; draft / kept tests survive |
| Quiz save failed after `createQuiz` succeeded | Retry re-reads only (keeps `savedId`) |
| Sign-out or user change | Every job aborted, store cleared |
| Deck deleted while its quiz/video runs | Those jobs aborted first; its new dots cleared |
| Tab reloaded/closed | `beforeunload` warning; jobs end; nothing half-written |
| Same kind started twice | Refused; the start button is disabled with the reason |

## Testing

Pure Vitest, colocated:

- `jobs/jobsStore.test.ts`: one job per kind (second start returns `false`); cancel removes the
  job and a late settle never writes `done`; a stale job id cannot overwrite a newer job; sign-out
  aborts all; `abortForDeck` aborts only that deck's jobs; retry re-runs with the kept input.
- `jobs/runDeck.test.ts`, `runQuiz.test.ts`, `runVideo.test.ts` against fake generators: stage →
  timeline mapping; a deck aborted after the pipeline resolves is not inserted; the draft is deleted
  only on success; the quiz resumes at the failed test and never creates twice; video cancel is
  refused during upload; `markNew` only on `done`.
- `jobs/newItems.test.ts`: user namespacing with no fallback, null key while hydrating, mark/clear
  per kind, dot present while any kind remains, stable snapshot.
- `store/presentationStore` split: `insertGeneratedDeck` does not write the store.
- Render smoke tests: `JobTray` (running timeline, done button, failed actions, minimized pill in
  the editor, own-deck quiz hidden there), `QuizJobStrip` (running, done, failed), the dot and its
  label on `DeckCard`, `TopBar.test.tsx` order updated for the strip, `TopBarMenus.test.tsx` for
  the highlighted Generate Quiz, `QuizModal.test.tsx` for the tab dot and the disabled Generate.
- By hand in a browser: the animations, a real job surviving navigation, tab-visibility waiting,
  reload warning.

## Out of scope

Queues, running jobs in a worker or on a server, cross-device new dots, resuming jobs after a
reload, notifications outside the page.
