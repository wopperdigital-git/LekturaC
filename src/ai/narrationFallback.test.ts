import { describe, expect, it, vi } from 'vitest'
import { FallbackProvider } from './fallbackProvider'
import { AIProviderError, type AIProvider, type NarrationResponse, type NarrationSlide } from './provider'

const SLIDES: NarrationSlide[] = [{ slide: 1, heading: 'Intro', lines: ['A point'], write: true }]
const RESPONSE: NarrationResponse = { scripts: [{ slide: 1, text: 'Spoken words.' }] }

function stub(behavior: () => Promise<NarrationResponse>): AIProvider & { calls: () => number } {
  let calls = 0
  return {
    calls: () => calls,
    generateDeck: vi.fn(),
    research: vi.fn(),
    repairSlides: vi.fn(),
    generateNarration: async () => {
      calls++
      return behavior()
    },
  } as AIProvider & { calls: () => number }
}

describe('FallbackProvider.generateNarration', () => {
  it('returns the first provider’s narration without touching the second', async () => {
    const a = stub(async () => RESPONSE)
    const b = stub(async () => RESPONSE)
    const chain = new FallbackProvider([
      { name: 'A', provider: a },
      { name: 'B', provider: b },
    ])

    await expect(chain.generateNarration('Deck', SLIDES)).resolves.toEqual(RESPONSE)
    expect(b.calls()).toBe(0)
  })

  it('falls over to the second provider when the first is out of capacity', async () => {
    const a = stub(async () => {
      throw new AIProviderError('busy', { kind: 'capacity', status: 429 })
    })
    const b = stub(async () => RESPONSE)
    const chain = new FallbackProvider([
      { name: 'A', provider: a },
      { name: 'B', provider: b },
    ])

    await expect(chain.generateNarration('Deck', SLIDES)).resolves.toEqual(RESPONSE)
    expect(b.calls()).toBe(1)
  })

  /*
    The load-bearing rule, same as the deck path: a bad key must surface rather
    than quietly serving every script from the backup.
  */
  it('does not fall over on an auth failure', async () => {
    const a = stub(async () => {
      throw new AIProviderError('bad key', { kind: 'auth', status: 401 })
    })
    const b = stub(async () => RESPONSE)
    const chain = new FallbackProvider([
      { name: 'A', provider: a },
      { name: 'B', provider: b },
    ])

    await expect(chain.generateNarration('Deck', SLIDES)).rejects.toThrow('bad key')
    expect(b.calls()).toBe(0)
  })

  it('does not fall over on an unparseable response', async () => {
    const a = stub(async () => {
      throw new AIProviderError('garbage', { kind: 'response' })
    })
    const b = stub(async () => RESPONSE)
    const chain = new FallbackProvider([
      { name: 'A', provider: a },
      { name: 'B', provider: b },
    ])

    await expect(chain.generateNarration('Deck', SLIDES)).rejects.toThrow('garbage')
    expect(b.calls()).toBe(0)
  })

  /*
    Cancelling must not start a second request — otherwise the scripts the user
    walked away from still land, which is what the AbortSignal exists to stop.
  */
  it('does not fall over when the user cancelled', async () => {
    const controller = new AbortController()
    const a = stub(async () => {
      controller.abort()
      throw new AIProviderError('busy', { kind: 'capacity', status: 429 })
    })
    const b = stub(async () => RESPONSE)
    const chain = new FallbackProvider([
      { name: 'A', provider: a },
      { name: 'B', provider: b },
    ])

    await expect(chain.generateNarration('Deck', SLIDES, controller.signal)).rejects.toThrow('busy')
    expect(b.calls()).toBe(0)
  })
})
