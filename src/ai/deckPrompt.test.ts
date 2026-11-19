import { describe, expect, it } from 'vitest'
import {
  DECK_SYSTEM_PROMPT,
  DEFAULT_TONE,
  buildDeckUserPrompt,
  deckMaxTokens,
  geminiDeckMaxTokens,
  type DeckContext,
} from './prompts'
import { PLAIN_LANGUAGE_RULES } from './plainLanguage'
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

  /*
    Decks came out as nearly all list/card slides: the prompt called visualType
    "a planning signal, not a rendering instruction", so plans varied while the
    blocks (which are what actually get drawn) stayed `heading + bulletList`.
  */
  it('binds plan.visualType to the blocks instead of calling it a planning-only signal', () => {
    expect(DECK_SYSTEM_PROMPT).not.toMatch(/planning signal, not a rendering instruction/)
    expect(DECK_SYSTEM_PROMPT).toMatch(/must be the structure the blocks actually deliver/)
  })

  it('frames bulletList as a fallback and asks for the structure before the wording', () => {
    expect(DECK_SYSTEM_PROMPT).toMatch(/information structure before you choose its wording/)
    expect(DECK_SYSTEM_PROMPT).toMatch(/not the default/)
  })

  it('states the deck-level list cap and the no-adjacent-lists rule the validator enforces', () => {
    expect(DECK_SYSTEM_PROMPT).toMatch(/no more than about 40%/)
    expect(DECK_SYSTEM_PROMPT).toMatch(/never put two "bulletList" slides next to each other/)
  })

  it('tells the writer charts and diagrams cannot be drawn, so it does not plan them', () => {
    expect(DECK_SYSTEM_PROMPT).toMatch(/cannot draw charts/)
  })

  it('no longer says photos or illustrations cannot be drawn; photos arrive through imageQuery', () => {
    expect(DECK_SYSTEM_PROMPT).not.toContain('photos or illustrations')
    expect(DECK_SYSTEM_PROMPT).toContain('"imageQuery"')
  })

  it('has an IMAGES section with the query rules, and still forbids writing image blocks', () => {
    expect(DECK_SYSTEM_PROMPT).toMatch(/\nIMAGES\n/)
    expect(DECK_SYSTEM_PROMPT).toMatch(/2-6 concrete English words/)
    expect(DECK_SYSTEM_PROMPT).toMatch(/title slide/i)
    expect(DECK_SYSTEM_PROMPT).toMatch(/never write an "image" block/i)
  })

  it('no longer asks for layoutFamily, which nothing read', () => {
    expect(DECK_SYSTEM_PROMPT).not.toContain('layoutFamily')
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

  /*
    The detail level used to change one sentence while every level shared the
    same hard word limits (and "detailed" was told to stay inside them), so
    Balanced and Detailed decks came out the same. Each level now carries its
    own SLIDE DENSITY numbers.
  */
  it('carries a different SLIDE DENSITY section for each detail level', () => {
    const prompts = (['simplified', 'balanced', 'detailed'] as const).map((detailLevel) =>
      buildDeckUserPrompt('Electric vehicles', { ...BRIEF, detailLevel }),
    )
    for (const prompt of prompts) expect(prompt).toContain('SLIDE DENSITY')
    expect(prompts[0]).toContain('10-30 words, 40 at most')
    expect(prompts[1]).toContain('20-40 words, 55 at most')
    expect(prompts[2]).toContain('50-90 words, 110 at most')
    expect(prompts[2]).toContain('each 14 words or fewer')
  })

  it('no longer tells a detailed deck to keep the slide inside the balanced limits', () => {
    const prompt = buildDeckUserPrompt('Electric vehicles', { ...BRIEF, detailLevel: 'detailed' })
    expect(prompt).not.toMatch(/within the visible-text limits/)
  })
})

describe('DECK_SYSTEM_PROMPT density', () => {
  it('states no fixed word limit of its own, leaving it to SLIDE DENSITY', () => {
    expect(DECK_SYSTEM_PROMPT).not.toContain('20-40 words')
    expect(DECK_SYSTEM_PROMPT).not.toContain('35 words or fewer')
    expect(DECK_SYSTEM_PROMPT).toContain('SLIDE DENSITY')
  })
})

