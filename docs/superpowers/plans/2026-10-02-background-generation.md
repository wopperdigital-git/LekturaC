# Background Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deck, quiz and video generation run in the background, with a bottom-right progress panel, a quiz strip in the editor's top bar, and a "new" dot on dashboard deck cards.

**Architecture:** A generic zustand `jobsStore` (`src/jobs/`) runs one job per kind (`deck`/`quiz`/`video`) from a `JobSpec` whose `run(ctx)` holds the work, so jobs outlive the pages that start them. Three spec builders (`deckJob.ts`, `quizJob.ts`, `videoJob.ts`) move today's component logic out of `CreatePage`, `QuizModal` and `CloneVoiceModal` behind injected dependencies (testable against fakes); `start.ts` wires the real ones. A `JobTray` mounted beside `<Routes>` shows progress everywhere; `newItems.ts` stores unseen results per deck in user-namespaced localStorage.

**Tech Stack:** React 19, TypeScript (`verbatimModuleSyntax`, `erasableSyntaxOnly`), zustand 5, react-router-dom, Tailwind v4 (`app-*` tokens), Vitest (node, no jsdom; render tests use `renderToStaticMarkup`).

**Spec:** `docs/superpowers/specs/2026-10-02-background-generation-design.md`

## Global Constraints

- One job per kind at a time; `start` refuses (returns `false`) while that kind is `running`. A `done`/`failed` job of the kind is replaced by a new start.
- Cancel = no deck created, no quiz saved, no video saved. Once a job reaches a write that cannot be aborted (deck insert, `create_quiz`, video upload) it reports `cancellable: false` and the × is disabled.
- A job's late callbacks never write after it was cancelled, reset or replaced (checked by job id).
- Sign-out or a user change aborts every job and clears the store.
- New-item storage key: `lekturac:new-items:<uid>`; **no un-namespaced fallback**; `null` key while hydrating ⇒ reads return empty, writes skip; every storage access try/catch'd.
- Panel: fixed bottom right, 320 px wide (`w-80`), `app-*` tokens only, minimized to pills on `/deck/:id`.
- No new dependencies. Animations are CSS only and disabled under `prefers-reduced-motion`.
- `mediabunny` and `html-to-image` must stay out of the entry bundle: `src/jobs/*` may only reach `@/video/generate` through `import()` (type-only imports are fine).
- No job ever writes `cards` of an open deck (generate-once rule).
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- Cancel pressed while a deck generation is resolving → no deck appears (pinned in Task 4).
- Signing out while a job runs → the job is aborted and its result never lands for the next account (pinned in Task 3).
- Starting a new quiz after a failed one → the failed job is replaced, not refused (pinned in Task 3).
- Quiz Try again after test 2 of 3 failed → test 1 is not regenerated, and a failure after save never creates twice (pinned in Task 5).
- Deleting a deck whose video is rendering → that job is aborted, other kinds untouched (pinned in Task 3).

## File Structure

Create:
- `src/jobs/newItems.ts` (+ `.test.ts`): per-deck unseen results in localStorage; `useNewItems` hook.
- `src/jobs/timelines.ts` (+ `.test.ts`): pure stage → `{ timeline, progress }` mappers for the three kinds.
- `src/jobs/jobsStore.ts` (+ `.test.ts`): generic job runner store.
- `src/jobs/deckJob.ts` (+ `.test.ts`), `src/jobs/quizJob.ts` (+ `.test.ts`), `src/jobs/videoJob.ts` (+ `.test.ts`): `JobSpec` builders over injected deps.
- `src/jobs/start.ts`: `startDeckJob`, `startQuizJob`, `startVideoJob` with real deps.
- `src/components/jobs/NewDot.tsx` (+ `.test.tsx`), `JobRow.tsx`, `JobTray.tsx` (+ `JobTray.test.tsx` for the view), `src/components/editor/QuizJobStrip.tsx` (+ `.test.tsx`).

Modify:
- `src/store/presentationStore.ts` (extract `insertGeneratedDeck`), `src/App.tsx`, `src/index.css`, `src/pages/CreatePage.tsx`, `src/pages/HomePage.tsx`, `src/components/home/DeckCard.tsx`, `src/components/home/DeckListRow.tsx`, `src/pages/EditorPage.tsx`, `src/components/editor/TopBar.tsx`, `src/components/editor/TopBarMenus.tsx`, `src/components/quiz/QuizModal.tsx`, `src/components/editor/NarrationTab.tsx`, `src/components/voice/CloneVoiceModal.tsx`, `CLAUDE.md`, and the affected `*.test.tsx`.

---

### Task 1: New-item storage

**Files:**
- Create: `src/jobs/newItems.ts`
- Test: `src/jobs/newItems.test.ts`

**Interfaces:**
- Produces: `type NewKind = 'deck' | 'quiz' | 'video'`; `markNew(deckId: string, kind: NewKind): void`; `clearNew(deckId: string, kind: NewKind): void`; `clearDeck(deckId: string): void`; `newItemsFor(deckId: string): readonly NewKind[]`; `useNewItems(deckId: string): readonly NewKind[]`.

- [ ] **Step 1: Write the failing test**

```ts
// src/jobs/newItems.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Stubbed like briefDrafts.test.ts: the real auth store reaches for Supabase at module load.
vi.mock('@/store/authStore', () => {
  let state: { user: { id: string } | null } = { user: null }
  const listeners = new Set<(s: typeof state) => void>()
  return {
    useAuthStore: {
      getState: () => state,
      setState: (partial: Partial<typeof state>) => {
        state = { ...state, ...partial }
        listeners.forEach((fn) => fn(state))
      },
      subscribe: (fn: (s: typeof state) => void) => {
        listeners.add(fn)
        return () => listeners.delete(fn)
      },
    },
  }
})

const store = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
})

const { useAuthStore } = (await import('@/store/authStore')) as unknown as {
  useAuthStore: { setState: (p: { user: { id: string } | null }) => void }
}
const { markNew, clearNew, clearDeck, newItemsFor } = await import('./newItems')

describe('newItems', () => {
  beforeEach(() => {
    store.clear()
    useAuthStore.setState({ user: { id: 'u1' } })
  })

  it('records kinds per deck under a user-namespaced key', () => {
    markNew('d1', 'quiz')
    markNew('d1', 'video')
    markNew('d1', 'quiz')
    expect(newItemsFor('d1')).toEqual(['quiz', 'video'])
    expect([...store.keys()]).toEqual(['lekturac:new-items:u1'])
  })

  it('clears one kind, and drops the deck when none remain', () => {
    markNew('d1', 'quiz')
    markNew('d1', 'deck')
    clearNew('d1', 'quiz')
    expect(newItemsFor('d1')).toEqual(['deck'])
    clearNew('d1', 'deck')
    expect(newItemsFor('d1')).toEqual([])
    expect(JSON.parse(store.get('lekturac:new-items:u1')!)).toEqual({})
  })

  it('clearDeck removes every kind', () => {
    markNew('d1', 'quiz')
    markNew('d1', 'video')
    clearDeck('d1')
    expect(newItemsFor('d1')).toEqual([])
  })

  it("never shows another user's items and never writes without a user", () => {
    markNew('d1', 'quiz')
    useAuthStore.setState({ user: { id: 'u2' } })
    expect(newItemsFor('d1')).toEqual([])
    useAuthStore.setState({ user: null })
    markNew('d2', 'deck')
    expect(newItemsFor('d2')).toEqual([])
    expect([...store.keys()]).toEqual(['lekturac:new-items:u1'])
  })

  it('returns the same array while nothing changed (stable snapshot)', () => {
    markNew('d1', 'quiz')
    expect(newItemsFor('d1')).toBe(newItemsFor('d1'))
  })

  it('survives storage that throws', () => {
    const throwing = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') }, removeItem: () => {} }
    vi.stubGlobal('localStorage', throwing)
    expect(() => markNew('d1', 'quiz')).not.toThrow()
    expect(newItemsFor('d9')).toEqual([])
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/jobs/newItems.test.ts`
Expected: FAIL, cannot resolve `./newItems`.

- [ ] **Step 3: Write the implementation**

```ts
// src/jobs/newItems.ts
import { useSyncExternalStore } from 'react'
import { useAuthStore } from '@/store/authStore'

/*
  Which decks have a result the user has not looked at yet (a new deck, quiz or video), for the
  dot on the dashboard card. Browser-local by decision: the jobs that produce these only run in
  this browser anyway.

  Namespaced by user id, with no un-namespaced fallback, for the same reason as briefDrafts.ts:
  localStorage does not know who is signed in, and a shared key would show one account's dots to
  the next. While the session hydrates there is no key; reads are empty and writes are skipped.
*/

export type NewKind = 'deck' | 'quiz' | 'video'
type NewMap = Record<string, NewKind[]>

const KEY_PREFIX = 'lekturac:new-items'
const EMPTY: readonly NewKind[] = Object.freeze([])
const ORDER: NewKind[] = ['deck', 'quiz', 'video']

const listeners = new Set<() => void>()
let cache: NewMap | null = null
let cacheKey: string | null = null

function storageKey(): string | null {
  const uid = useAuthStore.getState().user?.id ?? null
  return uid ? `${KEY_PREFIX}:${uid}` : null
}

function read(): NewMap {
  const key = storageKey()
  if (key === null) return {}
  if (cache !== null && cacheKey === key) return cache
  let parsed: NewMap = {}
  try {
    const raw = localStorage.getItem(key)
    const value: unknown = raw ? JSON.parse(raw) : {}
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [deckId, kinds] of Object.entries(value as Record<string, unknown>)) {
        if (!Array.isArray(kinds)) continue
        const valid = ORDER.filter((k) => kinds.includes(k))
        if (valid.length > 0) parsed[deckId] = valid
      }
    }
  } catch {
    parsed = {}
  }
  cache = parsed
  cacheKey = key
  return parsed
}

function write(next: NewMap): void {
  const key = storageKey()
  if (key === null) return
  cache = next
  cacheKey = key
  try {
    localStorage.setItem(key, JSON.stringify(next))
  } catch {
    // Blocked storage: the dot lasts for this page's life only.
  }
  listeners.forEach((fn) => fn())
}

export function newItemsFor(deckId: string): readonly NewKind[] {
  return read()[deckId] ?? EMPTY
}

export function markNew(deckId: string, kind: NewKind): void {
  if (storageKey() === null) return
  const map = read()
  const current = map[deckId] ?? []
  if (current.includes(kind)) return
  write({ ...map, [deckId]: ORDER.filter((k) => k === kind || current.includes(k)) })
}

export function clearNew(deckId: string, kind: NewKind): void {
  const map = read()
  const current = map[deckId]
  if (!current?.includes(kind)) return
  const rest = current.filter((k) => k !== kind)
  const next = { ...map }
  if (rest.length > 0) next[deckId] = rest
  else delete next[deckId]
  write(next)
}

export function clearDeck(deckId: string): void {
  const map = read()
  if (!(deckId in map)) return
  const next = { ...map }
  delete next[deckId]
  write(next)
}

function invalidate(): void {
  cache = null
  cacheKey = null
  listeners.forEach((fn) => fn())
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange)
  return () => {
    listeners.delete(onChange)
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== null && e.key.startsWith(KEY_PREFIX)) invalidate()
  })
}

let lastUserId = useAuthStore.getState().user?.id ?? null
useAuthStore.subscribe((state) => {
  const uid = state.user?.id ?? null
  if (uid === lastUserId) return
  lastUserId = uid
  invalidate()
})

/** The unseen kinds for a deck; re-renders on change, including from another tab. */
export function useNewItems(deckId: string): readonly NewKind[] {
  return useSyncExternalStore(
    subscribe,
    () => newItemsFor(deckId),
    () => EMPTY,
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/jobs/newItems.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/jobs/newItems.ts src/jobs/newItems.test.ts
git commit -m "feat(jobs): per-deck new-item storage for the dashboard dot"
```

---

### Task 2: Timelines

**Files:**
- Create: `src/jobs/timelines.ts`
- Test: `src/jobs/timelines.test.ts`

**Interfaces:**
- Consumes: `GenerationStage` from `@/generation/pipeline`; `Progress` (type) from `@/video/pipeline`; `stageRows` from `@/video/ui`.
- Produces:
  - `interface StageEntry { id: string; label: string; state: 'pending' | 'active' | 'done' }`
  - `interface TimelineReport { timeline: StageEntry[]; progress: number }`
  - `deckTimeline(stage: GenerationStage | 'save', repairSlides: number | null): TimelineReport`
  - `quizTimeline(titles: readonly string[], at: number | 'save'): TimelineReport`
  - `videoTimeline(p: Progress | null): TimelineReport`

