import { describe, expect, it, vi } from 'vitest'
import type { Card } from '@/engine/contentBlocks'
import { AIProviderError } from '@/ai/provider'
import { narrationJobSpec, type NarrationJobDeps } from './narrationJob'

vi.mock('@/store/presentationStore', () => ({ describeError: (e: unknown) => (e instanceof Error ? e.message : String(e)) }))

const card = (id: string, orderIndex: number): Card =>
  ({ id, orderIndex, blocks: [{ type: 'heading', text: `Heading ${id}` }], layout: 'auto', visualStyle: 'structured' }) as Card

const DECK = [card('a', 0), card('b', 1), card('c', 2)]

function setup(over: Partial<NarrationJobDeps> = {}, targetIds = ['b', 'c']) {
  const deps: NarrationJobDeps = {
    cards: vi.fn(async () => DECK),
    write: vi.fn(async () => ({ scripts: [{ slide: 2, text: 'Two' }] })),
    apply: vi.fn(async () => {}),
    ...over,
  }
  const spec = narrationJobSpec({ presentationId: 'd1', title: 'Deck', targetIds }, deps)
  const ctx = (signal = new AbortController().signal) => ({ signal, report: vi.fn() })
  return { spec, deps, ctx }
}

describe('narrationJobSpec', () => {
  it('writes once for the chosen slides, sending the rest as context, then applies to those slides only', async () => {
    const { spec, deps, ctx } = setup()
    await expect(spec.run(ctx())).resolves.toEqual({ deckId: 'd1' })
    const slides = vi.mocked(deps.write).mock.calls[0][1]
    expect(slides.map((s) => [s.slide, s.write])).toEqual([
      [1, false],
      [2, true],
      [3, true],
    ])
    expect(deps.apply).toHaveBeenCalledWith('d1', [{ slide: 2, text: 'Two' }], new Set([1, 2]))
  })

  // The targets are slide ids, so a slide that moved before the job started is still the one written.
  it('finds the chosen slides by id in the deck as it is when the run starts', async () => {
    const moved = [card('c', 0), card('a', 1), card('b', 2)]
    const { spec, deps, ctx } = setup({ cards: vi.fn(async () => moved) }, ['b'])
    await spec.run(ctx())
    expect(vi.mocked(deps.apply).mock.calls[0][2]).toEqual(new Set([2]))
  })

  // Positions are what the model answered about: if slides changed meanwhile, position N is another slide.
  it('applies nothing, and says why, when the slides changed while the scripts were written', async () => {
    let read = 0
    const { spec, deps, ctx } = setup({
      cards: vi.fn(async () => (read++ === 0 ? DECK : [DECK[0], DECK[2], DECK[1]])),
    })
    const err = await spec.run(ctx()).catch((e: unknown) => e)
    expect(deps.apply).not.toHaveBeenCalled()
    expect(spec.describe(err)).toBe('The slides changed while the scripts were being written, so nothing was applied. Try again.')
  })

  it('Try again starts over from the deck as it is then', async () => {
    let read = 0
    const reads = [DECK, [DECK[2], DECK[0], DECK[1]], [DECK[2], DECK[0], DECK[1]], [DECK[2], DECK[0], DECK[1]]]
    const { spec, deps, ctx } = setup({ cards: vi.fn(async () => reads[read++]) }, ['b'])
    await expect(spec.run(ctx())).rejects.toThrow()
    await expect(spec.run(ctx())).resolves.toEqual({ deckId: 'd1' })
    expect(vi.mocked(deps.apply).mock.calls[0][2]).toEqual(new Set([2]))
  })

  it('fails without asking the model when every chosen slide has been deleted', async () => {
    const { spec, deps, ctx } = setup({}, ['gone'])
    const err = await spec.run(ctx()).catch((e: unknown) => e)
    expect(deps.write).not.toHaveBeenCalled()
    expect(spec.describe(err)).toBe('The slides you chose were deleted, so there was nothing to write.')
  })

  it('applies nothing once cancelled', async () => {
    const controller = new AbortController()
    const { spec, deps, ctx } = setup({
      write: vi.fn(async () => {
        controller.abort()
        return { scripts: [] }
      }),
    })
    await expect(spec.run(ctx(controller.signal))).rejects.toThrow()
    expect(deps.apply).not.toHaveBeenCalled()
  })

  it('cannot be cancelled once it starts saving', async () => {
    const { spec, deps, ctx } = setup()
    const c = ctx()
    vi.mocked(deps.apply).mockImplementation(async () => {
      expect(c.report).toHaveBeenLastCalledWith(expect.objectContaining({ cancellable: false }))
    })
    await spec.run(c)
    expect(deps.apply).toHaveBeenCalled()
  })

  it('says the model is busy on a capacity failure', async () => {
    const { spec, ctx } = setup({ write: vi.fn(async () => Promise.reject(new AIProviderError('429', { kind: 'capacity' }))) })
    const err = await spec.run(ctx()).catch((e: unknown) => e)
    expect(spec.describe(err)).toBe('The AI is busy. Try again in a minute.')
  })
})
