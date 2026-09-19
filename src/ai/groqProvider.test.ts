import { afterEach, describe, expect, it, vi } from 'vitest'
import { GroqProvider } from './groqProvider'
import type { DeckContext, GenerationBrief } from './provider'
import type { GeneratedDeck } from '@/generation/schemas'

/*
  Item 1 of the final-fix brief: research and repair pass `maxRetries: 0` to
  the shared retry loop, so a 429/503 throws immediately instead of waiting
  out `ai/retry.ts`'s full exponential backoff — a best-effort step that the
  pipeline already degrades gracefully around (see `generation/pipeline.ts`)
  should not spend the user's wait on retries it's allowed to just skip.
  These tests mock `fetch` directly rather than going through
  `FallbackProvider`, since the behaviour under test — how many times ONE
  provider's own retry loop calls `fetch` — is invisible above that layer.
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

/** A minimal fetch Response stand-in for a 429 the retry loop can act on. */
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

describe('GroqProvider retry budget', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('research() throws after exactly one fetch call on a 429 (maxRetries: 0)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(rateLimited())
    vi.stubGlobal('fetch', fetchMock)
    const provider = new GroqProvider('key')

    await expect(provider.research('EVs', BRIEF, '2026-09-19')).rejects.toThrow(/rate limited/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("research() requests max_tokens: 4000, not the old 2000", async () => {
    const fetchMock = vi.fn().mockResolvedValue(rateLimited())
    vi.stubGlobal('fetch', fetchMock)
    const provider = new GroqProvider('key')

    await expect(provider.research('EVs', BRIEF, '2026-09-19')).rejects.toThrow()
    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)
    expect(body.max_tokens).toBe(4000)
  })

  it('repairSlides() throws after exactly one fetch call on a 429 (maxRetries: 0)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(rateLimited())
    vi.stubGlobal('fetch', fetchMock)
    const provider = new GroqProvider('key')

    await expect(provider.repairSlides(MINIMAL_DECK, [0], [], CONTEXT)).rejects.toThrow(/rate limited/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('generateDeck() still retries the full policy (4 attempts) on repeated 429s', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn().mockResolvedValue(rateLimited())
    vi.stubGlobal('fetch', fetchMock)
    const provider = new GroqProvider('key')

    const pending = provider.generateDeck('EVs', BRIEF, undefined, CONTEXT)
    const assertion = expect(pending).rejects.toThrow(/rate limited/)
    // 1s + 2s + 4s of backoff between the 4 attempts (MAX_RETRIES = 3); a
    // generous flush covers it without needing to interleave each step.
    await vi.advanceTimersByTimeAsync(30_000)
    await assertion
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })
})
