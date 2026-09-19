import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AIProvider, GenerationBrief } from '@/ai/provider'
import { AIProviderError } from '@/ai/provider'
import { generatePresentation } from './pipeline'
import type { EvidencePack, GeneratedCard, GeneratedDeck, RepairResponse } from './schemas'

/*
  Factories mirror validateDeck.test.ts's shape: a clean card/deck nobody's
  rule trips on by default, so each test only overrides what it exercises.
*/

type PlanOverrides = Partial<GeneratedCard['plan']>

function card(heading: string, overrides: { plan?: PlanOverrides; blocks?: GeneratedCard['blocks'] } = {}): GeneratedCard {
  return {
    plan: {
      purpose: 'concept_explanation',
      audienceQuestion: 'What matters here?',
      keyMessage: 'A message worth telling.',
      visualType: 'text',
      layoutFamily: 'list',
      transition: '',
      importance: 'supporting',
      ...overrides.plan,
    },
    blocks: overrides.blocks ?? [
      { type: 'heading', text: heading },
      { type: 'paragraph', text: 'Body copy that adds real information for the reader.' },
    ],
    visualStyle: 'structured',
    speakerNotes: 'Extra spoken framing the presenter adds well past the wording on the card.',
    claims: [],
  }
}

function deck(cards: GeneratedCard[]): GeneratedDeck {
  return {
    title: 'Test deck',
    blueprint: 'inform',
    brief: {
      objective: 'Explain something',
      audienceKnowledgeLevel: 'beginner',
      presentationType: 'informational',
      freshnessRequired: false,
      keyQuestions: [],
    },
    cards,
  }
}

/** A clean 2-card deck: nothing here trips any validator's rule. */
function cleanDeck(): GeneratedDeck {
  return deck([card('A short clear title'), card('A concluding slide', { plan: { purpose: 'conclusion' } })])
}

/** A deck whose first slide's 18-word heading trips TITLE_TOO_LONG (medium, repairable). */
function flaggedDeck(): GeneratedDeck {
  const longHeading = Array.from({ length: 18 }, (_, i) => `word${i}`).join(' ')
  return deck([card(longHeading), card('A concluding slide', { plan: { purpose: 'conclusion' } })])
}

const BRIEF: GenerationBrief = {
  slideCount: 2,
  audience: 'engineers',
  detailLevel: 'balanced',
  tone: 'professional',
  guidance: '',
}

const FIXED_NOW = new Date('2026-09-19T00:00:00Z')

const PACK: EvidencePack = {
  sources: [{ id: 's1', title: 'Global EV Outlook', publisher: 'IEA', sourceType: 'government', publicationDate: '2024' }],
  findings: [],
  disagreements: [],
}

/**
 * Builds a stub `AIProvider` plus the raw `vi.fn()` instances it was built
 * from. Assertions read the raw mocks (typed by inference, plain function
 * types) rather than `provider.<method>` — `AIProvider`'s methods are
 * TS method-shorthand signatures, and asserting on a property of that shape
 * without calling it trips oxlint's `unbound-method` rule.
 */
function stubProvider() {
  const research = vi.fn().mockResolvedValue(PACK)
  const generateDeck = vi.fn().mockResolvedValue(cleanDeck())
  const repairSlides = vi.fn().mockResolvedValue({ repairs: [] } satisfies RepairResponse)
  const generateNarration = vi.fn()
  const provider: AIProvider = { research, generateDeck, repairSlides, generateNarration }
  return { provider, research, generateDeck, repairSlides, generateNarration }
}