describe('deckMaxTokens by detail level', () => {
  it('gives a detailed deck more room, under the same ceiling', () => {
    expect(deckMaxTokens(7, 'detailed')).toBeGreaterThan(deckMaxTokens(7, 'balanced'))
    expect(deckMaxTokens(7, 'detailed')).toBeLessThanOrEqual(7000)
    expect(geminiDeckMaxTokens(7, 'detailed')).toBeGreaterThan(geminiDeckMaxTokens(7, 'balanced'))
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

/*
  Part 2 of the structured blocks: the model may now write a heading kicker,
  "point", "callout" and "code" blocks. The prompt grows by a pinned amount over
  its length before that work (Groq counts input against ~8,000 tokens a
  minute), and carries no long dash (models copy their prompt's punctuation).
*/
const DECK_BASE_LENGTH = 15575
const DECK_GROWTH_CAP = 1600

describe('DECK_SYSTEM_PROMPT (structured blocks)', () => {
  it('lists the four new block shapes beside the old ones', () => {
    expect(DECK_SYSTEM_PROMPT).toContain('{ "type": "heading", "text": string, "kicker"?: string }')
    expect(DECK_SYSTEM_PROMPT).toContain('{ "type": "point", "label": string, "text": string }')
    expect(DECK_SYSTEM_PROMPT).toContain('{ "type": "callout", "label"?: string, "text": string }')
    expect(DECK_SYSTEM_PROMPT).toContain('{ "type": "code", "code": string, "label"?: string, "caption"?: string }')
  })

  it('still refuses an image block and any other type', () => {
    expect(DECK_SYSTEM_PROMPT).toContain('never write an "image" block yourself')
  })

  it('has headings state the point, with a question or topic label only where a part opens', () => {
    expect(DECK_SYSTEM_PROMPT).not.toMatch(/a topic label, a clear claim, or a question/i)
    expect(DECK_SYSTEM_PROMPT).toContain("State the slide's point as a short claim")
    expect(DECK_SYSTEM_PROMPT).toMatch(/question or topic label only for the title slide or a slide that opens a part/)
  })

  it('teaches the kicker: 1-3 words, shared by a part, never on the title slide, never the heading', () => {
    expect(DECK_SYSTEM_PROMPT).toMatch(/^KICKER$/m)
    expect(DECK_SYSTEM_PROMPT).toContain('1-3 words naming the part of the talk or topic')
    expect(DECK_SYSTEM_PROMPT).toContain('never on the title slide')
    expect(DECK_SYSTEM_PROMPT).toContain('Never repeat the heading')
  })

  it('binds definitions to a run of points and code_example to one code block, for programming only', () => {
    expect(DECK_SYSTEM_PROMPT).toMatch(/run of "point" blocks.*"definitions"/)
    expect(DECK_SYSTEM_PROMPT).toMatch(/one "code" block.*"code_example"/)
    expect(DECK_SYSTEM_PROMPT).toContain("only when the deck's subject is programming or computing")
    expect(DECK_SYSTEM_PROMPT).toContain('"definitions" needs 2+ "point" blocks')
    expect(DECK_SYSTEM_PROMPT).toContain('"code_example" needs a "code" block')
  })

  it('names both new visual types in the enum list it is built from', () => {
    expect(DECK_SYSTEM_PROMPT).toMatch(/"visualType": .*"definitions".*"code_example"/)
  })

  it('teaches the callout: the single key takeaway, one per slide, about one slide in three', () => {
    expect(DECK_SYSTEM_PROMPT).toContain('single most important takeaway')
    expect(DECK_SYSTEM_PROMPT).toContain('"Key idea", "Remember" or "Watch out"')
    expect(DECK_SYSTEM_PROMPT).toContain('at most one per slide')
    expect(DECK_SYSTEM_PROMPT).toContain('about one slide in three')
  })

  it('keeps a definitions or code slide to its heading, one short paragraph and its points or code', () => {
    expect(DECK_SYSTEM_PROMPT).toMatch(/"definitions" or "code_example" slide holds only its heading, at most one short paragraph/)
  })

  it('skips photos on definitions and code slides, and tells notes to explain code, not read it out', () => {
    expect(DECK_SYSTEM_PROMPT).toMatch(/Skip "definitions" and "code_example" slides/)
    expect(DECK_SYSTEM_PROMPT).toContain('character by character')
  })

  it('states no point, callout or code size of its own (SLIDE DENSITY carries them)', () => {
    expect(DECK_SYSTEM_PROMPT).not.toMatch(/\b12 lines|\b60 characters/)
  })

  it('has no long dash outside the plain-language rule that bans them', () => {
    expect(DECK_SYSTEM_PROMPT.replace(PLAIN_LANGUAGE_RULES, '')).not.toMatch(/[—–]/)
  })

  it(`grows by at most ${DECK_GROWTH_CAP} characters over its ${DECK_BASE_LENGTH}-character base`, () => {
    expect(DECK_SYSTEM_PROMPT.length).toBeLessThanOrEqual(DECK_BASE_LENGTH + DECK_GROWTH_CAP)
  })
})
