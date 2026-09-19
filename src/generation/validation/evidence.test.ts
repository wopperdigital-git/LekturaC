import { describe, expect, it } from 'vitest'
import type { EvidencePack, GeneratedCard, GeneratedDeck } from '../schemas'
import { evidenceFlags, requiresFreshness, verifyClaims, yearOf, type EvidenceContext } from './evidence'

/*
  Factories mirror structure.test.ts's shape (a clean card/deck nobody's rule
  trips on by default) so every test only overrides what it's actually
  exercising. Kept local rather than shared, same as structure.test.ts.
*/

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

function pack(overrides: Partial<EvidencePack> = {}): EvidencePack {
  return { sources: [], findings: [], disagreements: [], ...overrides }
}

function ctx(overrides: Partial<EvidenceContext> = {}): EvidenceContext {
  return { pack: null, currentYear: 2026, freshnessRequired: false, ...overrides }
}

function claim(overrides: Partial<ClaimInput> = {}): ClaimInput {
  return {
    statement: 'EV sales rose sharply',
    type: 'statistic',
    sourceIds: [],
    timeSensitive: false,
    ...overrides,
  }
}

describe('requiresFreshness', () => {
  it('is true for "current"', () => {
    expect(requiresFreshness('Current EV trends')).toBe(true)
  })

  it('is false for unrelated text', () => {
    expect(requiresFreshness('History of the steam engine')).toBe(false)
  })

  it('is true for "recently"', () => {
    expect(requiresFreshness('recently')).toBe(true)
  })

  it('is false for a word that merely contains a term', () => {
    expect(requiresFreshness('currentness')).toBe(false)
  })

  it('checks every argument, not just the first', () => {
    expect(requiresFreshness('A steady deck', 'nothing modern here')).toBe(true)
  })
})

describe('yearOf', () => {
  it('reads the year out of a date string', () => {
    expect(yearOf('2024-05')).toBe(2024)
  })

  it('accepts a bare number', () => {
    expect(yearOf(1999)).toBe(1999)
  })

  it('returns undefined when nothing looks like a year', () => {
    expect(yearOf('n/a')).toBeUndefined()
  })

  it('returns undefined for undefined', () => {
    expect(yearOf(undefined)).toBeUndefined()
  })
})

describe('verifyClaims', () => {
  it('marks every claim unverified when the pack is null', () => {
    const d = deck([card({ claims: [claim({ sourceIds: ['s1'] })] })])
    const claims = verifyClaims(d, null)
    expect(claims[0].verified).toBe(false)
  })

  it('marks a claim unverified when its source id is unknown to the pack', () => {
    const p = pack({ sources: [{ id: 'other', title: 'X', publisher: '', sourceType: 'other' }] })
    const d = deck([card({ claims: [claim({ sourceIds: ['s1'] })] })])
    expect(verifyClaims(d, p)[0].verified).toBe(false)
  })

  it('marks a claim verified when every source id is known', () => {
    const p = pack({ sources: [{ id: 's1', title: 'X', publisher: '', sourceType: 'other' }] })
    const d = deck([card({ claims: [claim({ sourceIds: ['s1'] })] })])
    expect(verifyClaims(d, p)[0].verified).toBe(true)
  })

  it('marks a claim with no source ids unverified even with a pack', () => {
    const p = pack({ sources: [{ id: 's1', title: 'X', publisher: '', sourceType: 'other' }] })
    const d = deck([card({ claims: [claim({ sourceIds: [] })] })])
    expect(verifyClaims(d, p)[0].verified).toBe(false)
  })

  it('assigns ids c1-1, c1-2, c2-1 across cards', () => {
    const d = deck([
      card({ claims: [claim({ statement: 'A' }), claim({ statement: 'B' })] }),
      card({ claims: [claim({ statement: 'C' })] }),
    ])
    const claims = verifyClaims(d, null)
    expect(claims.map((c) => c.id)).toEqual(['c1-1', 'c1-2', 'c2-1'])
    expect(claims.map((c) => c.slideIndex)).toEqual([0, 0, 1])
  })
})