- [ ] **Step 1: Write the failing test**

```ts
// src/jobs/timelines.test.ts
import { describe, expect, it } from 'vitest'
import { deckTimeline, quizTimeline, videoTimeline } from './timelines'

const states = (r: { timeline: { id: string; state: string }[] }) => r.timeline.map((e) => `${e.id}:${e.state}`)

describe('deckTimeline', () => {
  it('marks earlier stages done, the current active and the rest pending', () => {
    expect(states(deckTimeline('validate', null))).toEqual([
      'research:done', 'write:done', 'validate:active', 'save:pending',
    ])
  })
  it('shows research as done when it was skipped and writing starts', () => {
    expect(states(deckTimeline('write', null))[0]).toBe('research:done')
  })
  it('adds the repair row only once a repair runs, with its slide count', () => {
    const r = deckTimeline('repair', 3)
    expect(r.timeline.map((e) => e.label)).toContain('Tightening 3 slides')
    expect(deckTimeline('repair', 1).timeline.map((e) => e.label)).toContain('Tightening 1 slide')
    expect(states(deckTimeline('save', 3))).toEqual([
      'research:done', 'write:done', 'validate:done', 'repair:done', 'save:active',
    ])
  })
  it('progress rises through the stages and stays below 1', () => {
    const order = (['research', 'write', 'validate', 'repair', 'save'] as const).map((s) => deckTimeline(s, 2).progress)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    expect(Math.max(...order)).toBeLessThan(1)
  })
})

describe('quizTimeline', () => {
  it('has one row per test plus saving', () => {
    const r = quizTimeline(['Test 1', 'Vocabulary'], 1)
    expect(r.timeline.map((e) => e.label)).toEqual(['Writing Test 1', 'Writing Vocabulary', 'Saving'])
    expect(states(r)).toEqual(['test-0:done', 'test-1:active', 'save:pending'])
    expect(r.progress).toBeCloseTo(1 / 3)
  })
  it('save marks every test done', () => {
    expect(states(quizTimeline(['A'], 'save'))).toEqual(['test-0:done', 'save:active'])
  })
})

describe('videoTimeline', () => {
  it('starts with narrating active at 0', () => {
    const r = videoTimeline(null)
    expect(r.timeline[0].state).toBe('active')
    expect(r.progress).toBe(0)
  })
  it('puts the n/total count on the active row and advances progress within a stage', () => {
    const a = videoTimeline({ stage: 'narrating', done: 1, total: 4 })
    const b = videoTimeline({ stage: 'narrating', done: 3, total: 4 })
    expect(a.timeline[0].label).toMatch(/1\/4$/)
    expect(b.progress).toBeGreaterThan(a.progress)
    expect(videoTimeline({ stage: 'uploading', done: 0, total: 1 }).progress).toBeGreaterThanOrEqual(0.9)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/jobs/timelines.test.ts`
Expected: FAIL, cannot resolve `./timelines`.

- [ ] **Step 3: Write the implementation**

```ts
// src/jobs/timelines.ts
import type { GenerationStage } from '@/generation/pipeline'
import type { Progress } from '@/video/pipeline'
import { stageRows } from '@/video/ui'

/*
  What the panel's timeline says for each kind of job, and how full its bar is. Pure, so the
  wording and the order are pinned without a browser.
*/

export interface StageEntry {
  id: string
  label: string
  state: 'pending' | 'active' | 'done'
}

export interface TimelineReport {
  timeline: StageEntry[]
  progress: number
}

function entries(rows: { id: string; label: string }[], active: number): StageEntry[] {
  return rows.map((r, i) => ({ ...r, state: i < active ? 'done' : i === active ? 'active' : 'pending' }))
}

const DECK_PROGRESS: Record<GenerationStage | 'save', number> = {
  research: 0.08,
  write: 0.25,
  validate: 0.7,
  repair: 0.8,
  save: 0.95,
}

export function deckTimeline(stage: GenerationStage | 'save', repairSlides: number | null): TimelineReport {
  const rows = [
    { id: 'research', label: 'Researching sources' },
    { id: 'write', label: 'Writing slides' },
    { id: 'validate', label: 'Checking quality' },
  ]
  if (repairSlides !== null) {
    rows.push({ id: 'repair', label: `Tightening ${repairSlides} slide${repairSlides === 1 ? '' : 's'}` })
  }
  rows.push({ id: 'save', label: 'Saving' })
  return { timeline: entries(rows, rows.findIndex((r) => r.id === stage)), progress: DECK_PROGRESS[stage] }
}

export function quizTimeline(titles: readonly string[], at: number | 'save'): TimelineReport {
  const rows = [...titles.map((t, i) => ({ id: `test-${i}`, label: `Writing ${t}` })), { id: 'save', label: 'Saving' }]
  const active = at === 'save' ? titles.length : at
  return { timeline: entries(rows, active), progress: active / rows.length }
}

/** Share of the bar each video stage fills, in order: narrating, rendering, encoding, uploading. */
const VIDEO_SPANS = [0.4, 0.4, 0.1, 0.1]

export function videoTimeline(p: Progress | null): TimelineReport {
  const rows = stageRows(p)
  const timeline: StageEntry[] = rows.map((r) => ({
    id: r.stage,
    label: r.detail ? `${r.label} ${r.detail}` : r.label,
    state: r.state,
  }))
  if (!p) return { timeline: timeline.map((e, i) => (i === 0 ? { ...e, state: 'active' } : e)), progress: 0 }
  const index = rows.findIndex((r) => r.stage === p.stage)
  const before = VIDEO_SPANS.slice(0, index).reduce((a, b) => a + b, 0)
  const within = p.total > 0 ? Math.min(1, p.done / p.total) : 0
  return { timeline, progress: before + VIDEO_SPANS[index] * within }
}
```

Note: `stageRows(null)` returns every row `pending`; `videoTimeline(null)` marks the first active so the panel shows something happening from the start.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/jobs/timelines.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/jobs/timelines.ts src/jobs/timelines.test.ts
git commit -m "feat(jobs): timeline and progress mapping for deck, quiz and video jobs"
```

---

### Task 3: Jobs store

**Files:**
- Create: `src/jobs/jobsStore.ts`
- Test: `src/jobs/jobsStore.test.ts`

**Interfaces:**
- Consumes: `StageEntry` from `./timelines`; `markNew`, `NewKind` from `./newItems`; `useAuthStore` from `@/store/authStore`.
- Produces:

```ts
export type JobKind = 'deck' | 'quiz' | 'video'
export type JobStatus = 'running' | 'done' | 'failed'
export interface Job {
  id: string; kind: JobKind; deckId: string | null; title: string
  status: JobStatus; progress: number; timeline: StageEntry[]
  cancellable: boolean; error: string | null
  resultDeckId: string | null
  /** Where "Edit brief" goes for a failed deck job; null otherwise. */
  editHref: string | null
}
export interface JobReport { timeline?: StageEntry[]; progress?: number; cancellable?: boolean }
export interface JobContext { signal: AbortSignal; report(patch: JobReport): void }
export interface JobSpec {
  kind: JobKind; deckId: string | null; title: string; timeline: StageEntry[]; editHref?: string
  run(ctx: JobContext): Promise<{ deckId: string }>
  describe(err: unknown): string
}
export const useJobsStore: UseBoundStore<StoreApi<JobsState>>
// JobsState: { jobs: Record<JobKind, Job | null>; start(spec): boolean; cancel(kind): void; retry(kind): void; dismiss(kind): void; abortForDeck(deckId): void; reset(): void }
export function anyJobRunning(): boolean
export function abortError(): DOMException
```

- [ ] **Step 1: Write the failing test**

```ts
// src/jobs/jobsStore.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/store/authStore', () => {
  let state: { user: { id: string } | null } = { user: { id: 'u1' } }
  const listeners = new Set<(s: typeof state) => void>()
  return {
    useAuthStore: {
      getState: () => state,
      setState: (partial: Partial<typeof state>) => {
        state = { ...state, ...partial }
        listeners.forEach((fn) => fn(state))
      },
      subscribe: (fn: (s: typeof state) => void) => {
        listeners.add(fn)
        return () => listeners.delete(fn)
      },
    },
  }
})
const marked: string[] = []
vi.mock('./newItems', () => ({ markNew: (deckId: string, kind: string) => void marked.push(`${deckId}:${kind}`) }))

const { useAuthStore } = (await import('@/store/authStore')) as unknown as {
  useAuthStore: { setState: (p: { user: { id: string } | null }) => void }
}
const { useJobsStore, abortError } = await import('./jobsStore')
import type { JobContext, JobSpec } from './jobsStore'

/** A spec whose run waits until the test settles it. */
function deferredSpec(over: Partial<JobSpec> = {}) {
  let resolve!: (v: { deckId: string }) => void
  let reject!: (e: unknown) => void
  let ctx!: JobContext
  const runs: number[] = []
  const spec: JobSpec = {
    kind: 'quiz',
    deckId: 'd1',
    title: 'Deck',
    timeline: [],
    run: (c) => {
      ctx = c
      runs.push(runs.length)
      return new Promise((res, rej) => {
        resolve = res
        reject = rej
      })
    },
    describe: (e) => (e instanceof Error ? e.message : 'failed'),
    ...over,
  }
  return { spec, resolve: (v: { deckId: string }) => resolve(v), reject: (e: unknown) => reject(e), ctx: () => ctx, runs }
}

const flush = () => new Promise((r) => setTimeout(r, 0))
const job = (kind: 'deck' | 'quiz' | 'video') => useJobsStore.getState().jobs[kind]

