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
