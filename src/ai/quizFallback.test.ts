import { describe, expect, it, vi } from 'vitest'
import { generateQuizWithFallback, type NamedQuizProvider } from './fallbackProvider'
import { AIProviderError, type QuizProvider } from './provider'
import type { QuizResponse } from '@/quiz/schema'
import type { QuizRequest } from '@/quiz/types'

const REQUEST: QuizRequest = {
  title: 'Deck',
  slides: [{ slide: 1, heading: 'Intro', lines: ['A point'] }],
  count: 2,
  config: { type: 'true_false', notation: 'word' },
}
const RESPONSE: QuizResponse = { questions: [{ slide: 1, prompt: 'Statement', answer: true }] }

function stub(behavior: () => Promise<QuizResponse>): QuizProvider & { calls: () => number } {
  let calls = 0
  return {
    calls: () => calls,
    generateQuiz: async () => {
      calls++
      return behavior()
    },
  }
}

function chainOf(...providers: QuizProvider[]): NamedQuizProvider[] {
  return providers.map((provider, i) => ({ name: `P${i}`, provider }))
}

describe('generateQuizWithFallback', () => {
  it('returns the first provider’s quiz without touching the second', async () => {
    const a = stub(async () => RESPONSE)
    const b = stub(async () => RESPONSE)
    await expect(generateQuizWithFallback(chainOf(a, b), REQUEST)).resolves.toEqual(RESPONSE)
    expect(b.calls()).toBe(0)
  })

  it('falls over when the first is out of capacity', async () => {
    const a = stub(async () => {
      throw new AIProviderError('busy', { kind: 'capacity', status: 429 })
    })
    const b = stub(async () => RESPONSE)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(generateQuizWithFallback(chainOf(a, b), REQUEST)).resolves.toEqual(RESPONSE)
    expect(b.calls()).toBe(1)
  })

  /* Load-bearing: a mistyped key must surface, not be hidden by the backup. */
  it('does not fall over on an auth failure', async () => {
    const a = stub(async () => {
      throw new AIProviderError('bad key', { kind: 'auth', status: 401 })
    })
    const b = stub(async () => RESPONSE)
    await expect(generateQuizWithFallback(chainOf(a, b), REQUEST)).rejects.toThrow('bad key')
    expect(b.calls()).toBe(0)
  })

  it.each(['request', 'response', 'unknown'] as const)('does not fall over on a %s failure', async (kind) => {
    const a = stub(async () => {
      throw new AIProviderError('nope', { kind })
    })
    const b = stub(async () => RESPONSE)
    await expect(generateQuizWithFallback(chainOf(a, b), REQUEST)).rejects.toThrow('nope')
    expect(b.calls()).toBe(0)
  })

  it('never hands off after the user cancelled', async () => {
    const controller = new AbortController()
    const a = stub(async () => {
      controller.abort()
      throw new AIProviderError('busy', { kind: 'capacity', status: 429 })
    })
    const b = stub(async () => RESPONSE)
    await expect(generateQuizWithFallback(chainOf(a, b), REQUEST, controller.signal)).rejects.toThrow('busy')
    expect(b.calls()).toBe(0)
  })

  it('never hands off on a bare AbortError', async () => {
    const a = stub(async () => {
      throw new DOMException('Aborted', 'AbortError')
    })
    const b = stub(async () => RESPONSE)
    await expect(generateQuizWithFallback(chainOf(a, b), REQUEST)).rejects.toThrow('Aborted')
    expect(b.calls()).toBe(0)
  })

  it('rethrows the last provider’s capacity failure', async () => {
    const busy = () =>
      stub(async () => {
        throw new AIProviderError('busy', { kind: 'capacity', status: 429 })
      })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(generateQuizWithFallback(chainOf(busy(), busy()), REQUEST)).rejects.toThrow('busy')
  })

  it('reports a missing key when the chain is empty', async () => {
    await expect(generateQuizWithFallback([], REQUEST)).rejects.toMatchObject({ kind: 'auth' })
  })
})
