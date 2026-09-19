import { afterEach, describe, expect, it, vi } from 'vitest'
import { GeminiProvider } from './geminiProvider'
import type { DeckContext, GenerationBrief } from './provider'
import type { GeneratedDeck } from '@/generation/schemas'

/*
  Same rules as groqProvider.test.ts (item 1 and item 2 of the final-fix
  brief): research/repair pass maxRetries: 0, and generateDeck uses Gemini's
  own token ceiling rather than Groq's.
*/

const BRIEF: GenerationBrief = {
  slideCount: 5,
  audience: 'engineers',
  detailLevel: 'balanced',
  tone: 'professional',
  guidance: '',
}

const CONTEXT: DeckContext = { evidence: null, today: '2026-09-19' }

const MINIMAL_DECK: GeneratedDeck = {
  title: 'Test deck',
  blueprint: 'inform',
  brief: {
    objective: 'Explain something',
    audienceKnowledgeLevel: 'beginner',
    presentationType: 'informational',
    freshnessRequired: false,
    keyQuestions: [],
  },
  cards: [
    {
      plan: {
        purpose: 'hook',
        audienceQuestion: 'Why does this matter?',
        keyMessage: 'A message worth telling.',
        visualType: 'text',
        layoutFamily: 'hero',
        transition: '',
        importance: 'essential',
      },
      blocks: [{ type: 'heading', text: 'A slide' }],
      visualStyle: 'structured',
      speakerNotes: 'Notes.',
      claims: [],
    },
  ],
}

function rateLimited(): Response {
  return {
    ok: false,
    status: 429,
    statusText: 'Too Many Requests',
    headers: { get: () => null },
    json: async () => ({ error: { message: 'rate limited' } }),
    text: async () => '',
  } as unknown as Response
}

describe('GeminiProvider retry budget and token ceiling', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('research() throws after exactly one fetch call on a 429 (maxRetries: 0)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(rateLimited())
    vi.stubGlobal('fetch', fetchMock)
    const provider = new GeminiProvider('key')

    await expect(provider.research('EVs', BRIEF, '2026-09-19')).rejects.toThrow(/rate limited/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('research() requests maxOutputTokens: 4000, not the old 2000', async () => {
    const fetchMock = vi.fn().mockResolvedValue(rateLimited())
    vi.stubGlobal('fetch', fetchMock)
    const provider = new GeminiProvider('key')

    await expect(provider.research('EVs', BRIEF, '2026-09-19')).rejects.toThrow()
    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)
    expect(body.generationConfig.maxOutputTokens).toBe(4000)
  })

  it('repairSlides() throws after exactly one fetch call on a 429 (maxRetries: 0)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(rateLimited())
    vi.stubGlobal('fetch', fetchMock)
    const provider = new GeminiProvider('key')

    await expect(provider.repairSlides(MINIMAL_DECK, [0], [], CONTEXT)).rejects.toThrow(/rate limited/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("generateDeck() uses geminiDeckMaxTokens, not Groq's deckMaxTokens", async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn().mockResolvedValue(rateLimited())
    vi.stubGlobal('fetch', fetchMock)
    const provider = new GeminiProvider('key')

    // slideCount: 5 -> deckMaxTokens would send 5200; geminiDeckMaxTokens sends 6500.
    // generateDeck keeps the full retry policy (no maxRetries override), so
    // this drives the fake clock through it rather than waiting for real time.
    const pending = provider.generateDeck('EVs', BRIEF, undefined, CONTEXT)
    const assertion = expect(pending).rejects.toThrow()
    await vi.advanceTimersByTimeAsync(30_000)
    await assertion
    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)
    expect(body.generationConfig.maxOutputTokens).toBe(6500)
    vi.useRealTimers()
  })
})
