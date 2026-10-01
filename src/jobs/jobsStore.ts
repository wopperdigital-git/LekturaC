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
  /** Where "Edit brief" goes for a failed deck job; null otherwise. */
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
