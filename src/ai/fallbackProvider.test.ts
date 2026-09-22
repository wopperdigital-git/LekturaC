import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FallbackProvider } from './fallbackProvider'
import { AIProviderError, type AIProvider, type GeneratedDeck, type GenerationBrief } from './provider'

const BRIEF: GenerationBrief = {
  slideCount: 5,
  audience: 'engineers',
  detailLevel: 'balanced',
  tone: 'professional',
  guidance: '',
}

function deck(title: string): GeneratedDeck {
  return {
    title,
    blueprint: 'inform',
    brief: {
      objective: 'Explain the topic',
      audienceKnowledgeLevel: 'beginner',
      presentationType: 'educational',
      freshnessRequired: false,
      keyQuestions: [],
    },
    cards: [
      {
        plan: {
          purpose: 'hook',
          audienceQuestion: 'Why does this matter?',
          keyMessage: title,
          visualType: 'text',
          layoutFamily: 'hero',
          transition: '',
          importance: 'essential',
        },
        blocks: [{ type: 'heading', text: title }],
        visualStyle: 'structured',
        speakerNotes: 'A note for the speaker.',
        claims: [],
        role: 'title-roadmap',
      },
    ],
  }
}

/** Records how many times it was asked, so we can assert a provider was skipped. */
function stub(behaviour: () => Promise<GeneratedDeck>): AIProvider & { calls: number } {
  const it_ = {
    calls: 0,
    async generateDeck() {
      it_.calls++
      return behaviour()
    },
    research: vi.fn(),
    repairSlides: vi.fn(),
    generateNarration: vi.fn(),
  }
  return it_
}

const succeeds = (title: string) => stub(() => Promise.resolve(deck(title)))
const failsWith = (err: unknown) => stub(() => Promise.reject(err))

const capacity = () => new AIProviderError('rate limited', { kind: 'capacity', status: 429 })
const tooLarge = () => new AIProviderError('payload too large', { kind: 'capacity', status: 413 })
const auth = () => new AIProviderError('bad key', { kind: 'auth', status: 401 })