describe('evidenceFlags', () => {
  describe('UNSUPPORTED_STATISTIC', () => {
    it('flags a stat block with no verified claim as high when a pack exists', () => {
      const p = pack({ sources: [{ id: 's1', title: 'Report', publisher: 'X', sourceType: 'other' }] })
      const d = deck([card({ blocks: [{ type: 'heading', text: 'Growth' }, { type: 'stat', value: '18%', label: 'yoy growth' }] })])
      const claims = verifyClaims(d, p)
      const flags = evidenceFlags(d, claims, ctx({ pack: p })).filter((f) => f.type === 'UNSUPPORTED_STATISTIC')
      expect(flags).toHaveLength(1)
      expect(flags[0].severity).toBe('high')
      expect(flags[0].slideIndex).toBe(0)
    })

    it('flags the same case as low when there is no evidence pack at all', () => {
      // No pack means research was skipped or failed — nothing was ever
      // available to cite, which is exactly the no-evidence behavior the
      // prompt asks the model to follow (well-known facts, sourceIds: []).
      // This must never cost a repair call, so it logs as low rather than
      // medium/high.
      const d = deck([card({ blocks: [{ type: 'heading', text: 'Growth' }, { type: 'stat', value: '18%', label: 'yoy growth' }] })])
      const claims = verifyClaims(d, null)
      const flags = evidenceFlags(d, claims, ctx({ pack: null })).filter((f) => f.type === 'UNSUPPORTED_STATISTIC')
      expect(flags).toHaveLength(1)
      expect(flags[0].severity).toBe('low')
    })

    it('flags the same case as medium when a pack exists but has no sources', () => {
      const p = pack({ sources: [] })
      const d = deck([card({ blocks: [{ type: 'heading', text: 'Growth' }, { type: 'stat', value: '18%', label: 'yoy growth' }] })])
      const claims = verifyClaims(d, p)
      const flags = evidenceFlags(d, claims, ctx({ pack: p })).filter((f) => f.type === 'UNSUPPORTED_STATISTIC')
      expect(flags).toHaveLength(1)
      expect(flags[0].severity).toBe('medium')
    })

    it('flags a bare percentage in prose even without a stat block', () => {
      const d = deck([
        card({ blocks: [{ type: 'heading', text: 'Growth' }, { type: 'paragraph', text: 'Sales rose 18% this year.' }] }),
      ])
      const claims = verifyClaims(d, null)
      const flags = evidenceFlags(d, claims, ctx()).filter((f) => f.type === 'UNSUPPORTED_STATISTIC')
      expect(flags).toHaveLength(1)
    })

    it('flags a currency amount in prose', () => {
      const d = deck([
        card({ blocks: [{ type: 'heading', text: 'Funding' }, { type: 'paragraph', text: 'The round raised $5 million.' }] }),
      ])
      const claims = verifyClaims(d, null)
      const flags = evidenceFlags(d, claims, ctx()).filter((f) => f.type === 'UNSUPPORTED_STATISTIC')
      expect(flags).toHaveLength(1)
    })

    it('does not flag a figure backed by a verified claim', () => {
      const p = pack({ sources: [{ id: 's1', title: 'Report', publisher: 'X', sourceType: 'other' }] })
      const d = deck([
        card({
          blocks: [{ type: 'heading', text: 'Growth' }, { type: 'stat', value: '18%', label: 'yoy growth' }],
          claims: [claim({ statement: 'Growth was 18% year over year', sourceIds: ['s1'] })],
        }),
      ])
      const claims = verifyClaims(d, p)
      expect(evidenceFlags(d, claims, ctx({ pack: p })).filter((f) => f.type === 'UNSUPPORTED_STATISTIC')).toEqual([])
    })

    it('does not flag a card with no figure at all', () => {
      const d = deck([card()])
      const claims = verifyClaims(d, null)
      expect(evidenceFlags(d, claims, ctx()).filter((f) => f.type === 'UNSUPPORTED_STATISTIC')).toEqual([])
    })
  })

  describe('MISSING_SOURCE', () => {
    it('flags unverified statistic/historical/scientific/comparison claims as low when there is no pack at all', () => {
      // Same reasoning as UNSUPPORTED_STATISTIC: with no pack there was
      // nothing to cite, so this is the documented no-evidence behavior, not
      // a defect worth a repair call.
      const d = deck([
        card({
          claims: [
            claim({ statement: 'A', type: 'statistic' }),
            claim({ statement: 'B', type: 'historical' }),
            claim({ statement: 'C', type: 'opinion' }),
          ],
        }),
      ])
      const claims = verifyClaims(d, null)
      const flags = evidenceFlags(d, claims, ctx({ pack: null })).filter((f) => f.type === 'MISSING_SOURCE')
      expect(flags).toHaveLength(1)
      expect(flags[0].severity).toBe('low')
      expect(flags[0].slideIndex).toBe(0)
      expect(flags[0].message).toContain('2')
    })

    it('flags the same case as medium when a pack exists', () => {
      const p = pack({ sources: [{ id: 's1', title: 'Report', publisher: 'X', sourceType: 'other' }] })
      const d = deck([card({ claims: [claim({ statement: 'A', type: 'statistic' })] })])
      const claims = verifyClaims(d, p)
      const flags = evidenceFlags(d, claims, ctx({ pack: p })).filter((f) => f.type === 'MISSING_SOURCE')
      expect(flags).toHaveLength(1)
      expect(flags[0].severity).toBe('medium')
    })

    it('does not flag a verified claim of a sourced type', () => {
      const p = pack({ sources: [{ id: 's1', title: 'Report', publisher: 'X', sourceType: 'other' }] })
      const d = deck([card({ claims: [claim({ type: 'statistic', sourceIds: ['s1'] })] })])
      const claims = verifyClaims(d, p)
      expect(evidenceFlags(d, claims, ctx({ pack: p })).filter((f) => f.type === 'MISSING_SOURCE')).toEqual([])
    })

    it('does not flag an unverified claim of a non-sourced type', () => {
      const d = deck([card({ claims: [claim({ type: 'opinion' })] })])
      const claims = verifyClaims(d, null)
      expect(evidenceFlags(d, claims, ctx()).filter((f) => f.type === 'MISSING_SOURCE')).toEqual([])
    })
  })

  describe('OUTDATED_EVIDENCE', () => {
    it('flags a time-sensitive 2023 claim when freshness is required and currentYear is 2026', () => {
      const d = deck([card({ claims: [claim({ type: 'statistic', timeSensitive: true, year: 2023 })] })])
      const claims = verifyClaims(d, null)
      const flags = evidenceFlags(d, claims, ctx({ freshnessRequired: true, currentYear: 2026 })).filter(
        (f) => f.type === 'OUTDATED_EVIDENCE',
      )
      expect(flags).toHaveLength(1)
      expect(flags[0].severity).toBe('high')
      expect(flags[0].slideIndex).toBe(0)
    })

    it('does not flag a 2024 claim under the same conditions', () => {
      const d = deck([card({ claims: [claim({ type: 'statistic', timeSensitive: true, year: 2024 })] })])
      const claims = verifyClaims(d, null)
      const flags = evidenceFlags(d, claims, ctx({ freshnessRequired: true, currentYear: 2026 })).filter(
        (f) => f.type === 'OUTDATED_EVIDENCE',
      )
      expect(flags).toEqual([])
    })

    it('does not flag a historical claim from 1990', () => {
      const d = deck([card({ claims: [claim({ type: 'historical', timeSensitive: true, year: 1990 })] })])
      const claims = verifyClaims(d, null)
      const flags = evidenceFlags(d, claims, ctx({ freshnessRequired: true, currentYear: 2026 })).filter(
        (f) => f.type === 'OUTDATED_EVIDENCE',
      )
      expect(flags).toEqual([])
    })

    it('does not flag anything when freshness is not required', () => {
      const d = deck([card({ claims: [claim({ type: 'statistic', timeSensitive: true, year: 2023 })] })])
      const claims = verifyClaims(d, null)
      const flags = evidenceFlags(d, claims, ctx({ freshnessRequired: false, currentYear: 2026 })).filter(
        (f) => f.type === 'OUTDATED_EVIDENCE',
      )
      expect(flags).toEqual([])
    })

    it('falls back to the newest source publicationDate when the claim has no year', () => {
      const p = pack({
        sources: [
          { id: 's1', title: 'Old', publisher: 'X', sourceType: 'other', publicationDate: '2020-01-01' },
          { id: 's2', title: 'Newer', publisher: 'X', sourceType: 'other', publicationDate: '2022-06-01' },
        ],
      })
      const d = deck([card({ claims: [claim({ type: 'statistic', timeSensitive: true, sourceIds: ['s1', 's2'] })] })])
      const claims = verifyClaims(d, p)
      const flags = evidenceFlags(d, claims, ctx({ pack: p, freshnessRequired: true, currentYear: 2026 })).filter(
        (f) => f.type === 'OUTDATED_EVIDENCE',
      )
      expect(flags).toHaveLength(1)
    })

    it('skips a card whose plan.purpose is timeline', () => {
      const d = deck([
        card({ plan: { purpose: 'timeline' }, claims: [claim({ type: 'statistic', timeSensitive: true, year: 2023 })] }),
      ])
      const claims = verifyClaims(d, null)
      const flags = evidenceFlags(d, claims, ctx({ freshnessRequired: true, currentYear: 2026 })).filter(
        (f) => f.type === 'OUTDATED_EVIDENCE',
      )
      expect(flags).toEqual([])
    })
  })

  describe('AMBIGUOUS_METRIC', () => {
    it('flags a stat block whose label has no 4-digit year', () => {
      const d = deck([card({ blocks: [{ type: 'heading', text: 'Share' }, { type: 'stat', value: '18%', label: 'market share' }] })])
      const flags = evidenceFlags(d, [], ctx()).filter((f) => f.type === 'AMBIGUOUS_METRIC')
      expect(flags).toHaveLength(1)
      expect(flags[0].severity).toBe('low')
      expect(flags[0].slideIndex).toBe(0)
    })

    it('does not flag a stat block whose label carries a year', () => {
      const d = deck([
        card({ blocks: [{ type: 'heading', text: 'Share' }, { type: 'stat', value: '18%', label: '2024 market share' }] }),
      ])
      expect(evidenceFlags(d, [], ctx()).filter((f) => f.type === 'AMBIGUOUS_METRIC')).toEqual([])
    })
  })

  describe('CONFLICTING_CLAIM', () => {
    it('flags the later card when two stat blocks share a normalized label but differ in value', () => {
      const d = deck([
        card({ blocks: [{ type: 'heading', text: 'Share' }, { type: 'stat', value: '18%', label: 'Market Share' }] }),
        card({ blocks: [{ type: 'heading', text: 'Share again' }, { type: 'stat', value: '20%', label: 'market share' }] }),
      ])
      const flags = evidenceFlags(d, [], ctx()).filter((f) => f.type === 'CONFLICTING_CLAIM')
      expect(flags).toHaveLength(1)
      expect(flags[0].slideIndex).toBe(1)
      expect(flags[0].severity).toBe('high')
    })

    it('does not flag two stat blocks with the same label and the same value', () => {
      const d = deck([
        card({ blocks: [{ type: 'heading', text: 'Share' }, { type: 'stat', value: '18%', label: 'Market Share' }] }),
        card({ blocks: [{ type: 'heading', text: 'Share again' }, { type: 'stat', value: '18%', label: 'market share' }] }),
      ])
      expect(evidenceFlags(d, [], ctx()).filter((f) => f.type === 'CONFLICTING_CLAIM')).toEqual([])
    })

    it('flags the later claim when statements agree once digits are removed but the digits differ', () => {
      const d = deck([
        card({ claims: [claim({ statement: 'EV sales rose 12% last year' })] }),
        card({ claims: [claim({ statement: 'EV sales rose 18% last year' })] }),
      ])
      const claims = verifyClaims(d, null)
      const flags = evidenceFlags(d, claims, ctx()).filter((f) => f.type === 'CONFLICTING_CLAIM')
      expect(flags.some((f) => f.slideIndex === 1)).toBe(true)
    })

    it('does not flag two claims with the exact same statement and digits', () => {
      const d = deck([
        card({ claims: [claim({ statement: 'EV sales rose 12% last year' })] }),
        card({ claims: [claim({ statement: 'EV sales rose 12% last year' })] }),
      ])
      const claims = verifyClaims(d, null)
      expect(evidenceFlags(d, claims, ctx()).filter((f) => f.type === 'CONFLICTING_CLAIM')).toEqual([])
    })

    it('does not flag the same claim shape about two different years', () => {
      // Different years are different claims, not one claim stated two
      // conflicting ways — the year must stay in the comparison key rather
      // than being erased like an ordinary digit run.
      const d = deck([
        card({ claims: [claim({ statement: 'EV sales in 2023 were 14 million' })] }),
        card({ claims: [claim({ statement: 'EV sales in 2024 were 17 million' })] }),
      ])
      const claims = verifyClaims(d, null)
      expect(evidenceFlags(d, claims, ctx()).filter((f) => f.type === 'CONFLICTING_CLAIM')).toEqual([])
    })

    it('flags two different numbers stated for the same year', () => {
      const d = deck([
        card({ claims: [claim({ statement: 'EV sales in 2023 were 14 million' })] }),
        card({ claims: [claim({ statement: 'EV sales in 2023 were 17 million' })] }),
      ])
      const claims = verifyClaims(d, null)
      const flags = evidenceFlags(d, claims, ctx()).filter((f) => f.type === 'CONFLICTING_CLAIM')
      expect(flags.some((f) => f.slideIndex === 1)).toBe(true)
    })
  })
})
