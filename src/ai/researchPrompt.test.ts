import { describe, expect, it } from 'vitest'
import {
  RESEARCH_SYSTEM_PROMPT,
  buildResearchUserPrompt,
  isUserMaterialOnly,
  parseEvidencePack,
} from './researchPrompt'
import { DEFAULT_TONE } from './prompts'

const BRIEF = {
  audience: 'general public',
  detailLevel: 'balanced' as const,
  tone: DEFAULT_TONE,
  slideCount: 6 as const,
  guidance: '',
}

function cleanReply(): string {
  return JSON.stringify({
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
  })
}

describe('RESEARCH_SYSTEM_PROMPT', () => {
  it('asks for the JSON shape the parser expects', () => {
    for (const field of ['sources', 'findings', 'disagreements', 'sourceIds', 'confidence']) {
      expect(RESEARCH_SYSTEM_PROMPT).toContain(field)
    }
  })
})

describe('buildResearchUserPrompt', () => {
  it('carries the topic, audience, detail level, guidance and today', () => {
    const prompt = buildResearchUserPrompt('Electric vehicles', { ...BRIEF, guidance: 'focus on costs' }, '2026-09-19')
    expect(prompt).toContain('Electric vehicles')
    expect(prompt).toContain('general public')
    expect(prompt).toContain('balanced')
    expect(prompt).toContain('focus on costs')
    expect(prompt).toContain('2026-09-19')
  })
})

describe('parseEvidencePack', () => {
  it('parses a clean JSON reply', () => {
    const pack = parseEvidencePack(cleanReply())
    expect(pack).not.toBeNull()
    expect(pack?.sources).toHaveLength(1)
    expect(pack?.findings).toHaveLength(1)
  })

  it('parses a reply wrapped in prose and ```json fences with 【4†L7-L9】 markers', () => {
    const wrapped = `Here is what I found:\n\`\`\`json\n${cleanReply()}\n\`\`\`\nHope that helps.【4†L7-L9】`
    const pack = parseEvidencePack(wrapped)
    expect(pack).not.toBeNull()
    expect(pack?.sources[0]?.id).toBe('s1')
  })

  it('drops a finding citing an unknown source id', () => {
    const raw = JSON.stringify({
      sources: [{ id: 's1', title: 'A', publisher: 'IEA', url: 'https://x', sourceType: 'government' }],
      findings: [
        { statement: 'ok', sourceIds: ['s1'] },
        { statement: 'bad', sourceIds: ['s99'] },
      ],
      disagreements: [],
    })
    const pack = parseEvidencePack(raw)
    expect(pack?.findings).toHaveLength(1)
    expect(pack?.findings[0]?.statement).toBe('ok')
  })

  it('drops a source with neither url nor publisher, and any finding that cited only it', () => {
    const raw = JSON.stringify({
      sources: [
        { id: 's1', title: 'Good', publisher: 'IEA', sourceType: 'government' },
        { id: 's2', title: 'Bad', publisher: '', sourceType: 'other' },
      ],
      findings: [
        { statement: 'from good', sourceIds: ['s1'] },
        { statement: 'from bad only', sourceIds: ['s2'] },
      ],
      disagreements: [],
    })
    const pack = parseEvidencePack(raw)
    expect(pack?.sources).toHaveLength(1)
    expect(pack?.sources[0]?.id).toBe('s1')
    expect(pack?.findings).toHaveLength(1)
    expect(pack?.findings[0]?.statement).toBe('from good')
  })

  it('returns null for non-JSON', () => {
    expect(parseEvidencePack('sorry, I could not find anything useful.')).toBeNull()
  })

  it('returns null when no finding survives', () => {
    const raw = JSON.stringify({
      sources: [{ id: 's1', title: 'A', publisher: '', sourceType: 'other' }],
      findings: [{ statement: 'orphaned', sourceIds: ['s1'] }],
      disagreements: [],
    })
    expect(parseEvidencePack(raw)).toBeNull()
  })
})

describe('isUserMaterialOnly', () => {
  it('is true for "Only use the facts I gave you"', () => {
    expect(isUserMaterialOnly('Only use the facts I gave you')).toBe(true)
  })

  it('is false for "focus on costs"', () => {
    expect(isUserMaterialOnly('focus on costs')).toBe(false)
  })
})
