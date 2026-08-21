import { beforeEach, describe, expect, it, vi } from 'vitest'
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
  return { title, cards: [{ blocks: [{ type: 'heading', text: title }], visualStyle: 'structured' }] }
}

/** Records how many times it was asked, so we can assert a provider was skipped. */
function stub(behaviour: () => Promise<GeneratedDeck>): AIProvider & { calls: number } {
  const it_ = {
    calls: 0,
    async generateDeck() {
      it_.calls++
      return behaviour()
    },
  }
  return it_
}

const succeeds = (title: string) => stub(() => Promise.resolve(deck(title)))
const failsWith = (err: unknown) => stub(() => Promise.reject(err))

const capacity = () => new AIProviderError('rate limited', { kind: 'capacity', status: 429 })
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
