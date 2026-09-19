import { describe, expect, it } from 'vitest'
import { buildGenerationMeta } from './meta'
import type { Claim, EvidencePack, GeneratedDeck, QualityFlag } from './schemas'
import type { PipelineResult } from './pipeline'

/** Minimal but schema-shaped `SlidePlan`, just enough to round-trip through `buildGenerationMeta`. */
function plan(keyMessage: string) {
  return {
    purpose: 'overview' as const,
    audienceQuestion: 'why does this matter?',
    keyMessage,
    visualType: 'text' as const,
    layoutFamily: 'list' as const,
    transition: '',
    importance: 'essential' as const,
  }
}

function card(keyMessage: string) {
  return {
    plan: plan(keyMessage),
    blocks: [{ type: 'heading' as const, text: keyMessage }],
    visualStyle: 'structured' as const,
    speakerNotes: '',
    claims: [],
  }
}

function claim(overrides: Partial<Claim>): Claim {
  return {
    id: 'c1',
    statement: 'stated fact',
    type: 'general_fact',
    sourceIds: [],
    timeSensitive: false,
    slideIndex: 0,
    verified: true,
    ...overrides,
  }
}

function deck(cards: GeneratedDeck['cards']): GeneratedDeck {
  return {
    title: 'Deck',
    blueprint: 'inform',
    brief: {
      objective: 'inform',
      audienceKnowledgeLevel: 'beginner',
      presentationType: 'other',
      freshnessRequired: false,
      keyQuestions: [],
    },
    cards,
  }
}

function result(overrides: Partial<PipelineResult>): PipelineResult {
  return {
    deck: deck([card('slide 0'), card('slide 1')]),
    evidence: null,
    research: 'skipped',
    claims: [],
    flags: [],
    repaired: [],
    ...overrides,
  }
}

describe('buildGenerationMeta', () => {
  it('keys plans by card id, in order', () => {
    const cardIds = ['card-a', 'card-b']
    const meta = buildGenerationMeta(result({}), cardIds, '2026-09-19T00:00:00.000Z')
    expect(meta.plans['card-a']?.keyMessage).toBe('slide 0')
    expect(meta.plans['card-b']?.keyMessage).toBe('slide 1')
  })

  it('groups claims under the card id matching their slideIndex', () => {
    const cardIds = ['card-a', 'card-b']
    const claims = [claim({ id: 'x', slideIndex: 1, statement: 'about slide 1' })]
    const meta = buildGenerationMeta(result({ claims }), cardIds, '2026-09-19T00:00:00.000Z')
    expect(meta.claims['card-b']).toEqual([claims[0]])
  })

  it('gives cards with no claims an empty array, not a missing key', () => {
    const cardIds = ['card-a', 'card-b']
    const claims = [claim({ id: 'x', slideIndex: 1 })]
    const meta = buildGenerationMeta(result({ claims }), cardIds, '2026-09-19T00:00:00.000Z')
    expect(meta.claims['card-a']).toEqual([])
  })

  it('defaults sources to an empty array when evidence is null', () => {
    const meta = buildGenerationMeta(result({ evidence: null }), ['card-a', 'card-b'], '2026-09-19T00:00:00.000Z')
    expect(meta.sources).toEqual([])
  })

  it('reads sources off the evidence pack when present', () => {
    const evidence: EvidencePack = {
      sources: [{ id: 's1', title: 'Source One', publisher: '', sourceType: 'other' }],
      findings: [],
      disagreements: [],
    }
    const meta = buildGenerationMeta(result({ evidence }), ['card-a', 'card-b'], '2026-09-19T00:00:00.000Z')
    expect(meta.sources).toEqual(evidence.sources)
  })

  it('carries version 1', () => {
    const meta = buildGenerationMeta(result({}), ['card-a', 'card-b'], '2026-09-19T00:00:00.000Z')
    expect(meta.version).toBe(1)
  })

  it('passes generatedAt through unchanged', () => {
    const meta = buildGenerationMeta(result({}), ['card-a', 'card-b'], '2026-09-19T12:34:56.000Z')
    expect(meta.generatedAt).toBe('2026-09-19T12:34:56.000Z')
  })

  it('carries the deck brief, flags and research status through', () => {
    const flags: QualityFlag[] = [
      { type: 'FILLER_SLIDE', severity: 'low', message: 'm', suggestedAction: 'a' },
    ]
    const meta = buildGenerationMeta(
      result({ flags, research: 'failed' }),
      ['card-a', 'card-b'],
      '2026-09-19T00:00:00.000Z',
    )
    expect(meta.brief).toEqual(deck([]).brief)
    expect(meta.flags).toEqual(flags)
    expect(meta.research).toBe('failed')
  })
})