describe('FallbackProvider', () => {
  beforeEach(() => {
    // the fallback logs a breadcrumb on every hand-off; keep test output clean
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('rejects an empty chain rather than failing at generate time', () => {
    expect(() => new FallbackProvider([])).toThrow(/at least one/i)
  })

  it('never consults the backup when the primary succeeds', async () => {
    const primary = succeeds('from primary')
    const backup = succeeds('from backup')
    const result = await new FallbackProvider([
      { name: 'Primary', provider: primary },
      { name: 'Backup', provider: backup },
    ]).generateDeck('topic', BRIEF)

    expect(result.title).toBe('from primary')
    expect(backup.calls).toBe(0)
  })

  it('falls through to the backup when the primary is out of capacity', async () => {
    const primary = failsWith(capacity())
    const backup = succeeds('from backup')
    const result = await new FallbackProvider([
      { name: 'Primary', provider: primary },
      { name: 'Backup', provider: backup },
    ]).generateDeck('topic', BRIEF)

    expect(result.title).toBe('from backup')
    expect(backup.calls).toBe(1)
  })

  // A too-large request on Groq's window is exactly what a backup provider
  // with a different (or no) size limit can plausibly serve.
  it('falls through to the backup on a 413 (payload too large)', async () => {
    const primary = failsWith(tooLarge())
    const backup = succeeds('from backup')
    const result = await new FallbackProvider([
      { name: 'Primary', provider: primary },
      { name: 'Backup', provider: backup },
    ]).generateDeck('topic', BRIEF)

    expect(result.title).toBe('from backup')
    expect(backup.calls).toBe(1)
  })

  // The important negative case: silently succeeding on the backup would hide a
  // misconfigured key forever.
  it('does not fall through on an auth failure', async () => {
    const primary = failsWith(auth())
    const backup = succeeds('from backup')
    const chain = new FallbackProvider([
      { name: 'Primary', provider: primary },
      { name: 'Backup', provider: backup },
    ])

    await expect(chain.generateDeck('topic', BRIEF)).rejects.toThrow('bad key')
    expect(backup.calls).toBe(0)
  })

  it.each([
    ['response', new AIProviderError('unparseable', { kind: 'response' })],
    ['request', new AIProviderError('bad request', { kind: 'request', status: 400 })],
    ['unknown', new AIProviderError('mystery')],
    ['a non-provider error', new TypeError('network down')],
  ])('does not fall through on %s', async (_label, err) => {
    const backup = succeeds('from backup')
    const chain = new FallbackProvider([
      { name: 'Primary', provider: failsWith(err) },
      { name: 'Backup', provider: backup },
    ])

    await expect(chain.generateDeck('topic', BRIEF)).rejects.toThrow()
    expect(backup.calls).toBe(0)
  })

  // Cancel has to stop the whole thing. Falling through here would mean the deck
  // the user walked away from still arrives, from the other provider.
  it('does not fall through when the user cancelled', async () => {
    const controller = new AbortController()
    controller.abort()
    const backup = succeeds('from backup')
    const chain = new FallbackProvider([
      { name: 'Primary', provider: failsWith(capacity()) },
      { name: 'Backup', provider: backup },
    ])

    await expect(chain.generateDeck('topic', BRIEF, controller.signal)).rejects.toThrow()
    expect(backup.calls).toBe(0)
  })

  it('treats a bare AbortError as cancellation even without a signal', async () => {
    const backup = succeeds('from backup')
    const chain = new FallbackProvider([
      { name: 'Primary', provider: failsWith(new DOMException('Aborted', 'AbortError')) },
      { name: 'Backup', provider: backup },
    ])

    await expect(chain.generateDeck('topic', BRIEF)).rejects.toThrow(/abort/i)
    expect(backup.calls).toBe(0)
  })

  it('surfaces the last provider’s error when every link is exhausted', async () => {
    const chain = new FallbackProvider([
      { name: 'Primary', provider: failsWith(capacity()) },
      { name: 'Backup', provider: failsWith(new AIProviderError('backup also full', { kind: 'capacity' })) },
    ])

    await expect(chain.generateDeck('topic', BRIEF)).rejects.toThrow('backup also full')
  })

  it('behaves like a plain provider when the chain has one link', async () => {
    const only = failsWith(capacity())
    const chain = new FallbackProvider([{ name: 'Only', provider: only }])

    await expect(chain.generateDeck('topic', BRIEF)).rejects.toThrow('rate limited')
    expect(only.calls).toBe(1)
  })

  it('passes the topic, brief and signal through untouched', async () => {
    const seen: unknown[] = []
    const provider: AIProvider = {
      async generateDeck(topic, brief, signal) {
        seen.push(topic, brief, signal)
        return deck('ok')
      },
      research: vi.fn(),
      repairSlides: vi.fn(),
      generateNarration: vi.fn(),
    }
    const controller = new AbortController()
    await new FallbackProvider([{ name: 'Only', provider }]).generateDeck(
      'lighthouses',
      BRIEF,
      controller.signal,
    )

    expect(seen).toEqual(['lighthouses', BRIEF, controller.signal])
  })
})

/**
 * `PROVIDER_CHAIN` is built once, from `import.meta.env`, at module load — so
 * each case here stubs the env vars first and re-imports the module fresh
 * (`vi.resetModules()`), the same approach `appTheme.test.ts` and
 * `briefDrafts.test.ts` take to a module with load-time environment reads.
 */
describe('PROVIDER_CHAIN', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  async function loadChain() {
    vi.resetModules()
    return (await import('./fallbackProvider')).PROVIDER_CHAIN
  }

  it('puts Anthropic first when VITE_ANTHROPIC_API_KEY is set', async () => {
    vi.stubEnv('VITE_ANTHROPIC_API_KEY', 'anthropic-key')
    vi.stubEnv('VITE_GROQ_API_KEY', 'groq-key')
    vi.stubEnv('VITE_GEMINI_API_KEY', 'gemini-key')

    const chain = await loadChain()

    expect(chain.map((link) => link.name)).toEqual(['Anthropic', 'Groq', 'Groq compound', 'Gemini'])
  })

  it("omitting VITE_ANTHROPIC_API_KEY reproduces today's chain exactly (Groq-first, same length)", async () => {
    vi.stubEnv('VITE_ANTHROPIC_API_KEY', '')
    vi.stubEnv('VITE_GROQ_API_KEY', 'groq-key')
    vi.stubEnv('VITE_GEMINI_API_KEY', 'gemini-key')

    const chain = await loadChain()

    expect(chain.map((link) => link.name)).toEqual(['Groq', 'Groq compound', 'Gemini'])
    expect(chain).toHaveLength(3)
  })
})