describe('generatePresentation', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'info').mockImplementation(() => {})
  })

  it('passes the research pack and today to generateDeck when research succeeds', async () => {
    const { provider, generateDeck } = stubProvider()
    await generatePresentation(provider, 'EVs', BRIEF, { now: FIXED_NOW })

    expect(generateDeck).toHaveBeenCalledWith('EVs', BRIEF, undefined, { evidence: PACK, today: '2026-09-19' })
  })

  it('still generates when research throws, with research: failed and no evidence', async () => {
    const { provider, generateDeck, research } = stubProvider()
    research.mockRejectedValue(new AIProviderError('down', { kind: 'capacity', status: 503 }))

    const result = await generatePresentation(provider, 'EVs', BRIEF, { now: FIXED_NOW })

    expect(generateDeck).toHaveBeenCalledWith('EVs', BRIEF, undefined, { evidence: null, today: '2026-09-19' })
    expect(result.research).toBe('failed')
    expect(result.evidence).toBeNull()
  })

  it('skips research entirely when guidance asks for user material only', async () => {
    const { provider, research } = stubProvider()
    const brief: GenerationBrief = { ...BRIEF, guidance: 'Please only use the facts I gave you.' }

    const result = await generatePresentation(provider, 'EVs', brief, { now: FIXED_NOW })

    expect(research).not.toHaveBeenCalled()
    expect(result.research).toBe('skipped')
    expect(result.evidence).toBeNull()
  })

  it('never calls repairSlides for a clean deck', async () => {
    const { provider, repairSlides } = stubProvider()
    const result = await generatePresentation(provider, 'EVs', BRIEF, { now: FIXED_NOW })

    expect(repairSlides).not.toHaveBeenCalled()
    expect(result.repaired).toEqual([])
  })

  it('repairs a flagged slide and the flag is gone afterward', async () => {
    const { provider, generateDeck, repairSlides } = stubProvider()
    generateDeck.mockResolvedValue(flaggedDeck())
    const repairedCard = card('A short repaired title')
    repairSlides.mockResolvedValue({ repairs: [{ slide: 1, card: repairedCard }] } satisfies RepairResponse)

    const result = await generatePresentation(provider, 'EVs', BRIEF, { now: FIXED_NOW })

    expect(repairSlides).toHaveBeenCalledTimes(1)
    expect(repairSlides.mock.calls[0]?.[1]).toEqual([0])

    expect(result.repaired).toEqual([0])
    expect(result.deck.cards[0].blocks[0]).toEqual({ type: 'heading', text: 'A short repaired title' })
    expect(result.flags.some((f) => f.type === 'TITLE_TOO_LONG')).toBe(false)
  })

  it('keeps the unrepaired deck when repairSlides rejects', async () => {
    const { provider, generateDeck, repairSlides } = stubProvider()
    const original = flaggedDeck()
    generateDeck.mockResolvedValue(original)
    repairSlides.mockRejectedValue(new Error('boom'))

    const result = await generatePresentation(provider, 'EVs', BRIEF, { now: FIXED_NOW })

    expect(result.deck.cards[0]).toEqual(original.cards[0])
    expect(result.repaired).toEqual([])
    expect(result.flags.some((f) => f.type === 'TITLE_TOO_LONG')).toBe(true)
  })

  it('rejects and never calls generateDeck when research is cancelled', async () => {
    const { provider, generateDeck, research } = stubProvider()
    research.mockRejectedValue(new DOMException('x', 'AbortError'))
    const controller = new AbortController()
    controller.abort()

    await expect(
      generatePresentation(provider, 'EVs', BRIEF, { now: FIXED_NOW, signal: controller.signal }),
    ).rejects.toThrow()
    expect(generateDeck).not.toHaveBeenCalled()
  })

  it('calls onStage with research, write, validate, repair in order', async () => {
    const { provider, generateDeck, repairSlides } = stubProvider()
    generateDeck.mockResolvedValue(flaggedDeck())
    const repairedCard = card('A short repaired title')
    repairSlides.mockResolvedValue({ repairs: [{ slide: 1, card: repairedCard }] } satisfies RepairResponse)
    const stages: string[] = []

    await generatePresentation(provider, 'EVs', BRIEF, { now: FIXED_NOW, onStage: (stage) => stages.push(stage) })

    expect(stages).toEqual(['research', 'write', 'validate', 'repair'])
  })
})
