import { describe, expect, it } from 'vitest'
import { REPAIR_MAX_TOKENS, REPAIR_SYSTEM_PROMPT, buildRepairUserPrompt, parseRepairResponse } from './repairPrompt'
import type { DeckContext } from './prompts'
import type { GeneratedDeck, QualityFlag } from '@/generation/schemas'

function card(heading: string, keyMessage: string, speakerNotes: string) {
  return {
    plan: {
      purpose: 'context',
      audienceQuestion: 'Why does this matter?',
      keyMessage,
      visualType: 'text',
      layoutFamily: 'list',
      transition: '',
      importance: 'supporting',
    },
    role: undefined,
    blocks: [{ type: 'heading', text: heading }],
    visualStyle: 'structured',
    speakerNotes,
    claims: [],
  }
}

const DECK: GeneratedDeck = {
  title: 'Electric vehicles in 2026',
  blueprint: 'inform',
  brief: {
    objective: 'Explain the state of EV adoption',
    audienceKnowledgeLevel: 'beginner',
    presentationType: 'educational',
    freshnessRequired: true,
    keyQuestions: ['Why now?'],
  },
  cards: [
    card('EV adoption is accelerating', 'EVs are going mainstream fast.', 'Notes for slide one, unique marker ALPHA.'),
    card(
      'This presentation explains a very long and rambling heading that goes on and on',
      'The heading is too long and needs tightening.',
      'Notes for slide two, unique marker BETA.',
    ),
    card('What comes next', 'Recommend three concrete next steps.', 'Notes for slide three, unique marker GAMMA.'),
  ],
} as GeneratedDeck

const FLAGS: QualityFlag[] = [
  {
    type: 'TITLE_TOO_LONG',
    severity: 'medium',
    slideIndex: 1,
    message: 'Heading is 14 words, over the 10-word target.',
    suggestedAction: 'Tighten the heading to 10 words or fewer.',
  },
]

const CONTEXT: DeckContext = { evidence: null, today: '2026-09-19' }

describe('REPAIR_SYSTEM_PROMPT', () => {
  it('says it is fixing specific slides, not writing a new deck', () => {
    expect(REPAIR_SYSTEM_PROMPT).toMatch(/fixing specific slides|repairing/i)
  })

  it('describes the repairs-only JSON reply shape', () => {
    expect(REPAIR_SYSTEM_PROMPT).toContain('repairs')
    expect(REPAIR_SYSTEM_PROMPT).toContain('slide')
    expect(REPAIR_SYSTEM_PROMPT).toContain('card')
  })
})

describe('buildRepairUserPrompt', () => {
  const prompt = buildRepairUserPrompt(DECK, [1], FLAGS, CONTEXT)

  it('names the target as its 1-based slide number', () => {
    expect(prompt).toContain('2')
    expect(prompt).toMatch(/slide 2/i)
  })

  it("includes the target's flag suggestedAction", () => {
    expect(prompt).toContain('Tighten the heading to 10 words or fewer.')
  })

  it('does not include the full card JSON for non-target slides', () => {
    // speakerNotes only ever appears inside a target's full card JSON, so a
    // non-target's speakerNotes text is a clean marker for "was the whole
    // card sent", separate from the compact heading+keyMessage summary line
    // every slide gets.
    expect(prompt).not.toContain('Notes for slide one, unique marker ALPHA.')
    expect(prompt).not.toContain('Notes for slide three, unique marker GAMMA.')
    expect(prompt).toContain('Notes for slide two, unique marker BETA.')
  })

  it('includes today\'s date', () => {
    expect(prompt).toContain('2026-09-19')
  })
})

describe('parseRepairResponse', () => {
  it('returns null for garbage', () => {
    expect(parseRepairResponse('not json at all')).toBeNull()
  })

  it('parses a well-formed repairs response', () => {
    const raw = JSON.stringify({ repairs: [{ slide: 2, card: { blocks: [{ type: 'heading', text: 'Shorter title' }] } }] })
    const result = parseRepairResponse(raw)
    expect(result).not.toBeNull()
    expect(result?.repairs).toHaveLength(1)
    expect(result?.repairs[0]?.slide).toBe(2)
  })
})

describe('REPAIR_MAX_TOKENS', () => {
  it('is 6000', () => {
    expect(REPAIR_MAX_TOKENS).toBe(6000)
  })
})
