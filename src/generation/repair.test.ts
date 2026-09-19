import { describe, expect, it } from 'vitest'
import type { Claim, EvidencePack, GeneratedCard, GeneratedDeck, RepairResponse } from './schemas'
import { applyRepairs, notesWithCitations } from './repair'

/** A minimal, schema-valid card, distinguishable by its heading text. */
function validCard(heading: string, overrides: Partial<GeneratedCard> = {}): GeneratedCard {
  return {
    plan: {
      purpose: 'concept_explanation',
      audienceQuestion: 'What matters here?',
      keyMessage: 'A message worth telling.',
      visualType: 'text',
      layoutFamily: 'list',
      transition: '',
      importance: 'supporting',
    },
    blocks: [
      { type: 'heading', text: heading },
      { type: 'paragraph', text: 'Body copy that adds real information for the reader.' },
    ],
    visualStyle: 'structured',
    speakerNotes: 'Extra spoken framing the presenter adds well past the wording on the card.',
    claims: [],
    ...overrides,
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

describe('applyRepairs', () => {
  it('lands a replacement for a targeted slide', () => {
    const original = deck([validCard('Original slide one'), validCard('Original slide two')])
    const response: RepairResponse = {
      repairs: [{ slide: 1, card: validCard('Repaired slide one') }],
    }
    const result = applyRepairs(original, response, [0])
    expect(result.deck.cards[0].blocks[0]).toEqual({ type: 'heading', text: 'Repaired slide one' })
    expect(result.deck.cards[1]).toEqual(original.cards[1])
    expect(result.repaired).toEqual([0])
  })

  // The invariant: a replacement the model sent for a slide nobody targeted must
  // never land, whatever it looks like. If the `targets` check is removed from
  // `applyRepairs`, this is the test that fails.
  it('drops a replacement for a slide that was not targeted', () => {
    const original = deck([validCard('Original slide one'), validCard('Original slide two')])
    const response: RepairResponse = {
      repairs: [{ slide: 2, card: validCard('Unwanted replacement') }],
    }
    const result = applyRepairs(original, response, [0])
    expect(result.deck.cards[1]).toEqual(original.cards[1])
    expect(result.repaired).toEqual([])
  })

  it('drops a replacement whose slide number is out of range', () => {
    const original = deck([validCard('Original slide one'), validCard('Original slide two')])
    const response: RepairResponse = {
      repairs: [{ slide: 99, card: validCard('Out of range') }],
    }
    const result = applyRepairs(original, response, [0, 1])
    expect(result.deck).toEqual(original)
    expect(result.repaired).toEqual([])
  })

  it('drops a schema-invalid card while a valid sibling still lands', () => {
    const original = deck([validCard('Original slide one'), validCard('Original slide two')])
    const response: RepairResponse = {
      repairs: [
        { slide: 1, card: { not: 'a card' } },
        { slide: 2, card: validCard('Repaired slide two') },
      ],
    }
    const result = applyRepairs(original, response, [0, 1])
    expect(result.deck.cards[0]).toEqual(original.cards[0])
    expect(result.deck.cards[1].blocks[0]).toEqual({ type: 'heading', text: 'Repaired slide two' })
    expect(result.repaired).toEqual([1])
  })

  it('never changes the deck length', () => {
    const original = deck([validCard('One'), validCard('Two'), validCard('Three')])
    const response: RepairResponse = {
      repairs: [{ slide: 2, card: validCard('Repaired two') }],
    }
    const result = applyRepairs(original, response, [1])
    expect(result.deck.cards).toHaveLength(3)
  })

  it('does not mutate the input deck', () => {
    const original = deck([validCard('Original slide one'), validCard('Original slide two')])
    const snapshot = JSON.parse(JSON.stringify(original))
    const response: RepairResponse = {
      repairs: [{ slide: 1, card: validCard('Repaired slide one') }],
    }
    applyRepairs(original, response, [0])
    expect(original).toEqual(snapshot)
  })
})

describe('notesWithCitations', () => {
  const pack: EvidencePack = {
    sources: [
      { id: 's1', title: 'Global EV Outlook', publisher: 'IEA', sourceType: 'government', publicationDate: '2024-05' },
      { id: 's2', title: 'Vehicle Electrification Report', publisher: 'U.S. DOE', sourceType: 'government', publicationDate: '2023-01' },
    ],
    findings: [],
    disagreements: [],
  }

  function claim(overrides: Partial<Claim> = {}): Claim {
    return {
      id: 'c1-1',
      slideIndex: 0,
      statement: 'EV sales grew sharply',
      type: 'statistic',
      sourceIds: ['s1'],
      timeSensitive: false,
      verified: true,
      ...overrides,
    }
  }

  it('appends a Sources line for a verified claim citing a source', () => {
    const card = validCard('A card', { speakerNotes: 'Some spoken framing.' })
    const result = notesWithCitations(card, [claim()], pack)
    expect(result).toBe('Some spoken framing.\n\nSources: IEA, 2024')
  })

  it('leaves notes unchanged when no claim is verified', () => {
    const card = validCard('A card', { speakerNotes: 'Some spoken framing.' })
    const result = notesWithCitations(card, [claim({ verified: false })], pack)
    expect(result).toBe('Some spoken framing.')
  })

  it('leaves notes unchanged when the pack is null', () => {
    const card = validCard('A card', { speakerNotes: 'Some spoken framing.' })
    const result = notesWithCitations(card, [claim()], null)
    expect(result).toBe('Some spoken framing.')
  })

  it('de-duplicates publishers and lists them in first-cited order', () => {
    const card = validCard('A card', { speakerNotes: 'Some spoken framing.' })
    const claims = [
      claim({ id: 'c1-1', sourceIds: ['s1'] }),
      claim({ id: 'c1-2', sourceIds: ['s2'] }),
      claim({ id: 'c1-3', sourceIds: ['s1'] }),
    ]
    const result = notesWithCitations(card, claims, pack)
    expect(result).toBe('Some spoken framing.\n\nSources: IEA, 2024; U.S. DOE, 2023')
  })
})
