import { describe, expect, it } from 'vitest'
import { DECK_SYSTEM_PROMPT, DEFAULT_TONE, buildDeckUserPrompt, deckMaxTokens, type DeckContext } from './prompts'
import type { EvidencePack } from '@/generation/schemas'

const BRIEF = {
  audience: 'general public',
  detailLevel: 'balanced' as const,
  tone: DEFAULT_TONE,
  slideCount: 6 as const,
  guidance: '',
}

const PACK: EvidencePack = {
  sources: [
    {
      id: 's1',
      title: 'Global EV Outlook 2024',
      publisher: 'IEA',
      url: 'https://iea.org/ev-outlook-2024',
      publicationDate: '2024',
      sourceType: 'government',
    },
  ],
  findings: [
    {
      statement: 'battery-electric share of new U.S. light-duty vehicle sales',
      value: '9',
      unit: '%',
      geography: 'United States',
      year: 2024,
      definition: 'new light-duty vehicle sales',
      sourceIds: ['s1'],
      confidence: 0.8,
    },
  ],
  disagreements: [],
}

describe('DECK_SYSTEM_PROMPT (v2)', () => {
  it('carries every v2 field name a model must return', () => {
    for (const field of ['speakerNotes', 'plan', 'claims', 'keyMessage']) {
      expect(DECK_SYSTEM_PROMPT).toContain(field)
    }
  })

  it('drops the old full-sentence-assertion heading rule entirely', () => {
    expect(DECK_SYSTEM_PROMPT).not.toContain('FULL-SENTENCE')
  })
})

describe('buildDeckUserPrompt', () => {
  it('includes the given today date and an evidence pack section when one is given', () => {
    const context: DeckContext = { evidence: PACK, today: '2026-09-19' }
    const prompt = buildDeckUserPrompt('Electric vehicles', BRIEF, context)
    expect(prompt).toContain('2026-09-19')
    expect(prompt).toContain('EVIDENCE PACK')
    expect(prompt).toContain('[s1]')
  })

  it('includes neither the pack header nor a source id when evidence is null, but does explain the no-evidence rules apply', () => {
    const context: DeckContext = { evidence: null, today: '2026-09-19' }
    const prompt = buildDeckUserPrompt('Electric vehicles', BRIEF, context)
    expect(prompt).toContain('2026-09-19')
    expect(prompt).not.toContain('EVIDENCE PACK')
    expect(prompt).not.toContain('[s1]')
    expect(prompt).toMatch(/no verified evidence|no-evidence/i)
  })

  it('stays callable with just topic and brief, as the existing providers call it', () => {
    expect(() => buildDeckUserPrompt('Electric vehicles', BRIEF)).not.toThrow()
  })
})

describe('deckMaxTokens', () => {
  it.each([
    [1, 5200],
    [5, 5200],
    [8, 6440],
    [10, 7000],
    [20, 7000],
  ])('deckMaxTokens(%i) === %i', (count, expected) => {
    expect(deckMaxTokens(count)).toBe(expected)
  })

  it("'auto' clamps to the ceiling", () => {
    expect(deckMaxTokens('auto')).toBe(7000)
  })
})
