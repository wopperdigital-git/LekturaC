import { describe, expect, it, vi } from 'vitest'
import type { PipelineResult } from '@/generation/pipeline'
import type { GenerationBrief } from '@/ai/provider'
import { AIProviderError } from '@/ai/provider'
import { deckJobSpec, type DeckJobDeps } from './deckJob'
import type { JobReport } from './jobsStore'

const brief = { slideCount: 5, audience: 'students', detailLevel: 'balanced', tone: 'professional', guidance: '' } as unknown as GenerationBrief
const result = { deck: { title: 'T', cards: [] } } as unknown as PipelineResult

const photographed = { title: 'T', cards: [{ photo: true }] } as unknown as PipelineResult['deck']

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
    addPhotos: vi.fn(async () => photographed),
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
    expect(deps.addPhotos).toHaveBeenCalledWith(result.deck, ctx.signal)
    expect(deps.insert).toHaveBeenCalledWith(photographed, 5, result)
    expect(deps.deleteDraft).toHaveBeenCalledWith('draft-1')
    const labels = reports.at(-1)!.timeline!.map((e) => e.label)
    expect(labels).toContain('Tightening 2 slides')
    expect(labels).toContain('Finding photos')
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

  it('shows Finding photos as the active row, still cancellable, while photos are found', async () => {
    let seen: JobReport | undefined
    const { spec, ctx, reports } = setup({
      addPhotos: vi.fn(async () => {
        seen = reports.at(-1)
        return photographed
      }),
    })
    await spec.run(ctx)
    expect(seen!.timeline!.find((e) => e.state === 'active')!.label).toBe('Finding photos')
    expect(seen!.cancellable).not.toBe(false)
  })

  it('creates no deck when cancelled while photos are pending', async () => {
    let finish!: (d: PipelineResult['deck']) => void
    const { spec, deps, ctx, controller } = setup({
      addPhotos: vi.fn(() => new Promise<PipelineResult['deck']>((r) => (finish = r))),
    })
    const run = spec.run(ctx)
    await vi.waitFor(() => expect(deps.addPhotos).toHaveBeenCalled())
    controller.abort()
    finish(photographed)
    await expect(run).rejects.toThrow()
    expect(deps.insert).not.toHaveBeenCalled()
    expect(deps.deleteDraft).not.toHaveBeenCalled()
  })

  it('settles cancelled and inserts nothing when addPhotos rejects with an AbortError', async () => {
    const { spec, deps, ctx } = setup({
      addPhotos: vi.fn(async () => {
        throw new DOMException('Aborted', 'AbortError')
      }),
    })
    await expect(spec.run(ctx)).rejects.toThrow()
    expect(deps.insert).not.toHaveBeenCalled()
  })

  it('inserts the un-photographed deck when addPhotos fails for any other reason', async () => {
    const boom = new Error('boom')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const { spec, deps, ctx } = setup({ addPhotos: vi.fn(async () => { throw boom }) })
      await expect(spec.run(ctx)).resolves.toEqual({ deckId: 'deck-1' })
      expect(deps.insert).toHaveBeenCalledWith(result.deck, 5, result)
      expect(warn).toHaveBeenCalledWith(expect.any(String), boom)
    } finally {
      warn.mockRestore()
    }
  })

  it('keeps the draft when generation fails, with the provider message', async () => {
    const err = new AIProviderError('Groq is busy', { kind: 'capacity', status: 429 })
    const { spec, deps, ctx } = setup({ generate: vi.fn(async () => { throw err }) })
    await expect(spec.run(ctx)).rejects.toBe(err)
    expect(deps.deleteDraft).not.toHaveBeenCalled()
    expect(spec.describe(err)).toBe('Groq is busy')
    expect(spec.describe(new Error('x'))).toBe('Generation failed. Try again.')
  })
})
