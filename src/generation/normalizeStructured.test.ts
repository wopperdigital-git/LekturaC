import { describe, expect, it } from 'vitest'
import { stripEmphasis } from '@/engine/emphasis'
import { KICKER_MAX_CHARS, KICKER_MAX_WORDS, normalizeStructuredBlocks } from './normalizeStructured'
import { generatedDeckSchema, type GeneratedCard, type GeneratedDeck } from './schemas'
import { validateDeck } from './validation/validateDeck'

type Blocks = GeneratedCard['blocks']

function card(blocks: Blocks, visualType: GeneratedCard['plan']['visualType'] = 'text'): GeneratedCard {
  return {
    plan: {
      purpose: 'concept_explanation',
      audienceQuestion: 'What matters here?',
      keyMessage: 'A message worth telling.',
      visualType,
      layoutFamily: 'list',
      transition: '',
      importance: 'supporting',
    },
    blocks,
    visualStyle: 'structured',
    speakerNotes: 'Extra spoken framing the presenter adds well past the wording on the card.',
    claims: [],
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

const H = (text: string, kicker?: string): Blocks[number] =>
  kicker === undefined ? { type: 'heading', text } : { type: 'heading', text, kicker }
const P = (label: string, text: string): Blocks[number] => ({ type: 'point', label, text })
const C = (text: string, label?: string): Blocks[number] =>
  label === undefined ? { type: 'callout', text } : { type: 'callout', label, text }
const para = (text: string): Blocks[number] => ({ type: 'paragraph', text })

/** Slide 0 is a title slide: the rules about later slides need a card in front. */
function after(...cards: GeneratedCard[]): GeneratedDeck {
  return deck([card([H('Title')]), ...cards])
}

describe('normalizeStructuredBlocks', () => {
  it('exports the kicker limits', () => {
    expect(KICKER_MAX_WORDS).toBe(4)
    expect(KICKER_MAX_CHARS).toBe(32)
  })

  describe('kickers', () => {
    it('drops the kicker of the title slide heading, omitting the key', () => {
      const out = normalizeStructuredBlocks(deck([card([H('Title', 'Intro'), para('A line')])]))
      expect(out.cards[0].blocks[0]).toStrictEqual({ type: 'heading', text: 'Title' })
    })

    it('keeps a short kicker on a later slide', () => {
      const d = after(card([H('Why', 'Chapter one'), para('x')]))
      expect(normalizeStructuredBlocks(d)).toBe(d)
    })

    it('removes a kicker of more than four words, and keeps one of exactly four', () => {
      const out = normalizeStructuredBlocks(
        after(card([H('A', 'one two three four five')]), card([H('B', 'one two three four')])),
      )
      expect(out.cards[1].blocks[0]).toStrictEqual({ type: 'heading', text: 'A' })
      expect(out.cards[2].blocks[0]).toStrictEqual({ type: 'heading', text: 'B', kicker: 'one two three four' })
    })

    it('removes a kicker over 32 characters, and keeps one of exactly 32', () => {
      const long = 'x'.repeat(33)
      const edge = 'y'.repeat(32)
      const out = normalizeStructuredBlocks(after(card([H('A', long)]), card([H('B', edge)])))
      expect(out.cards[1].blocks[0]).toStrictEqual({ type: 'heading', text: 'A' })
      expect(out.cards[2].blocks[0]).toStrictEqual({ type: 'heading', text: 'B', kicker: edge })
    })

    it('measures a kicker after trimming it', () => {
      const d = after(card([H('A', `  ${'y'.repeat(32)}  `)]))
      expect(normalizeStructuredBlocks(d)).toBe(d)
    })

    it('treats an undefined kicker as absent', () => {
      const withUndefined = { type: 'heading', text: 'A', kicker: undefined } as Blocks[number]
      const d = after(card([withUndefined, para('x')]))
      expect(normalizeStructuredBlocks(d)).toBe(d)
    })
  })

  describe('callouts', () => {
    it('keeps the first callout and turns each later one into a paragraph with its label', () => {
      const out = normalizeStructuredBlocks(
        after(card([H('A'), C('First idea', 'Key'), C('Second idea', 'Also'), C('Third idea')])),
      )
      expect(out.cards[1].blocks).toStrictEqual([
        H('A'),
        C('First idea', 'Key'),
        para('Also: Second idea'),
        para('Third idea'),
      ])
    })

    it('leaves a single callout alone', () => {
      const d = after(card([H('A'), C('Only idea')]))
      expect(normalizeStructuredBlocks(d)).toBe(d)
    })
  })

  describe('points', () => {
    it('turns a lone point into a paragraph that leads with its bold term', () => {
      const out = normalizeStructuredBlocks(after(card([H('A'), P('Latency', 'How long a request waits.')])))
      expect(out.cards[1].blocks[1]).toStrictEqual(para('**Latency**: How long a request waits.'))
    })

    it('keeps a run of two or more points', () => {
      const d = after(card([H('A'), P('One', 'first'), P('Two', 'second')], 'definitions'))
      expect(normalizeStructuredBlocks(d)).toBe(d)
    })

    it('keeps the run in [point, point, paragraph, point] and converts only the last', () => {
      const out = normalizeStructuredBlocks(
        after(card([H('A'), P('One', 'first'), P('Two', 'second'), para('between'), P('Three', 'third')])),
      )
      expect(out.cards[1].blocks).toStrictEqual([
        H('A'),
        P('One', 'first'),
        P('Two', 'second'),
        para('between'),
        para('**Three**: third'),
      ])
    })

    it('sets a definitions plan to text once no point is left', () => {
      const out = normalizeStructuredBlocks(after(card([H('A'), P('Term', 'meaning')], 'definitions')))
      expect(out.cards[1].plan.visualType).toBe('text')
    })

    it('keeps a definitions plan while a point remains', () => {
      const out = normalizeStructuredBlocks(
        after(card([H('A'), P('One', 'a'), P('Two', 'b'), para('x'), P('Lone', 'c')], 'definitions')),
      )
      expect(out.cards[1].plan.visualType).toBe('definitions')
    })

    it('leaves other plans alone when it converts a point', () => {
      const out = normalizeStructuredBlocks(after(card([H('A'), P('Term', 'meaning')], 'mixed')))
      expect(out.cards[1].plan.visualType).toBe('mixed')
    })

    it('does not touch a definitions plan on a card it did not convert', () => {
      const d = after(card([H('A'), para('no points here')], 'definitions'))
      expect(normalizeStructuredBlocks(d)).toBe(d)
    })

    it('leaves the asterisks off a label that holds one, so ingest never mis-pairs them', () => {
      const out = normalizeStructuredBlocks(after(card([H('A'), P('a*b', 'pointer maths')])))
      expect(out.cards[1].blocks[1]).toStrictEqual(para('a*b: pointer maths'))
    })

    it('writes a converted point so ingest turns the term into a bold mark', () => {
      const out = normalizeStructuredBlocks(after(card([H('A'), P('Latency', 'How long a request waits.')])))
      const block = out.cards[1].blocks[1]
      if (block.type !== 'paragraph') throw new Error('expected a paragraph')
      const stripped = stripEmphasis(block.text)
      expect(stripped.text).toBe('Latency: How long a request waits.')
      expect(stripped.marks).toStrictEqual([{ start: 0, end: 7, type: 'bold' }])
    })
  })

  describe('as a whole', () => {
    it('returns a deck that needs nothing as the same object with every card identical', () => {
      const d = after(
        card([H('A', 'Part one'), C('Idea', 'Key'), P('One', 'a'), P('Two', 'b')], 'definitions'),
        card([H('B'), para('text')]),
      )
      const out = normalizeStructuredBlocks(d)
      expect(out).toBe(d)
      out.cards.forEach((c, i) => expect(c).toBe(d.cards[i]))
    })

    it('keeps the identity of untouched cards and never mutates the input', () => {
      const clean = card([H('Clean'), para('fine')])
      const dirty = card([H('Dirty', 'one two three four five six'), C('a'), C('b'), P('Lone', 'x')], 'definitions')
      const d = after(clean, dirty)
      const before = structuredClone(d)

      const out = normalizeStructuredBlocks(d)

      expect(d).toStrictEqual(before)
      expect(out.cards).toHaveLength(d.cards.length)
      expect(out.cards[0]).toBe(d.cards[0])
      expect(out.cards[1]).toBe(clean)
      expect(out.cards[2]).not.toBe(dirty)
    })

    it('is idempotent', () => {
      const d = after(
        card([H('A', 'one two three four five six'), C('a', 'k'), C('b'), P('Lone', 'x'), P('Also', 'y')], 'definitions'),
      )
      const once = normalizeStructuredBlocks(d)
      const twice = normalizeStructuredBlocks(once)
      expect(twice).toBe(once)
    })

    it('keeps every word of a converted block in its paragraph', () => {
      const d = after(card([H('A'), C('Second idea here', 'Remember'), C('Third idea', 'Note'), P('Term', 'its meaning')]))
      const out = normalizeStructuredBlocks(d)
      const text = out.cards[1].blocks.map((b) => ('text' in b ? b.text : '')).join(' ')
      for (const word of ['Note', 'Third', 'idea', 'Term', 'its', 'meaning']) expect(text).toContain(word)
    })

    it('cleans one deck with three callouts, a lone point, a long kicker and a title kicker, with no new VISUAL_MISMATCH', () => {
      const d = deck([
        card([H('Title', 'Welcome'), para('A short opening line.')]),
        card(
          [H('Ideas', 'one two three four five six'), C('One', 'A'), C('Two', 'B'), C('Three', 'C'), P('Term', 'meaning')],
          'definitions',
        ),
      ])
      const out = normalizeStructuredBlocks(d)

      expect(out.cards[0].blocks[0]).toStrictEqual({ type: 'heading', text: 'Title' })
      const blocks = out.cards[1].blocks
      expect(blocks[0]).toStrictEqual({ type: 'heading', text: 'Ideas' })
      expect(blocks.filter((b) => b.type === 'callout')).toHaveLength(1)
      expect(blocks.filter((b) => b.type === 'point')).toHaveLength(0)
      expect(blocks).toContainEqual(para('**Term**: meaning'))
      expect(out.cards[1].plan.visualType).toBe('text')

      const { flags } = validateDeck(out, {
        pack: null,
        currentYear: 2026,
        freshnessRequired: false,
        detailLevel: 'balanced',
      })
      expect(flags.filter((f) => f.type === 'VISUAL_MISMATCH')).toEqual([])
    })

    it('still parses as a generated deck after cleaning', () => {
      const out = normalizeStructuredBlocks(after(card([H('A', 'one two three four five six'), C('a'), C('b')])))
      expect(generatedDeckSchema.safeParse(out).success).toBe(true)
    })
  })
})
