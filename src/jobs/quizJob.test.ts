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
