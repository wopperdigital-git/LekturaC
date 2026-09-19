import { describe, expect, it } from 'vitest'
import {
  DECK_SYSTEM_PROMPT,
  DEFAULT_TONE,
  buildDeckUserPrompt,
  deckMaxTokens,
  geminiDeckMaxTokens,
  type DeckContext,
} from './prompts'
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

  it('marks "role" as optional in the output shape', () => {
    expect(DECK_SYSTEM_PROMPT).toContain('"role"?: string')
  })

  /*
    Fix round 1: the bulletList guidance used to say "5-7 items is the
    comfortable range", directly contradicting the "3-5 bullets" density rule
    a few lines above and the TOO_MANY_BULLETS validator's > 6 threshold. The
    cap is now stated once, at 6, with no other number in the prompt implying
    a higher one is fine.
  */
  it('does not contain the old, contradictory "5-7 items" bullet-count guidance', () => {
    expect(DECK_SYSTEM_PROMPT).not.toContain('5-7 items')
  })

  /*
    Fix round 1: "reach for this often" (VISUAL CHOICE) told the model to
    freely write quote blocks for a "testimonial" or "expert soundbite",
    which directly contradicts EVIDENCE's "never invent ... a quotation". A
    quote attributed to a real person/org must now come from the evidence
    pack; only the deck's own unattributed thesis/mission line is exempt.
  */
  it('does not contain the old "reach for this often" quote-block encouragement', () => {
    expect(DECK_SYSTEM_PROMPT).not.toContain('Reach for this often')
  })

  it('says a quote block must be the deck\'s own thesis line or a verbatim evidence-pack quotation, matching EVIDENCE and VISUAL CHOICE', () => {
    const quoteRuleCount = (DECK_SYSTEM_PROMPT.match(/quote.*(thesis|mission)/gi) ?? []).length
    expect(quoteRuleCount).toBeGreaterThanOrEqual(2)
    expect(DECK_SYSTEM_PROMPT).not.toMatch(/testimonial|soundbite/i)
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

describe('geminiDeckMaxTokens', () => {
  it.each([
    [1, 6000],
    [5, 6500],
    [10, 10000],
    [13, 12000],
    [20, 12000],
  ])('geminiDeckMaxTokens(%i) === %i', (count, expected) => {
    expect(geminiDeckMaxTokens(count)).toBe(expected)
  })

  it("'auto' clamps to the ceiling", () => {
    expect(geminiDeckMaxTokens('auto')).toBe(12000)
  })

  it('is not the same budget as deckMaxTokens at the same count', () => {
    // Gemini's window has nothing to do with Groq's free-tier TPM cap that
    // deckMaxTokens is tuned to — the two must be independent functions, not
    // one shared formula.
    expect(geminiDeckMaxTokens(5)).not.toBe(deckMaxTokens(5))
  })
})
