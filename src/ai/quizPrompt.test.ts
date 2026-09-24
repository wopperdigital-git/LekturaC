import { describe, expect, it } from 'vitest'
import type { Card } from '@/engine/contentBlocks'
import {
  MAX_SLIDE_CHARS,
  MAX_TOTAL_CHARS,
  QUIZ_SYSTEM_PROMPT,
  buildQuizUserPrompt,
  hasQuizContent,
  quizMaxTokens,
  quizSlides,
} from './quizPrompt'

function card(orderIndex: number, heading: string, bullets: string[]): Card {
  return {
    id: `c${orderIndex}`,
    orderIndex,
    layout: 'auto',
    visualStyle: 'structured',
    blocks: [
      { type: 'heading', text: heading },
      ...(bullets.length ? [{ type: 'bulletList' as const, items: bullets }] : []),
    ],
  } as Card
}

describe('quizSlides', () => {
  it('numbers slides from 1 and separates the heading from its lines', () => {
    const slides = quizSlides([card(0, 'Intro', ['a', 'b']), card(1, 'Cells', ['c'])])
    expect(slides).toEqual([
      { slide: 1, heading: 'Intro', lines: ['a', 'b'] },
      { slide: 2, heading: 'Cells', lines: ['c'] },
    ])
  })

  it('keeps whole lines under the per-slide budget and cuts the rest', () => {
    const long = 'x'.repeat(400)
    const [s] = quizSlides([card(0, 'H', [long, long, long])])
    expect(s.lines).toHaveLength(1)
    expect(s.lines.join('').length).toBeLessThanOrEqual(MAX_SLIDE_CHARS)
  })

  it('truncates a single over-long line with an ellipsis', () => {
    const [s] = quizSlides([card(0, 'H', ['y'.repeat(2000)])])
    expect(s.lines[0].length).toBeLessThanOrEqual(MAX_SLIDE_CHARS)
    expect(s.lines[0].endsWith('…')).toBe(true)
  })

  it('shares the total budget across many slides', () => {
    const cards = Array.from({ length: 20 }, (_, i) => card(i, `S${i}`, ['z'.repeat(590)]))
    const slides = quizSlides(cards)
    expect(slides).toHaveLength(20)
    const total = slides.reduce((n, s) => n + s.lines.join('').length, 0)
    expect(total).toBeLessThanOrEqual(MAX_TOTAL_CHARS)
  })
})

describe('hasQuizContent', () => {
  it('needs at least one card with body text beyond its heading', () => {
    expect(hasQuizContent([])).toBe(false)
    expect(hasQuizContent([card(0, 'Only a heading', [])])).toBe(false)
    expect(hasQuizContent([card(0, 'H', ['a point'])])).toBe(true)
  })
})

describe('buildQuizUserPrompt', () => {
  const slides = [{ slide: 1, heading: 'Intro', lines: ['Cells are small'] }]

  it('states the exact count, the title and each slide', () => {
    const p = buildQuizUserPrompt({ title: 'Biology', slides, count: 7, config: { type: 'true_false', notation: 'word' } })
    expect(p).toContain('Biology')
    expect(p).toContain('exactly 7')
    expect(p).toContain('Slide 1: Intro')
    expect(p).toContain('- Cells are small')
  })

  it('gives multiple choice the right choice count and reply shape', () => {
    const three = buildQuizUserPrompt({ title: 'T', slides, count: 3, config: { type: 'multiple_choice', choiceCount: 3 } })
    expect(three).toContain('exactly 3 choices')
    expect(three).toContain('answerIndex')
    const four = buildQuizUserPrompt({ title: 'T', slides, count: 3, config: { type: 'multiple_choice', choiceCount: 4 } })
    expect(four).toContain('exactly 4 choices')
  })

  it('gives fill in the blank its blank marker and accepted alternates', () => {
    const p = buildQuizUserPrompt({ title: 'T', slides, count: 3, config: { type: 'fill_blank', wordBox: true } })
    expect(p).toContain('_____')
    expect(p).toContain('"accepted"')
  })

  it('asks true/false for a balanced mix', () => {
    const p = buildQuizUserPrompt({ title: 'T', slides, count: 4, config: { type: 'true_false', notation: 'letter' } })
    expect(p).toContain('half')
    expect(p).toContain('"answer":true')
  })

  it('always asks for JSON only and for slide citations', () => {
    expect(QUIZ_SYSTEM_PROMPT).toContain('ONLY a JSON object')
    expect(QUIZ_SYSTEM_PROMPT).toContain('"slide"')
  })
})

describe('quizMaxTokens', () => {
  it('stays inside the reasoning floor and the Groq TPM ceiling', () => {
    expect(quizMaxTokens(1)).toBe(5200)
    expect(quizMaxTokens(10)).toBe(5200) // 10*110 + 3800 = 4900, below the floor
    expect(quizMaxTokens(20)).toBe(6000)
    expect(quizMaxTokens(500)).toBe(7000)
  })
})
