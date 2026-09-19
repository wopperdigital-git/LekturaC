import { describe, expect, it } from 'vitest'
import type { GeneratedCard, GeneratedDeck, QualityFlag } from '../schemas'
import { MAX_REPAIR_SLIDES, repairTargets, validateDeck } from './validateDeck'

/** N space-separated placeholder words — enough to hit an exact word-count threshold. */
function words(n: number): string {
  return Array.from({ length: n }, (_, i) => `word${i}`).join(' ')
}

type PlanOverrides = Partial<GeneratedCard['plan']>
type ClaimInput = GeneratedCard['claims'][number]

interface CardOverrides {
  plan?: PlanOverrides
  blocks?: GeneratedCard['blocks']
  claims?: ClaimInput[]
  speakerNotes?: string
}

function card(overrides: CardOverrides = {}): GeneratedCard {
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
      { type: 'heading', text: 'A short clear title' },
      { type: 'paragraph', text: 'Body copy that adds real information for the reader.' },
    ],
    visualStyle: 'structured',
    speakerNotes: overrides.speakerNotes ?? 'Extra spoken framing the presenter adds well past the wording on the card.',
    claims: overrides.claims ?? [],
  }
}

function deck(cards: GeneratedCard[], brief: Partial<GeneratedDeck['brief']> = {}): GeneratedDeck {
  return {
    title: 'Test deck',
    blueprint: 'inform',
    brief: {
      objective: 'Explain something',
      audienceKnowledgeLevel: 'beginner',
      presentationType: 'informational',
      freshnessRequired: false,
      keyQuestions: [],
      ...brief,
    },
    cards,
  }
}

describe('validateDeck', () => {
  it('combines structureFlags and evidenceFlags, and returns computed claims', () => {
    const d = deck([
      card({
        blocks: [
          { type: 'heading', text: words(15) },
          { type: 'stat', value: '18%', label: 'growth' },
        ],
        claims: [{ statement: 'Growth was 18%', type: 'statistic', sourceIds: [], timeSensitive: false }],
      }),
    ])
    const result = validateDeck(d, { pack: null, currentYear: 2026, freshnessRequired: false })
    const types = result.flags.map((f) => f.type)
    expect(types).toContain('TITLE_TOO_LONG') // from structureFlags
    expect(types).toContain('AMBIGUOUS_METRIC') // from evidenceFlags
    expect(result.claims).toHaveLength(1)
    expect(result.claims[0].id).toBe('c1-1')
    expect(result.claims[0].verified).toBe(false)
  })
})

describe('repairTargets', () => {
  function flag(overrides: Partial<QualityFlag> = {}): QualityFlag {
    return {
      type: 'TITLE_TOO_LONG',
      severity: 'medium',
      slideIndex: 0,
      message: 'x',
      suggestedAction: 'y',
      ...overrides,
    }
  }

  it('ignores low-severity flags', () => {
    expect(repairTargets([flag({ severity: 'low', slideIndex: 0 })])).toEqual([])
  })

  it('ignores deck-level flags with no slideIndex', () => {
    expect(repairTargets([flag({ severity: 'high', slideIndex: undefined })])).toEqual([])
  })

  it('ignores a medium flag of a non-repairable type (DUPLICATE_CONTENT)', () => {
    expect(repairTargets([flag({ type: 'DUPLICATE_CONTENT', severity: 'medium', slideIndex: 0 })])).toEqual([])
  })

  it('includes a medium flag of a repairable type', () => {
    expect(repairTargets([flag({ type: 'BODY_TOO_DENSE', severity: 'medium', slideIndex: 3 })])).toEqual([3])
  })

  it('includes any high-severity flag regardless of type', () => {
    expect(repairTargets([flag({ type: 'TOO_MANY_BULLETS', severity: 'high', slideIndex: 2 })])).toEqual([2])
  })

  it('ranks by high count then medium count descending, ties by index ascending', () => {
    const flags: QualityFlag[] = [
      flag({ severity: 'high', slideIndex: 5 }),
      flag({ type: 'BODY_TOO_DENSE', severity: 'medium', slideIndex: 1 }),
      flag({ type: 'BODY_TOO_DENSE', severity: 'medium', slideIndex: 1 }),
      flag({ severity: 'high', slideIndex: 1 }),
      flag({ severity: 'high', slideIndex: 3 }),
    ]
    // slide1: 1 high + 2 medium; slide5: 1 high; slide3: 1 high.
    // All tie on high count (1). slide1 wins on medium count (2 > 0).
    // slide3 and slide5 tie on both -> ties broken by index ascending.
    expect(repairTargets(flags)).toEqual([1, 3, 5])
  })

  it('caps at MAX_REPAIR_SLIDES and returns ascending', () => {
    const flags: QualityFlag[] = Array.from({ length: 6 }, (_, i) => flag({ severity: 'high', slideIndex: i }))
    const result = repairTargets(flags)
    expect(result).toHaveLength(MAX_REPAIR_SLIDES)
    expect(result).toEqual([0, 1, 2, 3])
  })
})