describe('jobsStore', () => {
  beforeEach(() => {
    useJobsStore.getState().reset()
    marked.length = 0
    useAuthStore.setState({ user: { id: 'u1' } })
  })

  it('runs one job per kind and refuses a second while it runs', () => {
    const a = deferredSpec()
    expect(useJobsStore.getState().start(a.spec)).toBe(true)
    expect(useJobsStore.getState().start(deferredSpec().spec)).toBe(false)
    expect(useJobsStore.getState().start(deferredSpec({ kind: 'video' }).spec)).toBe(true)
    expect(job('quiz')?.status).toBe('running')
  })

  it('finishes as done, marks the deck new and fills the bar', async () => {
    const a = deferredSpec()
    useJobsStore.getState().start(a.spec)
    a.resolve({ deckId: 'd1' })
    await flush()
    expect(job('quiz')).toMatchObject({ status: 'done', progress: 1, resultDeckId: 'd1', cancellable: false })
    expect(marked).toEqual(['d1:quiz'])
  })

  it('reports progress while running', () => {
    const a = deferredSpec()
    useJobsStore.getState().start(a.spec)
    a.ctx().report({ progress: 0.4, timeline: [{ id: 'x', label: 'X', state: 'active' }] })
    expect(job('quiz')).toMatchObject({ progress: 0.4, timeline: [{ id: 'x' }] })
  })

  it('a failure keeps the reason, and a new start replaces the failed job', async () => {
    const a = deferredSpec()
    useJobsStore.getState().start(a.spec)
    a.reject(new Error('busy'))
    await flush()
    expect(job('quiz')).toMatchObject({ status: 'failed', error: 'busy' })
    expect(useJobsStore.getState().start(deferredSpec().spec)).toBe(true)
    expect(job('quiz')?.status).toBe('running')
  })

  it('cancel aborts and removes the job; a late settle never lands', async () => {
    const a = deferredSpec()
    useJobsStore.getState().start(a.spec)
    const signal = a.ctx().signal
    useJobsStore.getState().cancel('quiz')
    expect(signal.aborted).toBe(true)
    expect(job('quiz')).toBeNull()
    a.resolve({ deckId: 'd1' })
    await flush()
    expect(job('quiz')).toBeNull()
    expect(marked).toEqual([])
  })

  it('cancel does nothing once the job reported it cannot be cancelled', () => {
    const a = deferredSpec()
    useJobsStore.getState().start(a.spec)
    a.ctx().report({ cancellable: false })
    useJobsStore.getState().cancel('quiz')
    expect(a.ctx().signal.aborted).toBe(false)
    expect(job('quiz')?.status).toBe('running')
  })

  it('a stale run cannot overwrite the job that replaced it', async () => {
    const a = deferredSpec()
    useJobsStore.getState().start(a.spec)
    a.reject(new Error('first'))
    await flush()
    const b = deferredSpec()
    useJobsStore.getState().start(b.spec)
    a.ctx().report({ progress: 0.9 })
    expect(job('quiz')?.progress).toBe(0)
  })

  it('retry re-runs the same spec with a fresh signal', async () => {
    const a = deferredSpec()
    useJobsStore.getState().start(a.spec)
    a.reject(new Error('busy'))
    await flush()
    useJobsStore.getState().retry('quiz')
    expect(a.runs).toEqual([0, 1])
    expect(job('quiz')).toMatchObject({ status: 'running', error: null })
    expect(a.ctx().signal.aborted).toBe(false)
  })

  it('dismiss removes a finished job', async () => {
    const a = deferredSpec()
    useJobsStore.getState().start(a.spec)
    a.resolve({ deckId: 'd1' })
    await flush()
    useJobsStore.getState().dismiss('quiz')
    expect(job('quiz')).toBeNull()
  })

  it('abortForDeck stops only that deck\'s jobs', () => {
    const q = deferredSpec({ kind: 'quiz', deckId: 'd1' })
    const v = deferredSpec({ kind: 'video', deckId: 'd2' })
    useJobsStore.getState().start(q.spec)
    useJobsStore.getState().start(v.spec)
    useJobsStore.getState().abortForDeck('d1')
    expect(q.ctx().signal.aborted).toBe(true)
    expect(job('quiz')).toBeNull()
    expect(job('video')?.status).toBe('running')
  })

  it('signing out aborts every job and the result never lands', async () => {
    const a = deferredSpec({ kind: 'deck', deckId: null })
    useJobsStore.getState().start(a.spec)
    useAuthStore.setState({ user: null })
    expect(a.ctx().signal.aborted).toBe(true)
    a.resolve({ deckId: 'new' })
    await flush()
    expect(job('deck')).toBeNull()
    expect(marked).toEqual([])
  })

  it('a run that rejects with an AbortError after cancel is silent', async () => {
    const a = deferredSpec()
    useJobsStore.getState().start(a.spec)
    useJobsStore.getState().cancel('quiz')
    a.reject(abortError())
    await flush()
    expect(job('quiz')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/jobs/jobsStore.test.ts`
Expected: FAIL, cannot resolve `./jobsStore`.

- [ ] **Step 3: Write the implementation**

```ts
// src/jobs/jobsStore.ts
import { create } from 'zustand'
import { useAuthStore } from '@/store/authStore'
import { markNew } from './newItems'
import type { StageEntry } from './timelines'

/*
  Background jobs: one deck, one quiz and one video at a time, each running from a `JobSpec`
  whose `run` holds the work. The store owns the promise and its AbortController, so a job
  outlives the page that started it; pages only start, cancel and read.

  Every write a run makes goes through `current()`, which checks the run's id is still the one
  for its kind and was not aborted. A cancelled, replaced or reset run therefore settles into
  nothing, which is what keeps Cancel's promise (no deck, no quiz, no video) and stops one
  account's result landing in the next.
*/

export type JobKind = 'deck' | 'quiz' | 'video'
export type JobStatus = 'running' | 'done' | 'failed'

export interface Job {
  id: string
  kind: JobKind
  deckId: string | null
  title: string
  status: JobStatus
  progress: number
  timeline: StageEntry[]
  cancellable: boolean
  error: string | null
  resultDeckId: string | null
  editHref: string | null
}

export interface JobReport {
  timeline?: StageEntry[]
  progress?: number
  cancellable?: boolean
}

export interface JobContext {
  signal: AbortSignal
  report(patch: JobReport): void
}

export interface JobSpec {
  kind: JobKind
  deckId: string | null
  title: string
  timeline: StageEntry[]
  editHref?: string
  /** Resolves with the deck the result belongs to; rejects on failure or cancel. */
  run(ctx: JobContext): Promise<{ deckId: string }>
  /** Words for a failure, shown in the panel. */
  describe(err: unknown): string
}

interface JobsState {
  jobs: Record<JobKind, Job | null>
  start(spec: JobSpec): boolean
  cancel(kind: JobKind): void
  retry(kind: JobKind): void
  dismiss(kind: JobKind): void
  abortForDeck(deckId: string): void
  reset(): void
}

interface Run {
  id: string
  controller: AbortController
  spec: JobSpec
}

const runs = new Map<JobKind, Run>()
const KINDS: JobKind[] = ['deck', 'quiz', 'video']
const NO_JOBS: Record<JobKind, Job | null> = { deck: null, quiz: null, video: null }

export function abortError(): DOMException {
  return new DOMException('Aborted', 'AbortError')
}

export const useJobsStore = create<JobsState>()((set, get) => {
  function patch(kind: JobKind, id: string, p: Partial<Job>) {
    const job = get().jobs[kind]
    if (!job || job.id !== id) return
    set({ jobs: { ...get().jobs, [kind]: { ...job, ...p } } })
  }

  function launch(spec: JobSpec) {
    const run: Run = { id: crypto.randomUUID(), controller: new AbortController(), spec }
    runs.set(spec.kind, run)
    const job: Job = {
      id: run.id,
      kind: spec.kind,
      deckId: spec.deckId,
      title: spec.title,
      status: 'running',
      progress: 0,
      timeline: spec.timeline,
      cancellable: true,
      error: null,
      resultDeckId: null,
      editHref: spec.editHref ?? null,
    }
    set({ jobs: { ...get().jobs, [spec.kind]: job } })
    void execute(run)
  }

  async function execute({ id, controller, spec }: Run) {
    const { kind } = spec
    const current = () => runs.get(kind)?.id === id && !controller.signal.aborted
    const ctx: JobContext = {
      signal: controller.signal,
      report: (p) => {
        if (current()) patch(kind, id, p)
      },
    }
    try {
      const { deckId } = await spec.run(ctx)
      if (!current()) return
      markNew(deckId, kind)
      patch(kind, id, {
        status: 'done',
        progress: 1,
        deckId,
        resultDeckId: deckId,
        cancellable: false,
        timeline: get().jobs[kind]?.timeline.map((e) => ({ ...e, state: 'done' as const })) ?? [],
      })
    } catch (err) {
      if (!current()) return
      patch(kind, id, { status: 'failed', error: spec.describe(err), cancellable: false })
    }
  }

  function stop(kind: JobKind) {
    runs.get(kind)?.controller.abort()
    runs.delete(kind)
  }

  return {
    jobs: NO_JOBS,

    start(spec) {
      if (get().jobs[spec.kind]?.status === 'running') return false
      stop(spec.kind)
      launch(spec)
      return true
    },

    cancel(kind) {
      const job = get().jobs[kind]
      if (!job) return
      if (job.status === 'running' && !job.cancellable) return
      stop(kind)
      set({ jobs: { ...get().jobs, [kind]: null } })
    },

    retry(kind) {
      const job = get().jobs[kind]
      const run = runs.get(kind)
      if (job?.status !== 'failed' || !run) return
      launch(run.spec)
    },

    dismiss(kind) {
      if (get().jobs[kind]?.status === 'running') return
      stop(kind)
      set({ jobs: { ...get().jobs, [kind]: null } })
    },

    abortForDeck(deckId) {
      const next = { ...get().jobs }
      for (const kind of KINDS) {
        if (next[kind]?.deckId === deckId) {
          stop(kind)
          next[kind] = null
        }
      }
      set({ jobs: next })
    },

    reset() {
      for (const kind of KINDS) stop(kind)
      set({ jobs: NO_JOBS })
    },
  }
})

export function anyJobRunning(): boolean {
  return KINDS.some((k) => useJobsStore.getState().jobs[k]?.status === 'running')
}

// A different account must never receive a job started by the last one.
let lastUserId = useAuthStore.getState().user?.id ?? null
useAuthStore.subscribe((state) => {
  const uid = state.user?.id ?? null
  if (uid === lastUserId) return
  lastUserId = uid
  useJobsStore.getState().reset()
})

if (typeof window !== 'undefined') {
  // Jobs live in this tab: reloading or closing it ends them.
  window.addEventListener('beforeunload', (e) => {
    if (!anyJobRunning()) return
    e.preventDefault()
    e.returnValue = ''
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/jobs/jobsStore.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 5: Commit**

```bash
git add src/jobs/jobsStore.ts src/jobs/jobsStore.test.ts
git commit -m "feat(jobs): background job store, one job per kind"
```

---

### Task 4: Deck job and the write-only deck insert

**Files:**
- Modify: `src/store/presentationStore.ts` (method `createDeckFromGeneration`, ~lines 767–890)
- Create: `src/jobs/deckJob.ts`
- Test: `src/jobs/deckJob.test.ts`, `src/store/insertGeneratedDeck.test.ts`

**Interfaces:**
- Consumes: `JobSpec` (Task 3), `deckTimeline` (Task 2), `GenerationBrief`/`AIProviderError` from `@/ai/provider`, `PipelineResult`/`PipelineOptions` from `@/generation/pipeline`.
- Produces:
  - In `presentationStore.ts`: `export type GeneratedDeckInput = Parameters<PresentationState['createDeckFromGeneration']>[0]` (use the interface name the file declares for the store's state; check its `create<...>` call) and `export async function insertGeneratedDeck(deck: GeneratedDeckInput, requestedCount?: number | 'auto', result?: PipelineResult): Promise<{ id: string; cards: Card[] }>`.
  - In `deckJob.ts`: `interface DeckJobInput { topic: string; brief: GenerationBrief; requestedCount: number | 'auto'; draftId: string }`, `interface DeckJobDeps { generate(topic: string, brief: GenerationBrief, options: PipelineOptions): Promise<PipelineResult>; insert(deck: PipelineResult['deck'], requestedCount: number | 'auto', result: PipelineResult): Promise<string>; deleteDraft(id: string): void }`, `deckJobSpec(input: DeckJobInput, deps: DeckJobDeps): JobSpec`.

- [ ] **Step 1: Extract `insertGeneratedDeck`**

In `src/store/presentationStore.ts`, move the whole body of `createDeckFromGeneration` *except its final `set({...})`* into a new exported top-level function placed above `export const usePresentationStore`:

```ts
/**
 * Creates a generated deck's rows and returns them, touching no store state. The background deck
 * job calls this directly: the store method below also makes it the open deck, which run in the
 * background would replace whatever deck the user is editing when the job finishes.
 */
export async function insertGeneratedDeck(
  deck: GeneratedDeckInput,
  requestedCount?: number | 'auto',
  result?: PipelineResult,
): Promise<{ id: string; cards: Card[] }> {
  const id = newId()
  // ...the existing body unchanged (sequence check, card mapping, both inserts, the best-effort
  // generation metadata update)...
  return { id, cards }
}
```

Declare above it `export type GeneratedDeckInput = Parameters<StoreState['createDeckFromGeneration']>[0]` using the state interface's real name from the file. Then the store method becomes:

```ts
  async createDeckFromGeneration(deck, requestedCount, result) {
    const { id, cards } = await insertGeneratedDeck(deck, requestedCount, result)
    set({ presentationId: id, title: deck.title, theme: DEFAULT_THEME, textStyle: EMPTY_TEXT_STYLE, cards, status: 'idle', errorMessage: null, past: [], future: [] })
    return id
  },
```

- [ ] **Step 2: Write the insert test**

```ts
// src/store/insertGeneratedDeck.test.ts
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabaseClient', () => ({
  supabaseConfigured: false,
  supabase: null,
  ensureSession: () => Promise.resolve(),
}))

const { insertGeneratedDeck, usePresentationStore } = await import('./presentationStore')

describe('insertGeneratedDeck', () => {
  it('builds the cards without making the deck the open one', async () => {
    usePresentationStore.setState({ presentationId: 'open-deck', title: 'Open' })
    const { id, cards } = await insertGeneratedDeck({
      title: 'New',
      cards: [{ blocks: [{ type: 'heading', text: 'Hi' }], visualStyle: 'structured', speakerNotes: 'Say hi' }],
    })
    expect(id).toBeTruthy()
    expect(cards).toHaveLength(1)
    expect(cards[0].narration).toEqual({ text: 'Say hi', generated: 'Say hi' })
    expect(usePresentationStore.getState().presentationId).toBe('open-deck')
  })
})
```

Run: `npx vitest run src/store/insertGeneratedDeck.test.ts src/store`
Expected: PASS (and every existing store test still passes).

- [ ] **Step 3: Write the failing deck-job test**

```ts
// src/jobs/deckJob.test.ts
import { describe, expect, it, vi } from 'vitest'
import type { PipelineResult } from '@/generation/pipeline'
import type { GenerationBrief } from '@/ai/provider'
import { AIProviderError } from '@/ai/provider'
import { deckJobSpec, type DeckJobDeps } from './deckJob'
import type { JobReport } from './jobsStore'

const brief = { slideCount: 5, audience: 'students', detailLevel: 'balanced', tone: 'professional', guidance: '' } as unknown as GenerationBrief
const result = { deck: { title: 'T', cards: [] } } as unknown as PipelineResult

function setup(over: Partial<DeckJobDeps> = {}) {
  const reports: JobReport[] = []
  const deps: DeckJobDeps = {
    generate: vi.fn(async (_t, _b, o) => {
      o.onStage?.('research')
      o.onStage?.('write')
      o.onStage?.('validate')
      o.onStage?.('repair', { slides: 2 })
      return result
    }),
    insert: vi.fn(async () => 'deck-1'),
    deleteDraft: vi.fn(),
    ...over,
  }
  const spec = deckJobSpec({ topic: 'Volcanoes', brief, requestedCount: 5, draftId: 'draft-1' }, deps)
  const controller = new AbortController()
  const ctx = { signal: controller.signal, report: (p: JobReport) => void reports.push(p) }
  return { spec, deps, reports, controller, ctx }
}

describe('deckJobSpec', () => {
  it('names the job after the topic and links Edit brief to the draft', () => {
    const { spec } = setup()
    expect(spec).toMatchObject({ kind: 'deck', deckId: null, title: 'Volcanoes', editHref: '/new?draft=draft-1' })
  })

  it('generates, inserts, then deletes the draft', async () => {
    const { spec, deps, ctx, reports } = setup()
    await expect(spec.run(ctx)).resolves.toEqual({ deckId: 'deck-1' })
    expect(deps.insert).toHaveBeenCalledWith(result.deck, 5, result)
    expect(deps.deleteDraft).toHaveBeenCalledWith('draft-1')
    const labels = reports.at(-1)!.timeline!.map((e) => e.label)
    expect(labels).toContain('Tightening 2 slides')
    expect(reports.some((r) => r.cancellable === false)).toBe(true)
  })

  it('creates no deck when cancelled as the pipeline resolves', async () => {
    const { spec, deps, ctx, controller } = setup({
      generate: vi.fn(async () => {
        controller.abort()
        return result
      }),
    })
    await expect(spec.run(ctx)).rejects.toThrow()
    expect(deps.insert).not.toHaveBeenCalled()
    expect(deps.deleteDraft).not.toHaveBeenCalled()
  })

  it('keeps the draft when generation fails, with the provider message', async () => {
    const err = new AIProviderError('Groq is busy', 'capacity', 429)
    const { spec, deps, ctx } = setup({ generate: vi.fn(async () => { throw err }) })
    await expect(spec.run(ctx)).rejects.toBe(err)
    expect(deps.deleteDraft).not.toHaveBeenCalled()
    expect(spec.describe(err)).toBe('Groq is busy')
    expect(spec.describe(new Error('x'))).toBe('Generation failed. Try again.')
  })
})
```

Check the `AIProviderError` constructor's real argument order in `src/ai/provider.ts` and match it in the test.

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run src/jobs/deckJob.test.ts`
Expected: FAIL, cannot resolve `./deckJob`.

- [ ] **Step 5: Write the implementation**

```ts
// src/jobs/deckJob.ts
import { AIProviderError, type GenerationBrief } from '@/ai/provider'
import type { PipelineOptions, PipelineResult } from '@/generation/pipeline'
import { abortError, type JobSpec } from './jobsStore'
import { deckTimeline } from './timelines'

/*
  A deck from a brief, in the background: the work CreatePage used to do in place. The brief
  stays a draft until the deck exists, so a failure can always go back to it ("Edit brief").
  Once the insert starts the job cannot be cancelled: the rows are being written.
*/

export interface DeckJobInput {
  topic: string
  brief: GenerationBrief
  requestedCount: number | 'auto'
  draftId: string
}

export interface DeckJobDeps {
  generate(topic: string, brief: GenerationBrief, options: PipelineOptions): Promise<PipelineResult>
  insert(deck: PipelineResult['deck'], requestedCount: number | 'auto', result: PipelineResult): Promise<string>
  deleteDraft(id: string): void
}

export function deckJobSpec(input: DeckJobInput, deps: DeckJobDeps): JobSpec {
  return {
    kind: 'deck',
    deckId: null,
    title: input.topic,
    timeline: deckTimeline('research', null).timeline,
    editHref: `/new?draft=${encodeURIComponent(input.draftId)}`,
    async run({ signal, report }) {
      let repairSlides: number | null = null
      report(deckTimeline('research', null))
      const result = await deps.generate(input.topic, input.brief, {
        signal,
        onStage: (stage, detail) => {
          if (stage === 'repair') repairSlides = detail?.slides ?? 0
          report(deckTimeline(stage, repairSlides))
        },
      })
      // Cancel landed while the pipeline was resolving: Cancel promises no deck.
      if (signal.aborted) throw abortError()
      report({ ...deckTimeline('save', repairSlides), cancellable: false })
      const deckId = await deps.insert(result.deck, input.requestedCount, result)
      deps.deleteDraft(input.draftId)
      return { deckId }
    },
    describe: (err) => (err instanceof AIProviderError ? err.message : 'Generation failed. Try again.'),
  }
}
```

- [ ] **Step 6: Run tests**

Run: `npx vitest run src/jobs src/store`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/store/presentationStore.ts src/store/insertGeneratedDeck.test.ts src/jobs/deckJob.ts src/jobs/deckJob.test.ts
git commit -m "feat(jobs): background deck job over a write-only deck insert"
```

---

### Task 5: Quiz job

**Files:**
- Create: `src/jobs/quizJob.ts`
- Test: `src/jobs/quizJob.test.ts`
- Modify: `src/components/quiz/QuizModal.tsx` (only to import `friendlyError`/`failureMessage` from the new file instead of defining them; full modal rewiring is Task 9)

**Interfaces:**
- Consumes: `generateSections`, `SectionFailure`, `EmptySectionError`, `SectionRequest`, `BuiltSection` from `@/quiz/sections`; `SectionToSave` from `@/quiz/api`; `JobSpec`, `abortError` (Task 3); `quizTimeline` (Task 2).
- Produces: `interface QuizJobInput { presentationId: string; title: string; requests: SectionRequest[] }`, `interface QuizJobDeps { write(request: SectionRequest, index: number, avoid: string[], signal: AbortSignal): Promise<{ questions: QuizQuestionDraft[]; shortfall: number }>; create(input: { presentationId: string; title: string; deckTitle: string; sections: SectionToSave[] }): Promise<{ id: string }> }`, `quizJobSpec(input, deps): JobSpec`, `friendlyError(err: unknown, saving: boolean): string`, `failureMessage(f: SectionFailure): string`.

- [ ] **Step 1: Write the failing test**

```ts
// src/jobs/quizJob.test.ts
import { describe, expect, it, vi } from 'vitest'
import type { SectionRequest } from '@/quiz/sections'
import { quizJobSpec, type QuizJobDeps } from './quizJob'

vi.mock('@/store/presentationStore', () => ({ describeError: (e: unknown) => (e instanceof Error ? e.message : String(e)) }))

const req = (title: string): SectionRequest =>
  ({ section: { title, instructions: '', config: { type: 'true_false' } }, count: 2 }) as unknown as SectionRequest
const q = (prompt: string) => ({ prompt }) as never

function setup(over: Partial<QuizJobDeps> = {}) {
  const deps: QuizJobDeps = {
    write: vi.fn(async (r: SectionRequest) => ({ questions: [q(`${r.section.title}?`)], shortfall: 1 })),
    create: vi.fn(async () => ({ id: 'quiz-1' })),
    ...over,
  }
  const spec = quizJobSpec({ presentationId: 'd1', title: 'Deck', requests: [req('A'), req('B'), req('C')] }, deps)
  const ctx = () => ({ signal: new AbortController().signal, report: vi.fn() })
  return { spec, deps, ctx }
}

describe('quizJobSpec', () => {
  it('writes every test then saves once', async () => {
    const { spec, deps, ctx } = setup()
    await expect(spec.run(ctx())).resolves.toEqual({ deckId: 'd1' })
    expect(deps.write).toHaveBeenCalledTimes(3)
    expect(deps.create).toHaveBeenCalledTimes(1)
    expect(vi.mocked(deps.create).mock.calls[0][0]).toMatchObject({ presentationId: 'd1', title: 'Deck — quiz', deckTitle: 'Deck' })
  })

  it('Try again resumes at the failed test', async () => {
    let fail = true
    const { spec, deps, ctx } = setup({
      write: vi.fn(async (r: SectionRequest) => {
        if (r.section.title === 'B' && fail) {
          fail = false
          throw new Error('busy')
        }
        return { questions: [q(r.section.title)], shortfall: 0 }
      }),
    })
    await expect(spec.run(ctx())).rejects.toThrow()
    await spec.run(ctx())
    const titles = vi.mocked(deps.write).mock.calls.map((c) => c[0].section.title)
    expect(titles).toEqual(['A', 'B', 'B', 'C'])
  })

  it('a failed save is retried without rewriting any test', async () => {
    let fail = true
    const { spec, deps, ctx } = setup({
      create: vi.fn(async () => {
        if (fail) {
          fail = false
          throw new Error('create_quiz failed')
        }
        return { id: 'quiz-1' }
      }),
    })
    await expect(spec.run(ctx())).rejects.toThrow()
    await spec.run(ctx())
    expect(deps.write).toHaveBeenCalledTimes(3)
    expect(deps.create).toHaveBeenCalledTimes(2)
  })

  it('reports saving as not cancellable', async () => {
    const { spec, ctx } = setup()
    const c = ctx()
    await spec.run(c)
    expect(c.report).toHaveBeenCalledWith(expect.objectContaining({ cancellable: false }))
  })

  it('describes a failed save with the migration hint', () => {
    const { spec } = setup()
    expect(spec.describe(new Error('create_quiz failed'))).toMatch(/Run migration 0016/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/jobs/quizJob.test.ts`
Expected: FAIL, cannot resolve `./quizJob`.

- [ ] **Step 3: Write the implementation**

Move `friendlyError` and `failureMessage` verbatim from `QuizModal.tsx` into this file (exported) and import them back into `QuizModal.tsx`.

```ts
// src/jobs/quizJob.ts
import { AIProviderError } from '@/ai/provider'
import type { SectionToSave } from '@/quiz/api'
import { EmptySectionError, SectionFailure, generateSections, type BuiltSection, type SectionRequest } from '@/quiz/sections'
import type { QuizQuestionDraft } from '@/quiz/types'
import { describeError } from '@/store/presentationStore'
import type { JobSpec } from './jobsStore'
import { quizTimeline } from './timelines'

/*
  A quiz from a deck, in the background: the work QuizModal used to do in place. Tests are
  written one call at a time; the ones finished before a failure are kept in this closure, so
  Try again resumes at the failed test, and a failed save retries the save alone. Saving is one
  `create_quiz` call and cannot be cancelled once sent.
*/

export interface QuizJobInput {
  presentationId: string
  title: string
  requests: SectionRequest[]
}

export interface QuizJobDeps {
  write(
    request: SectionRequest,
    index: number,
    avoid: string[],
    signal: AbortSignal,
  ): Promise<{ questions: QuizQuestionDraft[]; shortfall: number }>
  create(input: { presentationId: string; title: string; deckTitle: string; sections: SectionToSave[] }): Promise<{ id: string }>
}

export function friendlyError(err: unknown, saving: boolean): string {
  if (err instanceof AIProviderError && err.kind === 'capacity') {
    return 'The free AI model is busy. Try again in a minute.'
  }
  const message = describeError(err)
  return saving && /create_quiz/i.test(message) ? `${message} Run migration 0016 in Supabase.` : message
}

export function failureMessage(failure: SectionFailure): string {
  if (failure.cause instanceof EmptySectionError) {
    return `The AI couldn't write questions for ${failure.section.title}. Try again or add more content.`
  }
  return `${failure.section.title}: ${friendlyError(failure.cause, false)}`
}

export function quizJobSpec(input: QuizJobInput, deps: QuizJobDeps): JobSpec {
  const titles = input.requests.map((r) => r.section.title)
  /** Tests finished so far; survives a failed attempt so the next one resumes. */
  let written: BuiltSection[] = []

  return {
    kind: 'quiz',
    deckId: input.presentationId,
    title: input.title,
    timeline: quizTimeline(titles, 0).timeline,
    async run({ signal, report }) {
      report({ ...quizTimeline(titles, written.length), cancellable: true })
      try {
        written = await generateSections({
          requests: input.requests,
          written,
          signal,
          onProgress: (index) => report(quizTimeline(titles, index)),
          write: (request, index, avoid) => deps.write(request, index, avoid, signal),
        })
      } catch (err) {
        if (err instanceof SectionFailure) written = err.written
        throw err
      }
      report({ ...quizTimeline(titles, 'save'), cancellable: false })
      await deps.create({
        presentationId: input.presentationId,
        title: `${input.title} — quiz`,
        deckTitle: input.title,
        sections: written.map((b) => ({ section: b.section, questions: b.questions })),
      })
      return { deckId: input.presentationId }
    },
    describe: (err) => (err instanceof SectionFailure ? failureMessage(err) : friendlyError(err, true)),
  }
}
```

Check that `QuizQuestionDraft` is exported from `@/quiz/types` (it is imported from there by `quiz/sections.ts`) and that `SectionToSave` is exported from `@/quiz/api` (it is, line 49).

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/jobs/quizJob.test.ts src/components/quiz`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/jobs/quizJob.ts src/jobs/quizJob.test.ts src/components/quiz/QuizModal.tsx
git commit -m "feat(jobs): background quiz job that resumes at the failed test"
```

---

### Task 6: Video job and the real starters

**Files:**
- Create: `src/jobs/videoJob.ts`, `src/jobs/start.ts`
- Test: `src/jobs/videoJob.test.ts`

**Interfaces:**
- Consumes: `VideoDeck`, `GenerateResult` (types) from `@/video/generate`; `VoiceSettings` (type) from `@/voice/settingsRow`; `VideoRecord` (type) from `@/video/videoRecord`; `Progress` (type) from `@/video/pipeline`; `VideoError` from `@/video/errors`; `canCancelVideo` from `@/video/ui`; Tasks 2–5.
- Produces:
  - `interface VideoJobInput { deck: VideoDeck & { presentationId: string }; voice: VoiceSettings; previous: VideoRecord | null }`, `interface VideoJobDeps { generate(o: { deck: VideoDeck; voice: VoiceSettings; previous: VideoRecord | null; signal: AbortSignal; onProgress: (p: Progress) => void }): Promise<GenerateResult> }`, `videoJobSpec(input, deps): JobSpec`.
  - `start.ts`: `startDeckJob(input: DeckJobInput): boolean`, `startQuizJob(input: { presentationId: string; title: string; cards: Card[]; requests: SectionRequest[] }): boolean`, `startVideoJob(input: VideoJobInput): boolean`.

- [ ] **Step 1: Write the failing test**

```ts
// src/jobs/videoJob.test.ts
import { describe, expect, it, vi } from 'vitest'
import { VideoError } from '@/video/errors'
import { videoJobSpec, type VideoJobDeps, type VideoJobInput } from './videoJob'
import type { JobReport } from './jobsStore'

const input = { deck: { presentationId: 'd1', title: 'Deck', cards: [], theme: {}, textStyle: {} }, voice: { voiceId: 'v' }, previous: null } as unknown as VideoJobInput

function run(generate: VideoJobDeps['generate']) {
  const reports: JobReport[] = []
  const spec = videoJobSpec(input, { generate })
  const promise = spec.run({ signal: new AbortController().signal, report: (p) => void reports.push(p) })
  return { spec, promise, reports }
}

describe('videoJobSpec', () => {
  it('resolves with the deck when the video is saved', async () => {
    const { promise, spec } = run(async () => ({ status: 'done', view: {} as never }))
    await expect(promise).resolves.toEqual({ deckId: 'd1' })
    expect(spec).toMatchObject({ kind: 'video', deckId: 'd1', title: 'Deck' })
  })

  it('becomes uncancellable once uploading starts', async () => {
    const { promise, reports } = run(async (o) => {
      o.onProgress({ stage: 'rendering', done: 1, total: 3 })
      o.onProgress({ stage: 'uploading', done: 0, total: 1 })
      return { status: 'done', view: {} as never }
    })
    await promise
    expect(reports.find((r) => r.timeline?.some((e) => e.id === 'rendering' && e.state === 'active'))?.cancellable).toBe(true)
    expect(reports.at(-1)?.cancellable).toBe(false)
  })

  it('a cancelled run rejects, so the store never calls it done', async () => {
    const { promise } = run(async () => ({ status: 'cancelled' }))
    await expect(promise).rejects.toThrow()
  })

  it('uses a VideoError message as is, and a generic one otherwise', () => {
    const { spec } = run(async () => ({ status: 'cancelled' }))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(spec.describe(new VideoError('narrating', 'Narrating slide 3 failed: quota'))).toBe('Narrating slide 3 failed: quota')
    expect(spec.describe(new Error('boom'))).toBe('Something went wrong. Try again.')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/jobs/videoJob.test.ts`
Expected: FAIL, cannot resolve `./videoJob`.

- [ ] **Step 3: Write `videoJob.ts`**

```ts
// src/jobs/videoJob.ts
import type { GenerateResult, VideoDeck } from '@/video/generate'
import { VideoError } from '@/video/errors'
import type { Progress } from '@/video/pipeline'
import { canCancelVideo } from '@/video/ui'
import type { VideoRecord } from '@/video/videoRecord'
import type { VoiceSettings } from '@/voice/settingsRow'
import { abortError, type JobSpec } from './jobsStore'
import { videoTimeline } from './timelines'

/*
  The narrated video, in the background: the run CloneVoiceModal used to own. `generate` is
  injected so this file never imports the encoder or the rasteriser (start.ts reaches them
  through `import()`). The upload cannot be aborted, so from then on the job is not cancellable.
*/

export interface VideoJobInput {
  deck: VideoDeck & { presentationId: string }
  voice: VoiceSettings
  previous: VideoRecord | null
}

export interface VideoJobDeps {
  generate(o: {
    deck: VideoDeck
    voice: VoiceSettings
    previous: VideoRecord | null
    signal: AbortSignal
    onProgress: (p: Progress) => void
  }): Promise<GenerateResult>
}

export function videoJobSpec(input: VideoJobInput, deps: VideoJobDeps): JobSpec {
  return {
    kind: 'video',
    deckId: input.deck.presentationId,
    title: input.deck.title,
    timeline: videoTimeline(null).timeline,
    async run({ signal, report }) {
      report({ ...videoTimeline(null), cancellable: true })
      const result = await deps.generate({
        deck: input.deck,
        voice: input.voice,
        previous: input.previous,
        signal,
        onProgress: (p) => report({ ...videoTimeline(p), cancellable: canCancelVideo(p) }),
      })
      if (result.status === 'cancelled') throw abortError()
      return { deckId: input.deck.presentationId }
    },
    describe: (err) => {
      if (err instanceof VideoError) return err.message
      console.error('[video]', err)
      return 'Something went wrong. Try again.'
    },
  }
}
```

- [ ] **Step 4: Write `start.ts`**

```ts
// src/jobs/start.ts
import { FallbackProvider, PROVIDER_CHAIN, QUIZ_CHAIN, generateQuizWithFallback } from '@/ai/fallbackProvider'
import { quizSlides } from '@/ai/quizPrompt'
import { headingTextOf, type Card } from '@/engine/contentBlocks'
import { generatePresentation } from '@/generation/pipeline'
import { deleteDraft } from '@/lib/briefDrafts'
import { createQuiz } from '@/quiz/api'
import { buildQuestions } from '@/quiz/build'
import type { SectionRequest } from '@/quiz/sections'
import { insertGeneratedDeck } from '@/store/presentationStore'
import { deckJobSpec, type DeckJobInput } from './deckJob'
import { useJobsStore } from './jobsStore'
import { quizJobSpec } from './quizJob'
import { videoJobSpec, type VideoJobInput } from './videoJob'

/** The real dependencies for each job. Every start returns false when a job of that kind is running. */

export function startDeckJob(input: DeckJobInput): boolean {
  return useJobsStore.getState().start(
    deckJobSpec(input, {
      generate: (topic, brief, options) => generatePresentation(new FallbackProvider(PROVIDER_CHAIN), topic, brief, options),
      insert: async (deck, requestedCount, result) => (await insertGeneratedDeck(deck, requestedCount, result)).id,
      deleteDraft,
    }),
  )
}

export function startQuizJob(input: { presentationId: string; title: string; cards: Card[]; requests: SectionRequest[] }): boolean {
  const slides = quizSlides(input.cards)
  const cardRefs = input.cards.map((c, i) => ({ id: c.id, heading: headingTextOf(c, i) }))
  const seed = crypto.randomUUID()
  return useJobsStore.getState().start(
    quizJobSpec(
      { presentationId: input.presentationId, title: input.title, requests: input.requests },
      {
        write: async (request, index, avoid, signal) => {
          const response = await generateQuizWithFallback(
            QUIZ_CHAIN,
            { title: input.title, slides, count: request.count, config: request.section.config, avoid },
            signal,
          )
          return buildQuestions({ response, config: request.section.config, count: request.count, cards: cardRefs, seed: `${seed}:${index}` })
        },
        create: createQuiz,
      },
    ),
  )
}

export function startVideoJob(input: VideoJobInput): boolean {
  return useJobsStore.getState().start(
    videoJobSpec(input, {
      // Through import() only: this file must not pull the encoder into the entry bundle.
      generate: async (o) => (await import('@/video/generate')).generateVideoForDeck(o),
    }),
  )
}
```

If `createQuiz`'s parameter type does not accept exactly `{ presentationId, title, deckTitle, sections }`, wrap it: `create: (i) => createQuiz(i)` and adjust to its real signature (see `src/quiz/api.ts:66`).

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run src/jobs && npx tsc -b`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/jobs/videoJob.ts src/jobs/videoJob.test.ts src/jobs/start.ts
git commit -m "feat(jobs): background video job and real job starters"
```

---

### Task 7: The new dot on deck cards

**Files:**
- Create: `src/components/jobs/NewDot.tsx`, `src/components/jobs/NewDot.test.tsx`
- Modify: `src/components/home/DeckCard.tsx`, `src/components/home/DeckListRow.tsx`

**Interfaces:**
- Consumes: `useNewItems`, `NewKind` (Task 1).
- Produces: `newLabel(kinds: readonly NewKind[]): string`; `NewDot({ kinds, className }: { kinds: readonly NewKind[]; className?: string })`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/jobs/NewDot.test.tsx
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { NewDot, newLabel } from './NewDot'

describe('NewDot', () => {
  it('names what is new', () => {
    expect(newLabel(['deck'])).toBe('New deck')
    expect(newLabel(['quiz', 'video'])).toBe('New quiz and video')
    expect(newLabel(['deck', 'quiz', 'video'])).toBe('New deck, quiz and video')
  })
  it('draws nothing when nothing is new', () => {
    expect(renderToStaticMarkup(<NewDot kinds={[]} />)).toBe('')
  })
  it('draws a labelled dot', () => {
    const html = renderToStaticMarkup(<NewDot kinds={['quiz']} />)
    expect(html).toContain('role="img"')
    expect(html).toContain('aria-label="New quiz"')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/jobs/NewDot.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Write the component**

```tsx
// src/components/jobs/NewDot.tsx
import type { NewKind } from '@/jobs/newItems'

const NAMES: Record<NewKind, string> = { deck: 'deck', quiz: 'quiz', video: 'video' }

export function newLabel(kinds: readonly NewKind[]): string {
  const names = kinds.map((k) => NAMES[k])
  if (names.length <= 1) return `New ${names[0] ?? ''}`.trim()
  return `New ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/** A small yellow dot saying a deck has a result the user has not opened yet. */
export function NewDot({ kinds, className = '' }: { kinds: readonly NewKind[]; className?: string }) {
  if (kinds.length === 0) return null
  const label = newLabel(kinds)
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={`block size-2.5 rounded-full bg-amber-400 ring-2 ring-app-background ${className}`}
    />
  )
}
```

- [ ] **Step 4: Put it on the card and the row**

In `DeckCard.tsx`, add `const newKinds = useNewItems(deck.id)` at the top of the component and, as the last child of the root `<div className="group relative ...">`:

```tsx
      <NewDot kinds={newKinds} className="pointer-events-none absolute -top-1 -right-1 z-10" />
```

In `DeckListRow.tsx`, add the same hook and render `<NewDot kinds={newKinds} className="ml-2 inline-block shrink-0 align-middle" />` directly after the element showing `deck.title`.

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/components/jobs src/components/home`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/jobs/NewDot.tsx src/components/jobs/NewDot.test.tsx src/components/home/DeckCard.tsx src/components/home/DeckListRow.tsx
git commit -m "feat(home): new-result dot on deck cards and rows"
```

---

### Task 8: The corner panel

**Files:**
- Create: `src/components/jobs/JobRow.tsx`, `src/components/jobs/JobTray.tsx`, `src/components/jobs/JobTray.test.tsx`
- Modify: `src/App.tsx`, `src/index.css`

**Interfaces:**
- Consumes: `Job`, `JobKind`, `useJobsStore` (Task 3).
- Produces: `JobRow(props: JobRowProps)`, `JobTrayView(props: { jobs: Job[]; minimized: boolean; expanded: boolean; onToggle(): void; actions: JobActions })`, `JobTray()` (connected), `interface JobActions { cancel(kind: JobKind): void; retry(kind: JobKind): void; dismiss(kind: JobKind): void; view(job: Job): void; editBrief(job: Job): void }`, `viewHref(job: Job): string`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/jobs/JobTray.test.tsx
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Job } from '@/jobs/jobsStore'
import { JobTrayView, viewHref, type JobActions } from './JobTray'

const noop = () => {}
const actions: JobActions = { cancel: noop, retry: noop, dismiss: noop, view: noop, editBrief: noop }

const base: Job = {
  id: '1', kind: 'deck', deckId: null, title: 'Volcanoes', status: 'running', progress: 0.25,
  timeline: [
    { id: 'research', label: 'Researching sources', state: 'done' },
    { id: 'write', label: 'Writing slides', state: 'active' },
    { id: 'save', label: 'Saving', state: 'pending' },
  ],
  cancellable: true, error: null, resultDeckId: null, editHref: '/new?draft=x',
}

const render = (jobs: Job[], minimized = false, expanded = false) =>
  renderToStaticMarkup(<JobTrayView jobs={jobs} minimized={minimized} expanded={expanded} onToggle={noop} actions={actions} />)

describe('JobTrayView', () => {
  it('renders nothing without jobs', () => {
    expect(render([])).toBe('')
  })
  it('shows the title, the timeline and a cancel button while running', () => {
    const html = render([base])
    expect(html).toContain('Volcanoes')
    expect(html).toContain('Writing slides')
    expect(html).toContain('aria-label="Cancel Volcanoes"')
    expect(html).toContain('role="progressbar"')
  })
  it('disables cancel when the job cannot be cancelled', () => {
    expect(render([{ ...base, cancellable: false }])).toMatch(/<button[^>]*disabled[^>]*aria-label="Cancel Volcanoes"|<button[^>]*aria-label="Cancel Volcanoes"[^>]*disabled/)
  })
  it('a done job becomes its View button', () => {
    expect(render([{ ...base, status: 'done', resultDeckId: 'd1' }])).toContain('View Slide')
    expect(render([{ ...base, kind: 'quiz', status: 'done', resultDeckId: 'd1' }])).toContain('View Quiz')
    expect(render([{ ...base, kind: 'video', status: 'done', resultDeckId: 'd1' }])).toContain('View Video')
  })
  it('a failed deck job offers Edit brief and Try again with the reason', () => {
    const html = render([{ ...base, status: 'failed', error: 'Groq is busy' }])
    expect(html).toContain('Groq is busy')
    expect(html).toContain('Edit brief')
    expect(html).toContain('Try again')
  })
  it('a failed quiz job offers only Try again', () => {
    const html = render([{ ...base, kind: 'quiz', status: 'failed', error: 'x', editHref: null }])
    expect(html).not.toContain('Edit brief')
    expect(html).toContain('Try again')
  })
  it('minimized shows pills, not timelines', () => {
    const html = render([base], true)
    expect(html).toContain('25%')
    expect(html).not.toContain('Researching sources')
  })
  it('the video row says to keep the tab open while drawing', () => {
    const html = render([{ ...base, kind: 'video', timeline: [{ id: 'rendering', label: 'Drawing slides', state: 'active' }] }])
    expect(html).toContain('Keep this tab open')
  })
})

describe('viewHref', () => {
  it('opens the right thing', () => {
    expect(viewHref({ ...base, status: 'done', resultDeckId: 'd1' })).toBe('/deck/d1')
    expect(viewHref({ ...base, kind: 'quiz', status: 'done', resultDeckId: 'd1' })).toBe('/deck/d1?quiz=list')
    expect(viewHref({ ...base, kind: 'video', status: 'done', resultDeckId: 'd1' })).toBe('/deck/d1?video=1')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/jobs/JobTray.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Add the animations to `src/index.css`** (append at the end, unlayered)

```css
/* Background jobs panel (components/jobs). */
@keyframes job-check-draw {
  from { stroke-dashoffset: 24; }
  to { stroke-dashoffset: 0; }
}
@keyframes job-rise-in {
  from { opacity: 0; transform: translateY(4px) scale(0.97); }
  to { opacity: 1; transform: none; }
}
@keyframes job-fade-out {
  to { opacity: 0; transform: translateY(4px); }
}
.job-check path { stroke-dasharray: 24; animation: job-check-draw 400ms ease-out both; }
.job-rise-in { animation: job-rise-in 300ms ease-out 350ms both; }
.job-fade-out { animation: job-fade-out 600ms ease-in var(--job-fade-delay, 0ms) forwards; }
@media (prefers-reduced-motion: reduce) {
  .job-check path, .job-rise-in, .job-fade-out { animation: none; }
}
```

- [ ] **Step 4: Write `JobRow.tsx`**

```tsx
// src/components/jobs/JobRow.tsx
import type { Job } from '@/jobs/jobsStore'
import type { JobActions } from './JobTray'

const VIEW_LABEL = { deck: 'View Slide', quiz: 'View Quiz', video: 'View Video' } as const
const KIND_LABEL = { deck: 'Generating slides', quiz: 'Generating quiz', video: 'Generating video' } as const

function Check() {
  return (
    <svg viewBox="0 0 16 16" className="job-check size-4 shrink-0 text-emerald-500" aria-hidden>
      <path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Bar({ value, label }: { value: number; label: string }) {
  const pct = Math.round(value * 100)
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="h-1 w-full overflow-hidden rounded-full bg-app-muted/20">
      <div className="h-full rounded-full bg-app-accent transition-[width] duration-500" style={{ width: `${pct}%` }} />
    </div>
  )
}

export function JobRow({ job, actions, fadeAfterMs }: { job: Job; actions: JobActions; fadeAfterMs?: number }) {
  const [confirming, setConfirming] = useState(false)
  if (job.status === 'done') {
    return (
      <div
        className={`flex items-center gap-2 rounded-app border border-app-border bg-app-background p-2 shadow-app ${fadeAfterMs ? 'job-fade-out' : ''}`}
        style={fadeAfterMs ? ({ '--job-fade-delay': `${fadeAfterMs}ms` } as React.CSSProperties) : undefined}
      >
        <Check />
        <button
          type="button"
          onClick={() => actions.view(job)}
          className="job-rise-in flex-1 rounded-app bg-app-accent px-3 py-1.5 text-left text-sm font-medium text-white hover:opacity-90"
        >
          {VIEW_LABEL[job.kind]}
          <span className="ml-1 font-normal opacity-80">· {job.title}</span>
        </button>
        <button type="button" aria-label={`Dismiss ${job.title}`} onClick={() => actions.dismiss(job.kind)} className="px-1 text-app-muted hover:text-app-foreground">
          ×
        </button>
      </div>
    )
  }

  const failed = job.status === 'failed'
  const drawing = job.kind === 'video' && job.timeline.some((e) => e.id === 'rendering' && e.state === 'active')
  return (
    <div className={`rounded-app border bg-app-background p-3 shadow-app ${failed ? 'border-red-400' : 'border-app-border'}`}>
      <div className="mb-2 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-xs text-app-muted">{failed ? 'Failed' : KIND_LABEL[job.kind]}</div>
          <div className="truncate text-sm font-medium text-app-foreground">{job.title}</div>
        </div>
        {failed ? (
          <button type="button" aria-label={`Dismiss ${job.title}`} onClick={() => actions.dismiss(job.kind)} className="px-1 text-app-muted hover:text-app-foreground">
            ×
          </button>
        ) : confirming && job.cancellable ? (
          <div className="flex items-center gap-1 text-xs">
            <span className="text-app-muted">Stop generating?</span>
            <button type="button" onClick={() => actions.cancel(job.kind)} className="rounded-app px-1.5 py-0.5 font-medium text-red-600 hover:bg-red-500/10 dark:text-red-400">
              Stop
            </button>
            <button type="button" onClick={() => setConfirming(false)} className="rounded-app px-1.5 py-0.5 text-app-foreground hover:bg-app-muted/10">
              Keep going
            </button>
          </div>
        ) : (
          <button
            type="button"
            aria-label={`Cancel ${job.title}`}
            disabled={!job.cancellable}
            title={job.cancellable ? 'Cancel' : 'Saving — this step cannot be cancelled'}
            onClick={() => setConfirming(true)}
            className="px-1 text-app-muted hover:text-app-foreground disabled:opacity-40"
          >
            ×
          </button>
        )}
      </div>
      {failed ? (
        <>
          <p className="mb-2 text-xs font-medium text-red-600 dark:text-red-400">{job.error}</p>
          <div className="flex gap-2">
            {job.editHref && (
              <button type="button" onClick={() => actions.editBrief(job)} className="rounded-app border border-app-border px-2 py-1 text-xs text-app-foreground hover:bg-app-muted/10">
                Edit brief
              </button>
            )}
            <button type="button" onClick={() => actions.retry(job.kind)} className="rounded-app bg-app-accent px-2 py-1 text-xs font-medium text-white hover:opacity-90">
              Try again
            </button>
          </div>
        </>
      ) : (
        <>
          <Bar value={job.progress} label={`${KIND_LABEL[job.kind]}: ${job.title}`} />
          <ol className="mt-2 space-y-0.5 text-xs">
            {job.timeline.map((e) => (
              <li
                key={e.id}
                className={`flex items-center gap-1.5 ${e.state === 'active' ? 'font-medium text-app-foreground' : e.state === 'done' ? 'text-app-muted' : 'text-app-muted opacity-60'}`}
              >
                <span aria-hidden className="inline-flex w-3 justify-center">
                  {e.state === 'done' ? '✓' : e.state === 'active' ? <span className="size-2.5 animate-spin rounded-full border border-current border-t-transparent" /> : '·'}
                </span>
                {e.label}
              </li>
            ))}
          </ol>
          {drawing && <p className="mt-2 text-xs text-app-muted">Keep this tab open while slides are drawn.</p>}
        </>
      )}
    </div>
  )
}
```

Add `import { useState, type CSSProperties } from 'react'` at the top and use `CSSProperties` instead of `React.CSSProperties` (the project has `verbatimModuleSyntax`; no global `React` namespace import).

- [ ] **Step 5: Write `JobTray.tsx`**

```tsx
// src/components/jobs/JobTray.tsx
import { useEffect, useState } from 'react'
import { matchPath, useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { useJobsStore, type Job, type JobKind } from '@/jobs/jobsStore'
import { JobRow } from './JobRow'

/*
  The bottom-right panel for background jobs, mounted once beside the routes so it survives
  every page change. On a deck's editor it shrinks to pills (expand on click), and a quiz for
  the deck that is open is left to the top bar's strip.
*/

export interface JobActions {
  cancel(kind: JobKind): void
  retry(kind: JobKind): void
  dismiss(kind: JobKind): void
  view(job: Job): void
  editBrief(job: Job): void
}

export function viewHref(job: Job): string {
  const id = job.resultDeckId ?? job.deckId ?? ''
  if (job.kind === 'quiz') return `/deck/${id}?quiz=list`
  if (job.kind === 'video') return `/deck/${id}?video=1`
  return `/deck/${id}`
}

/** How long a finished video's View button stays before it fades (the card's dot still marks it). */
const VIDEO_FADE_MS = 6000

export function JobTrayView({
  jobs,
  minimized,
  expanded,
  onToggle,
  actions,
}: {
  jobs: Job[]
  minimized: boolean
  expanded: boolean
  onToggle(): void
  actions: JobActions
}) {
  if (jobs.length === 0) return null
  const compact = minimized && !expanded
  return (
    <div className="fixed right-4 bottom-4 z-40 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2" aria-live="polite">
      {minimized && (
        <button type="button" onClick={onToggle} className="self-end rounded-full border border-app-border bg-app-background px-2 py-0.5 text-xs text-app-muted shadow-app hover:text-app-foreground">
          {expanded ? 'Minimize' : 'Show details'}
        </button>
      )}
      {jobs.map((job) =>
        compact ? (
          <button
            key={job.id}
            type="button"
            onClick={onToggle}
            className="flex items-center gap-2 rounded-full border border-app-border bg-app-background px-3 py-1.5 text-xs text-app-foreground shadow-app"
          >
            <span className="truncate">{job.status === 'failed' ? `${job.title} failed` : job.title}</span>
            <span className="h-1 flex-1 overflow-hidden rounded-full bg-app-muted/20">
              <span className="block h-full bg-app-accent" style={{ width: `${Math.round(job.progress * 100)}%` }} />
            </span>
            <span className="tabular-nums text-app-muted">{Math.round(job.progress * 100)}%</span>
          </button>
        ) : (
          <JobRow key={job.id} job={job} actions={actions} fadeAfterMs={job.kind === 'video' && job.status === 'done' ? VIDEO_FADE_MS : undefined} />
        ),
      )}
    </div>
  )
}

export function JobTray() {
  const user = useAuthStore((s) => s.user)
  const jobsByKind = useJobsStore((s) => s.jobs)
  const { cancel, retry, dismiss } = useJobsStore.getState()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [expanded, setExpanded] = useState(false)

  const editorDeckId = matchPath('/deck/:id', pathname)?.params.id ?? null
  const jobs = (['deck', 'quiz', 'video'] as const)
    .map((k) => jobsByKind[k])
    .filter((j): j is Job => j !== null)
    .filter((j) => !(j.kind === 'quiz' && editorDeckId !== null && j.deckId === editorDeckId))

  const doneVideoId = jobsByKind.video?.status === 'done' ? jobsByKind.video.id : null
  useEffect(() => {
    if (!doneVideoId) return
    const t = setTimeout(() => {
      if (useJobsStore.getState().jobs.video?.id === doneVideoId) useJobsStore.getState().dismiss('video')
    }, VIDEO_FADE_MS + 600)
    return () => clearTimeout(t)
  }, [doneVideoId])

  if (!user) return null
  const actions: JobActions = {
    cancel,
    retry,
    dismiss,
    view: (job) => {
      dismiss(job.kind)
      void navigate(viewHref(job))
    },
    editBrief: (job) => {
      dismiss(job.kind)
      if (job.editHref) void navigate(job.editHref)
    },
  }
  return <JobTrayView jobs={jobs} minimized={editorDeckId !== null} expanded={expanded} onToggle={() => setExpanded((e) => !e)} actions={actions} />
}
```

- [ ] **Step 6: Mount it**

In `src/App.tsx`, import `JobTray` and render it inside `<BrowserRouter>` right after `</Routes>`:

```tsx
      </Routes>
      <JobTray />
    </BrowserRouter>
```

- [ ] **Step 7: Run tests**

Run: `npx vitest run src/components/jobs && npx tsc -b`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/components/jobs src/App.tsx src/index.css
git commit -m "feat(jobs): bottom-right panel for background jobs"
```

---

### Task 9: Deck generation in the background (CreatePage, HomePage, editor)

**Files:**
- Modify: `src/pages/CreatePage.tsx`, `src/pages/HomePage.tsx`, `src/pages/EditorPage.tsx`

**Interfaces:**
- Consumes: `startDeckJob` (Task 6), `useJobsStore` (Task 3), `clearNew`, `clearDeck` (Task 1).

- [ ] **Step 1: CreatePage hands off and leaves**

Replace `startGeneration` (currently lines ~164–222) with:

```ts
  function startGeneration(brief: Answers) {
    const { topic: t, slideCount: count, audience: aud, detailLevel: level } = brief
    if (t === null || count === null || aud === null || level === null) {
      setPhase('failed')
      setError('Some answers are still missing. Fill in the questions above and try again.')
      return
    }
    // Saved now, not by the autosave effect: the page unmounts before that would run, and the
    // draft is what "Edit brief" comes back to if the job fails.
    saveDraft({ id: draftId, answers: brief, pendingText: '', savedAt: Date.now() })
    const started = startDeckJob({
      topic: t,
      requestedCount: count,
      draftId,
      brief: {
        slideCount: count,
        audience: aud,
        detailLevel: level,
        // The brief no longer asks for a tone; every deck is generated with the default.
        tone: DEFAULT_TONE,
        guidance: brief.guidance ?? '',
      },
    })
    if (!started) {
      setPhase('failed')
      setError('A deck is already generating. Wait for it to finish, then try again.')
      return
    }
    setPhase('done')
    void navigate('/')
  }
```

Then remove what only served the in-page generation: the `stage`, `repairSlideCount`, `abortRef` state/refs, the unmount abort effect, the `beforeunload` effect tied to `isGenerating`, `confirmLeave`/`cancelAndLeave` and its modal, the elapsed-seconds timer, `stageMessage()`, the `phase === 'generating'` JSX block, and `'generating'` from the `Phase` union (fix every reference the compiler reports). Remove now-unused imports (`generatePresentation`, `GenerationStage`, `FallbackProvider`, `PROVIDER_CHAIN`, `AIProviderError`, `createDeckFromGeneration`) only if nothing else in the file still uses them. Keep the `/new` on-mount provider-key check. Import `startDeckJob` from `@/jobs/start` and `saveDraft` from `@/lib/briefDrafts`. `deleteDraft(draftId)` is no longer called here (the job deletes it on success).

Also disable the final Generate action while a deck job runs:

```ts
  const deckRunning = useJobsStore((s) => s.jobs.deck?.status === 'running')
```

and pass `disabled={deckRunning}` with `title="A deck is already generating"` to the Generate/confirm button the `answeredAll && editing === null` block renders.

- [ ] **Step 2: HomePage refreshes and guards deletes**

In `HomePage.tsx`:

```ts
  const finishedDeckId = useJobsStore((s) => (s.jobs.deck?.status === 'done' ? s.jobs.deck.resultDeckId : null))
  useEffect(() => {
    if (finishedDeckId) void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finishedDeckId])
```

and in the delete confirm (currently `await deleteDeck(deckPendingDelete.id)`), first:

```ts
            useJobsStore.getState().abortForDeck(deckPendingDelete.id)
            clearDeck(deckPendingDelete.id)
            await deleteDeck(deckPendingDelete.id)
```

- [ ] **Step 3: Opening a deck clears its deck dot**

In `EditorPage.tsx`, beside the effect that calls `loadDeck(id)`:

```ts
  useEffect(() => {
    if (id) clearNew(id, 'deck')
  }, [id])
```

- [ ] **Step 4: Verify**

Run: `npx tsc -b && npm run lint && npx vitest run`
Expected: no type or lint errors; all tests pass.

By hand (`npm run dev`, logged in): answer a brief → lands on `/` with the panel showing the deck timeline; navigate around, the panel persists; on finish the check draws and **View Slide** opens the deck; the new card shows the dot until opened. Cancel mid-run → no deck appears; the draft remains in Drafts.

- [ ] **Step 5: Commit**

```bash
git add src/pages/CreatePage.tsx src/pages/HomePage.tsx src/pages/EditorPage.tsx
git commit -m "feat(create): generate decks in the background and return to the dashboard"
```

---

### Task 10: Quiz generation in the background (modal, top-bar strip, highlights)

**Files:**
- Create: `src/components/editor/QuizJobStrip.tsx`, `src/components/editor/QuizJobStrip.test.tsx`
- Modify: `src/components/quiz/QuizModal.tsx`, `src/components/quiz/QuizModal.test.tsx`, `src/components/editor/TopBar.tsx`, `src/components/editor/TopBar.test.tsx`, `src/components/editor/TopBarMenus.tsx`, `src/components/editor/TopBarMenus.test.tsx`, `src/pages/EditorPage.tsx`

**Interfaces:**
- Consumes: `startQuizJob` (Task 6), `useJobsStore`, `Job` (Task 3), `useNewItems`, `clearNew` (Task 1).
- Produces:
  - `QuizJobStripView({ job, onCancel, onRetry, onDismiss, onView }: { job: Job; onCancel(): void; onRetry(): void; onDismiss(): void; onView(): void })` and connected `QuizJobStrip({ deckId, onView }: { deckId: string; onView(): void })`.
  - `TopBar` new props: `quizStrip?: ReactNode`, `exportHighlight?: boolean`. `ExportMenu` new prop: `highlightQuiz?: boolean`.
  - `QuizModal` new props: `initialTab?: 'create' | 'list'`, `quizIsNew?: boolean`, `onListOpened?: () => void`, `quizRunning?: boolean`.

- [ ] **Step 1: Write the failing strip test**

```tsx
// src/components/editor/QuizJobStrip.test.tsx
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Job } from '@/jobs/jobsStore'
import { QuizJobStripView } from './QuizJobStrip'

const noop = () => {}
const job: Job = {
  id: '1', kind: 'quiz', deckId: 'd1', title: 'Deck', status: 'running', progress: 0.5, timeline: [],
  cancellable: true, error: null, resultDeckId: null, editHref: null,
}
const render = (j: Job) => renderToStaticMarkup(<QuizJobStripView job={j} onCancel={noop} onRetry={noop} onDismiss={noop} onView={noop} />)

describe('QuizJobStripView', () => {
  it('shows progress while generating', () => {
    const html = render(job)
    expect(html).toContain('Generating quiz')
    expect(html).toContain('role="progressbar"')
    expect(html).toContain('aria-label="Cancel quiz"')
  })
  it('says the quiz is ready with a View button, set to fade', () => {
    const html = render({ ...job, status: 'done', resultDeckId: 'd1' })
    expect(html).toContain('Quiz generated')
    expect(html).toContain('>View<')
    expect(html).toContain('job-fade-out')
  })
  it('offers Try again on failure', () => {
    const html = render({ ...job, status: 'failed', error: 'busy' })
    expect(html).toContain('Quiz failed')
    expect(html).toContain('Try again')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/editor/QuizJobStrip.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Write the strip**

```tsx
// src/components/editor/QuizJobStrip.tsx
import { useEffect, type CSSProperties } from 'react'
import { useJobsStore, type Job } from '@/jobs/jobsStore'

/** "Quiz generated" shows this long, the last 600 ms of it fading. */
const DONE_MS = 3000

export function QuizJobStripView({ job, onCancel, onRetry, onDismiss, onView }: { job: Job; onCancel(): void; onRetry(): void; onDismiss(): void; onView(): void }) {
  if (job.status === 'done') {
    return (
      <div className="job-fade-out flex shrink-0 items-center gap-2 text-xs text-app-foreground" style={{ '--job-fade-delay': `${DONE_MS - 600}ms` } as CSSProperties}>
        <span className="font-medium">Quiz generated</span>
        <button type="button" onClick={onView} className="rounded-app bg-app-accent px-2 py-0.5 font-medium text-white hover:opacity-90">View</button>
      </div>
    )
  }
  if (job.status === 'failed') {
    return (
      <div className="flex shrink-0 items-center gap-2 text-xs">
        <span className="font-medium text-red-600 dark:text-red-400" title={job.error ?? undefined}>Quiz failed</span>
        <button type="button" onClick={onRetry} className="text-app-accent-text hover:underline">Try again</button>
        <button type="button" aria-label="Dismiss" onClick={onDismiss} className="text-app-muted hover:text-app-foreground">×</button>
      </div>
    )
  }
  const pct = Math.round(job.progress * 100)
  return (
    <div className="flex shrink-0 items-center gap-2 text-xs text-app-muted">
      <span>Generating quiz</span>
      <div role="progressbar" aria-label="Generating quiz" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="h-1 w-24 overflow-hidden rounded-full bg-app-muted/20">
        <div className="h-full bg-app-accent transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>
      <button type="button" aria-label="Cancel quiz" disabled={!job.cancellable} onClick={onCancel} className="hover:text-app-foreground disabled:opacity-40">×</button>
    </div>
  )
}

/** The editor's quiz progress, for the deck that is open only. */
export function QuizJobStrip({ deckId, onView }: { deckId: string; onView(): void }) {
  const job = useJobsStore((s) => s.jobs.quiz)
  const doneId = job?.status === 'done' && job.deckId === deckId ? job.id : null
  useEffect(() => {
    if (!doneId) return
    const t = setTimeout(() => {
      if (useJobsStore.getState().jobs.quiz?.id === doneId) useJobsStore.getState().dismiss('quiz')
    }, DONE_MS)
    return () => clearTimeout(t)
  }, [doneId])
  if (!job || job.deckId !== deckId) return null
  const { cancel, retry, dismiss } = useJobsStore.getState()
  return (
    <QuizJobStripView
      job={job}
      onCancel={() => cancel('quiz')}
      onRetry={() => retry('quiz')}
      onDismiss={() => dismiss('quiz')}
      onView={() => {
        dismiss('quiz')
        onView()
      }}
    />
  )
}
```

Note: dismissing a done quiz job from the strip after 3 s also removes it from the corner panel; this is intended (the deck's dot and the highlights carry the news from then on).

- [ ] **Step 4: TopBar and ExportMenu**

In `TopBar.tsx` add the optional props `quizStrip?: ReactNode` and `exportHighlight?: boolean`; render `{quizStrip}` immediately after the save-status element and before the zoom group; pass `highlight={exportHighlight}` and `highlightQuiz={exportHighlight}` to `ExportMenu`.

In `TopBarMenus.tsx` `ExportMenu`, accept `highlight?: boolean` and `highlightQuiz?: boolean`. When `highlight`, add `ring-2 ring-amber-400 ring-offset-1 ring-offset-app-background` to the trigger's className. When `highlightQuiz`, add `bg-amber-400/15 font-medium` to the Generate Quiz item and append a small amber dot (`<span aria-hidden className="ml-auto size-2 rounded-full bg-amber-400" />`) inside it.

Add to `TopBar.test.tsx`:

```tsx
  it('renders the quiz strip between the save status and the zoom', () => {
    const html = render({ quizStrip: <span data-testid="strip">strip</span> })
    expect(html.indexOf('data-testid="strip"')).toBeLessThan(html.indexOf('aria-label="Zoom'))
  })

  it('rings the Export trigger when a quiz is new', () => {
    expect(render({ exportHighlight: true })).toContain('ring-amber-400')
    expect(render()).not.toContain('ring-amber-400')
  })
```

(Use the zoom control's real `aria-label` from `TopBar.tsx`; adjust the `indexOf` needle to it.) Add to `TopBarMenus.test.tsx`, rendering `ExportMenu` with `defaultOpen` as the existing tests do:

```tsx
  it('highlights Generate Quiz when a quiz is new', () => {
    const html = renderExport({ highlightQuiz: true })
    expect(html).toMatch(/bg-amber-400\/15[^"]*"[^>]*>[^<]*Generate Quiz|Generate Quiz[\s\S]*bg-amber-400/)
  })
```

(Use the file's own render helper name in place of `renderExport`.)

- [ ] **Step 5: QuizModal starts the job and closes**

In `QuizModal.tsx`:
- Accept the new props with defaults `initialTab = 'create'`, `quizIsNew = false`, `quizRunning = false`; initialise `useState<Tab>(initialTab)`.
- Add `useEffect(() => { if (tab === 'list') onListOpened?.() }, [tab, onListOpened])`.
- In the tab button for `list`, when `quizIsNew`, render `<span aria-label="New quiz" className="ml-1.5 inline-block size-2 rounded-full bg-amber-400 align-middle" />` after the label.
- Replace `generate()` with:

```ts
  function generate() {
    dispatch({ kind: 'commitAll' })
    if (startQuizJob({ presentationId, title, cards, requests: toSectionRequests(drafts) })) onClose()
  }
```

  `dispatch` applies on the next render, so compute requests from the committed form: if `toSectionRequests(drafts)` depends on uncommitted text, derive the committed drafts first with `sectionsReducer(drafts, { kind: 'commitAll' })` and pass `toSectionRequests(committed)`.
- Delete what only served the in-modal run: `written`, `progress`, `phase` values `'generating' | 'saving' | 'done'` (drop `Phase` entirely if only `'form'` remains), `error`, `pending`, `Pending`, `result`, `Result`, `abortRef` and its unmount effect, `save()`, `makeAnother()`, the result view (`QuizPreview` of the just-made quiz and its PDF button, `pdfBusy === 'result'` path), the generating/saving progress UI, and the `edit()` wrapper's `setWritten`/`setError` lines (keep `dispatch`). Keep the list tab, `QuizPreviewModal`, the list's PDF download and its notices.
- Generate button: `disabled` additionally when `quizRunning`, with title/hint "A quiz is already generating".

Update `QuizModal.test.tsx`: remove assertions about the deleted generating/result states if any, and add:

```tsx
  it('opens on the list tab when asked, with the new dot', () => {
    const html = render({ initialTab: 'list', quizIsNew: true })
    expect(html).toMatch(/id="quiz-tab-list"[^>]*aria-selected="true"/)
    expect(html).toContain('aria-label="New quiz"')
  })

  it('disables Generate while a quiz is generating', () => {
    expect(render({ quizRunning: true })).toContain('A quiz is already generating')
  })
```

(Use the file's own render helper and attribute order; check by printing the html once if the regex misses.)

- [ ] **Step 6: EditorPage wiring**

In `EditorPage.tsx`:

```ts
  const [searchParams, setSearchParams] = useSearchParams()
  const [quizTab, setQuizTab] = useState<'create' | 'list'>('create')
  const newKinds = useNewItems(id ?? '')
  const quizRunning = useJobsStore((s) => s.jobs.quiz?.status === 'running')

  useEffect(() => {
    if (searchParams.get('quiz') !== 'list') return
    setQuizTab('list')
    setQuizOpen(true)
    const next = new URLSearchParams(searchParams)
    next.delete('quiz')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  const openQuizList = useCallback(() => {
    setQuizTab('list')
    setQuizOpen(true)
  }, [])
```

- The existing `onQuiz={() => setQuizOpen(true)}` becomes `onQuiz={() => { setQuizTab('create'); setQuizOpen(true) }}`.
- Pass to `TopBar`: `quizStrip={id ? <QuizJobStrip deckId={id} onView={openQuizList} /> : null}` and `exportHighlight={newKinds.includes('quiz')}`.
- Pass to `QuizModal`: `initialTab={quizTab}`, `quizIsNew={newKinds.includes('quiz')}`, `quizRunning={quizRunning}`, `onListOpened={onQuizListOpened}` where `const onQuizListOpened = useCallback(() => { if (id) clearNew(id, 'quiz') }, [id])`.

- [ ] **Step 7: Verify**

Run: `npx tsc -b && npm run lint && npx vitest run`
Expected: all pass.

By hand: in a deck, Export → Generate Quiz → Generate. The modal closes; the strip shows progress; on finish "Quiz generated · View" for 3 s then fades; the Export icon rings, Generate Quiz is highlighted, the "Quizzes from this deck" tab has the dot; opening that tab clears all three and the card's quiz dot. Leave the editor mid-run: the quiz shows in the corner panel; **View Quiz** reopens the deck on the list tab.

- [ ] **Step 8: Commit**

```bash
git add src/components/editor/QuizJobStrip.tsx src/components/editor/QuizJobStrip.test.tsx src/components/quiz src/components/editor/TopBar.tsx src/components/editor/TopBar.test.tsx src/components/editor/TopBarMenus.tsx src/components/editor/TopBarMenus.test.tsx src/pages/EditorPage.tsx
git commit -m "feat(quiz): generate quizzes in the background with a top-bar strip"
```

---

### Task 11: Video generation in the background

**Files:**
- Modify: `src/components/voice/CloneVoiceModal.tsx`, `src/components/voice/CloneVoiceModal.test.tsx`, `src/components/editor/NarrationTab.tsx`, `src/pages/EditorPage.tsx`

**Interfaces:**
- Consumes: `startVideoJob` (Task 6), `useJobsStore` (Task 3), `clearNew` (Task 1).
- Produces: `CloneVoiceModal` new prop `onVideoStarted?: () => void`; `NarrationTab` new props `openVoice?: boolean`, `onVoiceOpened?: () => void`, `onVideoStarted?: () => void`.

- [ ] **Step 1: The modal starts the job**

In `CloneVoiceModal.tsx` replace `generate()` with:

```ts
  async function generate() {
    if (!canGenerate) return
    setVideoError(null)
    // The video needs the voice, so the voice is saved first; if that fails, its own error shows.
    if (!(await useVoiceStore.getState().save(draft))) return
    if (!mountedRef.current) return
    const { presentationId } = deck
    if (!presentationId) return
    const started = startVideoJob({ deck: { ...deck, presentationId }, voice: draft, previous: existing?.record ?? null })
    if (!started) {
      setVideoError('A video is already generating. Wait for it to finish, then try again.')
      return
    }
    onClose()
    onVideoStarted?.()
  }
```

- Replace the local `generating` state with `const generating = useJobsStore((s) => s.jobs.video?.status === 'running')` (it still feeds `canStartGenerate`, so Generate is disabled while any video runs).
- Delete `progress`, `genAbortRef` (and its cleanup in the unmount effect, keeping the microphone/preview/request cleanups), the progress `<ol>` built from `stageRows`, and the Cancel video button (cancel lives in the panel). Drop the now-unused `stageRows`, `canCancelVideo`, `VideoError` and `Progress` imports if nothing else uses them.
- Clear the video dot once a saved video is shown:

```ts
  useEffect(() => {
    if (existing && deck.presentationId) clearNew(deck.presentationId, 'video')
  }, [existing, deck.presentationId])
```

Update `CloneVoiceModal.test.tsx`: remove any assertion on the in-modal progress list or Cancel video button; keep the rest.

- [ ] **Step 2: NarrationTab opens on request and forwards the start**

In `NarrationTab.tsx`, add the props and:

```ts
  useEffect(() => {
    if (!openVoice) return
    setVoiceOpen(true)
    onVoiceOpened?.()
  }, [openVoice, onVoiceOpened])
```

and pass `onVideoStarted={onVideoStarted}` to `CloneVoiceModal`.

- [ ] **Step 3: EditorPage handles `?video=1` and sends the user home**

```ts
  const [voiceRequested, setVoiceRequested] = useState(false)

  useEffect(() => {
    if (searchParams.get('video') !== '1') return
    setPanelTab('narration')
    setVoiceRequested(true)
    const next = new URLSearchParams(searchParams)
    next.delete('video')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  const onVoiceOpened = useCallback(() => setVoiceRequested(false), [])
  const onVideoStarted = useCallback(() => void navigate('/'), [navigate])
```

Pass `openVoice={voiceRequested}`, `onVoiceOpened={onVoiceOpened}`, `onVideoStarted={onVideoStarted}` to `<NarrationTab …>`. If the right panel is collapsed, also expand it there (use the page's existing collapse state setter).

- [ ] **Step 4: Verify**

Run: `npx tsc -b && npm run lint && npx vitest run && npm run build`
Expected: all pass. In the build's chunk list, `mediabunny` and `html-to-image` appear only in lazy chunks, not in the `index-*.js` entry.

By hand: Narrate tab → Clone voice → Generate Presentation. The modal closes and you land on `/` with the video timeline in the panel; open a deck: the panel is a pill bar, expand by click; switching to another browser tab during "Drawing slides" pauses it and the row says to keep the tab open; on finish **View Video** appears, fades after ~6 s; the card shows the video dot; **View Video** (or opening the voice modal) shows the player and clears the dot.

- [ ] **Step 5: Commit**

```bash
git add src/components/voice src/components/editor/NarrationTab.tsx src/pages/EditorPage.tsx
git commit -m "feat(video): generate narrated videos in the background"
```

---

### Task 12: Documentation and final check

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update CLAUDE.md**

Add a section after "Narrated video", titled `## Background jobs (src/jobs/, components/jobs/)`, covering in the file's terse style:
- One job per kind (`deck`/`quiz`/`video`) in `jobsStore`, started from `start.ts`; specs in `deckJob`/`quizJob`/`videoJob` take injected deps (tested against fakes). Every run write goes through the run-id check, so cancel/replace/reset never lets a result land; sign-out resets.
- `insertGeneratedDeck` is the write-only deck insert; **a background job must never call `createDeckFromGeneration`** (it replaces the open deck).
- Non-cancellable points: deck insert, `create_quiz`, video upload (`cancellable: false`).
- `newItems.ts`: `lekturac:new-items:<uid>`, no un-namespaced fallback; cleared per kind when the deck, quiz list or video is opened.
- `JobTray` is mounted beside `<Routes>`; pills on `/deck/:id`; the open deck's quiz shows in `QuizJobStrip` instead. View targets `?quiz=list` and `?video=1` are read once by `EditorPage` and removed.
- `src/jobs/*` reaches `@/video/generate` only through `import()`.
- Jobs live in the tab: reload ends them (`beforeunload` warns); video drawing still needs a visible tab.

Also update the stale lines elsewhere: the Creation flow step 2 (the `AbortController` now lives in the job, leaving `/new` no longer cancels; the leave-mid-generation prompt is gone), the Quizzes section's "both tabs stay mounted, so a tab switch never cancels" and in-modal result view, and the Voice section's "Generate Presentation … makes the video" (now starts a background job and goes to the dashboard). In the Testing section's component-test list, add `JobTray.test.tsx`, `NewDot.test.tsx` and `QuizJobStrip.test.tsx`.

- [ ] **Step 2: Full verification**

Run: `npm run build && npm run lint && npm run test`
Expected: all succeed.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude-md): background jobs"
```
