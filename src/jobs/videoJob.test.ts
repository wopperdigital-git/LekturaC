import { afterEach, describe, expect, it, vi } from 'vitest'
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

afterEach(() => vi.restoreAllMocks())

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

  it('uses a VideoError message as is, and a generic one otherwise', async () => {
    const { spec, promise } = run(async () => ({ status: 'cancelled' }))
    await promise.catch(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(spec.describe(new VideoError('narrating', 'Narrating slide 3 failed: quota'))).toBe('Narrating slide 3 failed: quota')
    expect(spec.describe(new Error('boom'))).toBe('Something went wrong. Try again.')
  })
})
