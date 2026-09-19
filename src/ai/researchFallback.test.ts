import { describe, expect, it, vi } from 'vitest'
import { FallbackProvider } from './fallbackProvider'
import {
  AIProviderError,
  type AIProvider,
  type DeckContext,
  type EvidencePack,
  type GeneratedDeck,
  type GenerationBrief,
  type QualityFlag,
  type RepairResponse,
} from './provider'

const BRIEF: GenerationBrief = {
  slideCount: 5,
  audience: 'engineers',
  detailLevel: 'balanced',
  tone: 'professional',
  guidance: '',
}

const TODAY = '2026-09-19'

const EVIDENCE: EvidencePack = { sources: [], findings: [], disagreements: [] }

const DECK: GeneratedDeck = {
  title: 'Electric vehicles in 2026',
  blueprint: 'inform',
  brief: {
    objective: 'Explain the state of EV adoption',
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
        keyMessage: 'EVs are going mainstream fast.',
        visualType: 'text',
        layoutFamily: 'hero',
        transition: '',
        importance: 'essential',
      },
      blocks: [{ type: 'heading', text: 'EV adoption is accelerating' }],
      visualStyle: 'structured',
      speakerNotes: 'A note for the speaker.',
      claims: [],
    },
  ],
} as GeneratedDeck

const TARGETS = [0]
const FLAGS: QualityFlag[] = [
  {
    type: 'TITLE_TOO_LONG',
    severity: 'medium',
    slideIndex: 0,
    message: 'Heading is too long.',
    suggestedAction: 'Tighten the heading.',
  },
]
const CONTEXT: DeckContext = { evidence: null, today: TODAY }
const REPAIR_RESPONSE: RepairResponse = { repairs: [{ slide: 1, card: {} }] }

/** Records how many times each method was called, so a skip is assertable. */
function stub(overrides: {
  research?: () => Promise<EvidencePack>
  repairSlides?: () => Promise<RepairResponse>
}): AIProvider & { researchCalls: number; repairCalls: number } {
  const it_ = {
    researchCalls: 0,
    repairCalls: 0,
    generateDeck: vi.fn(),
    async research() {
      it_.researchCalls++
      if (overrides.research) return overrides.research()
      return Promise.resolve(EVIDENCE)
    },
    async repairSlides() {
      it_.repairCalls++
      if (overrides.repairSlides) return overrides.repairSlides()
      return Promise.resolve(REPAIR_RESPONSE)
    },
    generateNarration: vi.fn(),
  }
  return it_
}

const capacity = () => new AIProviderError('rate limited', { kind: 'capacity', status: 429 })
const auth = () => new AIProviderError('bad key', { kind: 'auth', status: 401 })
const response = () => new AIProviderError('unparseable', { kind: 'response' })

describe('FallbackProvider.research', () => {
  it('returns the first provider’s evidence without touching the second', async () => {
    const a = stub({})
    const b = stub({})
    const chain = new FallbackProvider([
      { name: 'A', provider: a },
      { name: 'B', provider: b },
    ])

    await expect(chain.research('topic', BRIEF, TODAY)).resolves.toEqual(EVIDENCE)
    expect(a.researchCalls).toBe(1)
    expect(b.researchCalls).toBe(0)
  })

  it('falls over to the second provider when the first is out of capacity', async () => {
    const a = stub({ research: () => Promise.reject(capacity()) })
    const b = stub({})
    const chain = new FallbackProvider([
      { name: 'A', provider: a },
      { name: 'B', provider: b },
    ])

    await expect(chain.research('topic', BRIEF, TODAY)).resolves.toEqual(EVIDENCE)
    expect(a.researchCalls).toBe(1)
    expect(b.researchCalls).toBe(1)
  })

  it('does not fall over on an auth failure', async () => {
    const a = stub({ research: () => Promise.reject(auth()) })
    const b = stub({})
    const chain = new FallbackProvider([
      { name: 'A', provider: a },
      { name: 'B', provider: b },
    ])

    await expect(chain.research('topic', BRIEF, TODAY)).rejects.toThrow('bad key')
    expect(b.researchCalls).toBe(0)
  })

  it('does not fall over on an unparseable response', async () => {
    const a = stub({ research: () => Promise.reject(response()) })
    const b = stub({})
    const chain = new FallbackProvider([
      { name: 'A', provider: a },
      { name: 'B', provider: b },
    ])

    await expect(chain.research('topic', BRIEF, TODAY)).rejects.toThrow('unparseable')
    expect(b.researchCalls).toBe(0)
  })

  it('does not fall over when the user cancelled', async () => {
    const controller = new AbortController()
    const a = stub({
      research: () => {
        controller.abort()
        return Promise.reject(capacity())
      },
    })
    const b = stub({})
    const chain = new FallbackProvider([
      { name: 'A', provider: a },
      { name: 'B', provider: b },
    ])

    await expect(chain.research('topic', BRIEF, TODAY, controller.signal)).rejects.toThrow('rate limited')
    expect(b.researchCalls).toBe(0)
  })
})

describe('FallbackProvider.repairSlides', () => {
  it('returns the first provider’s repairs without touching the second', async () => {
    const a = stub({})
    const b = stub({})
    const chain = new FallbackProvider([
      { name: 'A', provider: a },
      { name: 'B', provider: b },
    ])

    await expect(chain.repairSlides(DECK, TARGETS, FLAGS, CONTEXT)).resolves.toEqual(REPAIR_RESPONSE)
    expect(a.repairCalls).toBe(1)
    expect(b.repairCalls).toBe(0)
  })

  it('falls over to the second provider when the first is out of capacity', async () => {
    const a = stub({ repairSlides: () => Promise.reject(capacity()) })
    const b = stub({})
    const chain = new FallbackProvider([
      { name: 'A', provider: a },
      { name: 'B', provider: b },
    ])

    await expect(chain.repairSlides(DECK, TARGETS, FLAGS, CONTEXT)).resolves.toEqual(REPAIR_RESPONSE)
    expect(a.repairCalls).toBe(1)
    expect(b.repairCalls).toBe(1)
  })

  it('does not fall over on an auth failure', async () => {
    const a = stub({ repairSlides: () => Promise.reject(auth()) })
    const b = stub({})
    const chain = new FallbackProvider([
      { name: 'A', provider: a },
      { name: 'B', provider: b },
    ])

    await expect(chain.repairSlides(DECK, TARGETS, FLAGS, CONTEXT)).rejects.toThrow('bad key')
    expect(b.repairCalls).toBe(0)
  })

  it('does not fall over on an unparseable response', async () => {
    const a = stub({ repairSlides: () => Promise.reject(response()) })
    const b = stub({})
    const chain = new FallbackProvider([
      { name: 'A', provider: a },
      { name: 'B', provider: b },
    ])

    await expect(chain.repairSlides(DECK, TARGETS, FLAGS, CONTEXT)).rejects.toThrow('unparseable')
    expect(b.repairCalls).toBe(0)
  })

  it('does not fall over when the user cancelled', async () => {
    const controller = new AbortController()
    const a = stub({
      repairSlides: () => {
        controller.abort()
        return Promise.reject(capacity())
      },
    })
    const b = stub({})
    const chain = new FallbackProvider([
      { name: 'A', provider: a },
      { name: 'B', provider: b },
    ])

    await expect(
      chain.repairSlides(DECK, TARGETS, FLAGS, CONTEXT, controller.signal),
    ).rejects.toThrow('rate limited')
    expect(b.repairCalls).toBe(0)
  })
})
