import { describe, expect, it } from 'vitest'
import type { GeneratedCard, GeneratedDeck } from '../schemas'
import { structureFlags } from './structure'
import { visibleLines } from './text'

/** N space-separated placeholder words — enough to hit an exact word-count threshold. */
function words(n: number): string {
  return Array.from({ length: n }, (_, i) => `word${i}`).join(' ')
}

type PlanOverrides = Partial<GeneratedCard['plan']>

interface CardOverrides {
  plan?: PlanOverrides
  blocks?: GeneratedCard['blocks']
  speakerNotes?: string
}

/** A card that, on its own, trips none of the rules — override only what a test cares about. */
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
    speakerNotes:
      overrides.speakerNotes ??
      'Extra spoken framing the presenter adds aloud that goes well past the wording on the card.',
    claims: [],
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

describe('structureFlags', () => {
  it('flags nothing for a clean, varied deck', () => {
    const cards: GeneratedCard[] = [
      card({
        blocks: [
          { type: 'heading', text: 'Welcome to the quarterly review' },
          { type: 'paragraph', text: 'A quick look at where things stand today.' },
        ],
        speakerNotes: 'Greet the room and preview the three topics coming up next.',
      }),
      card({
        plan: { visualType: 'metric_cards' },
        blocks: [
          { type: 'heading', text: 'Revenue is climbing' },
          { type: 'stat', value: '18%', label: 'growth versus last quarter' },
        ],
        speakerNotes: 'Explain how this figure was calculated and why finance trusts it.',
      }),
      card({
        plan: { visualType: 'two_column_comparison' },
        blocks: [
          { type: 'heading', text: 'Old plan versus new plan' },
          { type: 'comparisonGroup', heading: 'Old plan', items: ['Slower rollout'] },
          { type: 'comparisonGroup', heading: 'New plan', items: ['Faster rollout'] },
        ],
        speakerNotes: 'Walk through why leadership picked the faster option after the pilot.',
      }),
      card({
        plan: { visualType: 'timeline', purpose: 'timeline' },
        blocks: [
          { type: 'heading', text: 'How we got here' },
          { type: 'timelineStep', label: 'Q1', text: 'Kicked off the pilot program' },
          { type: 'timelineStep', label: 'Q2', text: 'Expanded to two more regions' },
        ],
        speakerNotes: 'Mention the team that ran the pilot before moving on to results.',
      }),
      card({
        plan: { purpose: 'conclusion', visualType: 'quote' },
        blocks: [
          { type: 'heading', text: 'Closing thought' },
          { type: 'quote', text: 'Momentum builds one quarter at a time.' },
        ],
        speakerNotes: 'Leave the audience with the single takeaway before questions.',
      }),
    ]
    expect(structureFlags(deck(cards))).toEqual([])
  })

  describe('TITLE_TOO_LONG', () => {
    it('does not flag a 10-word title', () => {
      const d = deck([card({ blocks: [{ type: 'heading', text: words(10) }, { type: 'paragraph', text: 'Body.' }] })])
      expect(structureFlags(d).filter((f) => f.type === 'TITLE_TOO_LONG')).toEqual([])
    })

    it('flags an 11-word title as low', () => {
      const d = deck([card({ blocks: [{ type: 'heading', text: words(11) }, { type: 'paragraph', text: 'Body.' }] })])
      const flags = structureFlags(d).filter((f) => f.type === 'TITLE_TOO_LONG')
      expect(flags).toHaveLength(1)
      expect(flags[0].severity).toBe('low')
      expect(flags[0].slideIndex).toBe(0)
    })

    it('flags a 15-word title as medium', () => {
      const d = deck([card({ blocks: [{ type: 'heading', text: words(15) }, { type: 'paragraph', text: 'Body.' }] })])
      const flags = structureFlags(d).filter((f) => f.type === 'TITLE_TOO_LONG')
      expect(flags).toHaveLength(1)
      expect(flags[0].severity).toBe('medium')
    })
  })

  describe('BODY_TOO_DENSE', () => {
    it('does not flag exactly 55 visible words', () => {
      const d = deck([card({ blocks: [{ type: 'heading', text: 'Title' }, { type: 'paragraph', text: words(55) }] })])
      expect(structureFlags(d).filter((f) => f.type === 'BODY_TOO_DENSE')).toEqual([])
    })

    it('flags 56 visible words as medium', () => {
      const d = deck([card({ blocks: [{ type: 'heading', text: 'Title' }, { type: 'paragraph', text: words(56) }] })])
      const flags = structureFlags(d).filter((f) => f.type === 'BODY_TOO_DENSE')
      expect(flags).toHaveLength(1)
      expect(flags[0].severity).toBe('medium')
      expect(flags[0].slideIndex).toBe(0)
    })

    it('does not flag a timeline-purpose slide even at 90 words', () => {
      const d = deck([
        card({
          plan: { purpose: 'timeline' },
          blocks: [{ type: 'heading', text: 'Title' }, { type: 'paragraph', text: words(90) }],
        }),
      ])
      expect(structureFlags(d).filter((f) => f.type === 'BODY_TOO_DENSE')).toEqual([])
    })

    it('does not flag a references-purpose slide even at 90 words', () => {
      const d = deck([
        card({
          plan: { purpose: 'references' },
          blocks: [{ type: 'heading', text: 'Title' }, { type: 'paragraph', text: words(90) }],
        }),
      ])
      expect(structureFlags(d).filter((f) => f.type === 'BODY_TOO_DENSE')).toEqual([])
    })

    it('does not flag a card with a timelineStep block even at 90 words, whatever its purpose', () => {
      const d = deck([
        card({
          blocks: [
            { type: 'heading', text: 'Title' },
            { type: 'timelineStep', label: 'Step', text: words(90) },
          ],
        }),
      ])
      expect(structureFlags(d).filter((f) => f.type === 'BODY_TOO_DENSE')).toEqual([])
    })

    it('does not flag a card with a quote block even at 90 words, whatever its purpose', () => {
      const d = deck([
        card({
          blocks: [{ type: 'heading', text: 'Title' }, { type: 'quote', text: words(90) }],
        }),
      ])
      expect(structureFlags(d).filter((f) => f.type === 'BODY_TOO_DENSE')).toEqual([])
    })
  })

  describe('density by detail level', () => {
    const body = (n: number) =>
      card({ blocks: [{ type: 'heading', text: 'Title' }, { type: 'paragraph', text: words(n) }] })
    const of = (type: string, d: GeneratedDeck, level: 'simplified' | 'balanced' | 'detailed') =>
      structureFlags(d, level).filter((f) => f.type === type)

    it('lets a detailed slide carry 100 words that a balanced one may not', () => {
      const d = deck([body(100)])
      expect(of('BODY_TOO_DENSE', d, 'detailed')).toEqual([])
      expect(of('BODY_TOO_DENSE', d, 'balanced')).toHaveLength(1)
    })

    it('flags a simplified slide past 40 words', () => {
      expect(of('BODY_TOO_DENSE', deck([body(41)]), 'simplified')).toHaveLength(1)
      expect(of('BODY_TOO_DENSE', deck([body(40)]), 'simplified')).toEqual([])
    })

    it('flags a thin content slide in a detailed deck as medium, never the title slide', () => {
      const d = deck([body(5), body(29), body(30)])
      const flags = of('BODY_TOO_THIN', d, 'detailed')
      expect(flags.map((f) => f.slideIndex)).toEqual([1])
      expect(flags[0].severity).toBe('medium')
    })

    it('never flags thin slides for balanced or simplified decks', () => {
      const d = deck([body(5), body(5)])
      expect(of('BODY_TOO_THIN', d, 'balanced')).toEqual([])
      expect(of('BODY_TOO_THIN', d, 'simplified')).toEqual([])
    })

    it('does not flag a short timeline slide as thin, by blocks or by purpose', () => {
      const steps = card({
        blocks: [
          { type: 'heading', text: 'Title' },
          { type: 'timelineStep', label: '1990', text: 'First pilot' },
          { type: 'timelineStep', label: '2000', text: 'Rolled out nationally' },
        ],
      })
      const byPurpose = card({ plan: { purpose: 'timeline' }, blocks: [{ type: 'heading', text: 'Title' }, { type: 'paragraph', text: words(5) }] })
      expect(of('BODY_TOO_THIN', deck([body(5), steps, byPurpose]), 'detailed')).toEqual([])
    })

    it('does not flag a short hero-role slide or a call to action as thin', () => {
      const insight = { ...body(8), role: 'insight' }
      const closing = { ...body(8), role: 'closing-line' }
      const cta = card({ plan: { purpose: 'call_to_action' }, blocks: [{ type: 'heading', text: 'Title' }, { type: 'paragraph', text: words(8) }] })
      expect(of('BODY_TOO_THIN', deck([body(5), insight, closing, cta]), 'detailed')).toEqual([])
      // An ordinary role is still checked.
      expect(of('BODY_TOO_THIN', deck([body(5), { ...body(8), role: 'evidence' }]), 'detailed')).toHaveLength(1)
    })

    it('does not flag a short quote slide as thin', () => {
      const d = deck([body(5), card({ blocks: [{ type: 'heading', text: 'Title' }, { type: 'quote', text: 'Short line.' }] })])
      expect(of('BODY_TOO_THIN', d, 'detailed')).toEqual([])
    })
  })

  describe('TOO_MANY_BULLETS', () => {
    it('does not flag exactly 6 items', () => {
      const d = deck([
        card({
          blocks: [
            { type: 'heading', text: 'A list' },
            { type: 'bulletList', items: ['a', 'b', 'c', 'd', 'e', 'f'] },
          ],
        }),
      ])
      expect(structureFlags(d).filter((f) => f.type === 'TOO_MANY_BULLETS')).toEqual([])
    })

    it('flags 7 items as low', () => {
      const d = deck([
        card({
          blocks: [
            { type: 'heading', text: 'A list' },
            { type: 'bulletList', items: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] },
          ],
        }),
      ])
      const flags = structureFlags(d).filter((f) => f.type === 'TOO_MANY_BULLETS')
      expect(flags).toHaveLength(1)
      expect(flags[0].severity).toBe('low')
      expect(flags[0].slideIndex).toBe(0)
    })
  })

  describe('LAYOUT_REPETITION', () => {
    it('flags the third of three consecutive same-family slides', () => {
      // Three single-stat cards all resolve to statHero -> family "data".
      const statCard = (n: number) =>
        card({ blocks: [{ type: 'heading', text: `Stat ${n}` }, { type: 'stat', value: `${n}`, label: 'metric' }] })
      const d = deck([statCard(1), statCard(2), statCard(3)])
      const flags = structureFlags(d).filter((f) => f.type === 'LAYOUT_REPETITION')
      expect(flags).toHaveLength(1)
      expect(flags[0].severity).toBe('low')
      expect(flags[0].slideIndex).toBe(2)
    })

    it('does not flag two consecutive same-family slides followed by a different one', () => {
      const statCard = (n: number) =>
        card({ blocks: [{ type: 'heading', text: `Stat ${n}` }, { type: 'stat', value: `${n}`, label: 'metric' }] })
      const quoteCard = card({
        blocks: [{ type: 'heading', text: 'A quote' }, { type: 'quote', text: 'Something said once.' }],
      })
      const d = deck([statCard(1), statCard(2), quoteCard])
      expect(structureFlags(d).filter((f) => f.type === 'LAYOUT_REPETITION')).toEqual([])
    })
  })

  describe('list families in LAYOUT_REPETITION', () => {
    it('treats an icon grid and a numbered list as the same family', () => {
      const chips = card({
        blocks: [{ type: 'heading', text: 'Chips' }, { type: 'bulletList', items: ['one', 'two', 'three'] }],
      })
      // Items over 40 characters resolve to numberedList rather than iconGrid.
      const longItem = 'an item long enough that it cannot be drawn as a compact chip'
      const numbered = card({
        blocks: [{ type: 'heading', text: 'Numbered' }, { type: 'bulletList', items: [longItem, longItem] }],
      })
      const d = deck([chips, numbered, chips])
      expect(structureFlags(d).filter((f) => f.type === 'LAYOUT_REPETITION')).toHaveLength(1)
    })
  })

  describe('LIST_DOMINANT', () => {
    const listCard = (n: number) =>
      card({
        blocks: [
          { type: 'heading', text: `List ${n}` },
          { type: 'bulletList', items: ['first', 'second', 'third'] },
        ],
      })
    const statCard = (n: number) =>
      card({ blocks: [{ type: 'heading', text: `Stat ${n}` }, { type: 'stat', value: `${n}`, label: 'metric' }] })
    const proseCard = (n: number) =>
      card({ blocks: [{ type: 'heading', text: `Prose ${n}` }, { type: 'paragraph', text: 'One idea, said plainly.' }] })
    const timelineCard = (n: number) =>
      card({
        blocks: [
          { type: 'heading', text: `Steps ${n}` },
          { type: 'timelineStep', label: 'A', text: 'first' },
          { type: 'timelineStep', label: 'B', text: 'second' },
        ],
      })
    const listFlags = (d: GeneratedDeck) => structureFlags(d).filter((f) => f.type === 'LIST_DOMINANT')

    it('flags nothing for a deck that alternates structures with lists under 40%', () => {
      const d = deck([proseCard(1), listCard(2), statCard(3), timelineCard(4), listCard(5)])
      expect(listFlags(d)).toEqual([])
    })

    it('flags the latest surplus list slide when lists pass 40% without any two touching', () => {
      // 6 cards allow floor(6 * 0.4) = 2 lists; this has 3, none adjacent, so one is surplus — the last.
      const d = deck([listCard(1), statCard(2), listCard(3), timelineCard(4), listCard(5), proseCard(6)])
      const flags = listFlags(d)
      expect(flags).toHaveLength(1)
      expect(flags[0].slideIndex).toBe(4)
      expect(flags[0].severity).toBe('medium')
      expect(flags[0].message).toMatch(/3 of 6/)
    })

    it('flags the second of two adjacent list slides even when the share is fine', () => {
      const d = deck([proseCard(1), listCard(2), listCard(3), statCard(4), timelineCard(5), proseCard(6)])
      const flags = listFlags(d)
      expect(flags).toHaveLength(1)
      expect(flags[0].slideIndex).toBe(2)
    })

    it('counts a list beside a photo, which resolves to a photo list, as a list slide', () => {
      const photoListCard = (n: number) =>
        card({
          blocks: [
            { type: 'heading', text: `Photo list ${n}` },
            { type: 'bulletList', items: ['first', 'second', 'third'] },
            { type: 'image', url: 'https://example.com/a.jpg', alt: 'a photo' },
          ],
        })
      const d = deck([proseCard(1), photoListCard(2), photoListCard(3), statCard(4), timelineCard(5), proseCard(6)])
      expect(listFlags(d).map((f) => f.slideIndex)).toEqual([2])
    })

    it('never flags the first list slide of an adjacent pair', () => {
      const d = deck([listCard(1), listCard(2), statCard(3), timelineCard(4), proseCard(5)])
      expect(listFlags(d).map((f) => f.slideIndex)).toEqual([1])
    })

    it('does not judge a deck shorter than 5 slides', () => {
      const d = deck([listCard(1), listCard(2), listCard(3), listCard(4)])
      expect(listFlags(d)).toEqual([])
    })

    it('flags at most one entry per slide', () => {
      const d = deck([listCard(1), listCard(2), listCard(3), listCard(4), listCard(5), listCard(6)])
      const indices = listFlags(d).map((f) => f.slideIndex)
      expect(new Set(indices).size).toBe(indices.length)
    })

    it('tells the writer which structure to move to', () => {
      const d = deck([listCard(1), listCard(2), statCard(3), timelineCard(4), proseCard(5)])
      expect(listFlags(d)[0].suggestedAction).toMatch(/timelineStep/)
    })
  })

  describe('TEXT_ONLY_DECK', () => {
    const textCard = (n: number) =>
      card({ blocks: [{ type: 'heading', text: `Slide ${n}` }, { type: 'paragraph', text: 'Just prose here.' }] })

    it('flags a 4+ slide deck with no stat/timeline/comparison/quote block anywhere', () => {
      const d = deck([textCard(1), textCard(2), textCard(3), textCard(4)])
      const flags = structureFlags(d).filter((f) => f.type === 'TEXT_ONLY_DECK')
      expect(flags).toHaveLength(1)
      expect(flags[0].severity).toBe('medium')
      expect(flags[0].slideIndex).toBeUndefined()
    })

    it('does not flag when one card has a stat block', () => {
      const statCard = card({
        blocks: [{ type: 'heading', text: 'A stat' }, { type: 'stat', value: '1', label: 'thing' }],
      })
      const d = deck([textCard(1), textCard(2), textCard(3), statCard])
      expect(structureFlags(d).filter((f) => f.type === 'TEXT_ONLY_DECK')).toEqual([])
    })

    it('does not flag a deck of fewer than 4 slides', () => {
      const d = deck([textCard(1), textCard(2), textCard(3)])
      expect(structureFlags(d).filter((f) => f.type === 'TEXT_ONLY_DECK')).toEqual([])
    })
  })

  describe('WEAK_CONCLUSION', () => {
    it('does not flag when the last slide is a conclusion', () => {
      const d = deck([card({ plan: { purpose: 'conclusion' } })])
      expect(structureFlags(d).filter((f) => f.type === 'WEAK_CONCLUSION')).toEqual([])
    })

    it('flags when the last slide is not a concluding purpose', () => {
      const d = deck([card({ plan: { purpose: 'evidence' } })])
      const flags = structureFlags(d).filter((f) => f.type === 'WEAK_CONCLUSION')
      expect(flags).toHaveLength(1)
      expect(flags[0].severity).toBe('medium')
      expect(flags[0].slideIndex).toBe(0)
    })
  })

  describe('FILLER_SLIDE', () => {
    it('flags an agenda-like heading when the deck is not educational/tutorial', () => {
      const d = deck(
        [card({ blocks: [{ type: 'heading', text: 'Agenda' }, { type: 'paragraph', text: 'Body.' }] })],
        { presentationType: 'informational' },
      )
      const flags = structureFlags(d).filter((f) => f.type === 'FILLER_SLIDE')
      expect(flags).toHaveLength(1)
      expect(flags[0].severity).toBe('medium')
    })

    it('does not flag an agenda-like heading in an educational deck', () => {
      const d = deck(
        [card({ blocks: [{ type: 'heading', text: 'Agenda' }, { type: 'paragraph', text: 'Body.' }] })],
        { presentationType: 'educational' },
      )
      expect(structureFlags(d).filter((f) => f.type === 'FILLER_SLIDE')).toEqual([])
    })

    it('flags an opening "this presentation" heading regardless of presentation type', () => {
      const d = deck(
        [
          card({
            blocks: [
              { type: 'heading', text: 'This presentation covers three things' },
              { type: 'paragraph', text: 'Body.' },
            ],
          }),
        ],
        { presentationType: 'educational' },
      )
      const flags = structureFlags(d).filter((f) => f.type === 'FILLER_SLIDE')
      expect(flags).toHaveLength(1)
    })

    it('does not flag an ordinary heading', () => {
      const d = deck([card({ blocks: [{ type: 'heading', text: 'Revenue is climbing' }, { type: 'paragraph', text: 'Body.' }] })])
      expect(structureFlags(d).filter((f) => f.type === 'FILLER_SLIDE')).toEqual([])
    })

    // A single-word filler entry ("agenda", "questions", "thanks", ...) also
    // starts plenty of ordinary content headings, so it only matches the
    // heading exactly — never as a prefix.
    it.each([
      'Introduction to battery chemistry',
      'Questions to ask before buying an EV',
      'Thanks to subsidies, sales rose',
      'Objectives of the Paris Agreement',
    ])('does not flag "%s" — a single-word filler term used as an ordinary heading', (heading) => {
      const d = deck([card({ blocks: [{ type: 'heading', text: heading }, { type: 'paragraph', text: 'Body.' }] })])
      expect(structureFlags(d).filter((f) => f.type === 'FILLER_SLIDE')).toEqual([])
    })

    it.each(['Agenda', 'Questions', 'Thank you for listening'])(
      'flags "%s" — a bare/prefix filler heading with nothing else on it',
      (heading) => {
        const d = deck(
          [card({ blocks: [{ type: 'heading', text: heading }, { type: 'paragraph', text: 'Body.' }] })],
          { presentationType: 'informational' },
        )
        expect(structureFlags(d).filter((f) => f.type === 'FILLER_SLIDE')).toHaveLength(1)
      },
    )
  })

  describe('OPENING_NOT_TITLE', () => {
    const openingFlags = (d: GeneratedDeck) => structureFlags(d).filter((f) => f.type === 'OPENING_NOT_TITLE')

    it('accepts a heading alone or a heading with one paragraph', () => {
      expect(openingFlags(deck([card({ blocks: [{ type: 'heading', text: 'Title' }] })]))).toEqual([])
      expect(openingFlags(deck([card()]))).toEqual([])
    })

    it('flags slide 1 carrying anything else, as a repairable medium', () => {
      const d = deck([
        card({ blocks: [{ type: 'heading', text: 'Title' }, { type: 'bulletList', items: ['a', 'b', 'c'] }] }),
      ])
      const flags = openingFlags(d)
      expect(flags).toHaveLength(1)
      expect(flags[0]).toMatchObject({ severity: 'medium', slideIndex: 0 })
    })

    it('flags two paragraphs', () => {
      const d = deck([
        card({
          blocks: [
            { type: 'heading', text: 'Title' },
            { type: 'paragraph', text: 'One.' },
            { type: 'paragraph', text: 'Two.' },
          ],
        }),
      ])
      expect(openingFlags(d)).toHaveLength(1)
    })

    it('ignores every slide after the first', () => {
      const d = deck([card(), card({ blocks: [{ type: 'heading', text: 'Next' }, { type: 'stat', value: '1', label: 'x' }] })])
      expect(openingFlags(d)).toEqual([])
    })
  })

  describe('VISUAL_MISMATCH', () => {
    it('flags a timeline visualType with no timelineStep block', () => {
      const d = deck([card({ plan: { visualType: 'timeline' } })])
      const flags = structureFlags(d).filter((f) => f.type === 'VISUAL_MISMATCH')
      expect(flags).toHaveLength(1)
      // Medium so it is repairable — a plan that says "timeline" over a bullet list is the failure.
      expect(flags[0].severity).toBe('medium')
    })

    it('flags process_flow with no timelineStep block', () => {
      const d = deck([card({ plan: { visualType: 'process_flow' } })])
      expect(structureFlags(d).filter((f) => f.type === 'VISUAL_MISMATCH')).toHaveLength(1)
    })

    it('does not demand stats of a chart visualType, which would push the writer to invent numbers', () => {
      const d = deck([card({ plan: { visualType: 'bar_chart' } })])
      expect(structureFlags(d).filter((f) => f.type === 'VISUAL_MISMATCH')).toEqual([])
    })

    it('does not flag a timeline visualType with a timelineStep block', () => {
      const d = deck([
        card({
          plan: { visualType: 'timeline' },
          blocks: [
            { type: 'heading', text: 'Steps' },
            { type: 'timelineStep', label: 'A', text: 'first' },
            { type: 'timelineStep', label: 'B', text: 'second' },
          ],
        }),
      ])
      expect(structureFlags(d).filter((f) => f.type === 'VISUAL_MISMATCH')).toEqual([])
    })

    it('flags comparison_table with fewer than 2 comparisonGroup blocks', () => {
      const d = deck([
        card({
          plan: { visualType: 'comparison_table' },
          blocks: [
            { type: 'heading', text: 'One side' },
            { type: 'comparisonGroup', heading: 'A', items: ['x'] },
          ],
        }),
      ])
      const flags = structureFlags(d).filter((f) => f.type === 'VISUAL_MISMATCH')
      expect(flags).toHaveLength(1)
    })

    it('flags metric_cards with no stat block', () => {
      const d = deck([card({ plan: { visualType: 'metric_cards' } })])
      const flags = structureFlags(d).filter((f) => f.type === 'VISUAL_MISMATCH')
      expect(flags).toHaveLength(1)
    })
  })

  describe('DUPLICATE_CONTENT', () => {
    it('flags the later of two slides with the same normalized heading', () => {
      const d = deck([
        card({ blocks: [{ type: 'heading', text: 'Our Results!' }, { type: 'paragraph', text: 'First.' }] }),
        card({ blocks: [{ type: 'heading', text: 'our results' }, { type: 'paragraph', text: 'Second.' }] }),
      ])
      const flags = structureFlags(d).filter((f) => f.type === 'DUPLICATE_CONTENT')
      expect(flags).toHaveLength(1)
      expect(flags[0].slideIndex).toBe(1)
      expect(flags[0].severity).toBe('medium')
    })

    it('flags a bullet item of 4+ words repeated on a later slide', () => {
      const d = deck([
        card({
          blocks: [
            { type: 'heading', text: 'First list' },
            { type: 'bulletList', items: ['reduce total carbon emissions'] },
          ],
        }),
        card({
          blocks: [
            { type: 'heading', text: 'Second list' },
            { type: 'bulletList', items: ['reduce total carbon emissions'] },
          ],
        }),
      ])
      const flags = structureFlags(d).filter((f) => f.type === 'DUPLICATE_CONTENT')
      expect(flags).toHaveLength(1)
      expect(flags[0].slideIndex).toBe(1)
    })

    it('does not flag a repeated bullet item under 4 words', () => {
      const d = deck([
        card({ blocks: [{ type: 'heading', text: 'First list' }, { type: 'bulletList', items: ['fast growth'] }] }),
        card({ blocks: [{ type: 'heading', text: 'Second list' }, { type: 'bulletList', items: ['fast growth'] }] }),
      ])
      expect(structureFlags(d).filter((f) => f.type === 'DUPLICATE_CONTENT')).toEqual([])
    })
  })

  describe('OVERCLAIM', () => {
    it('flags overclaiming language', () => {
      const d = deck([
        card({
          blocks: [{ type: 'heading', text: 'Big claim' }, { type: 'paragraph', text: 'This proves the point completely.' }],
        }),
      ])
      const flags = structureFlags(d).filter((f) => f.type === 'OVERCLAIM')
      expect(flags).toHaveLength(1)
      expect(flags[0].severity).toBe('low')
    })

    it('does not flag "tailpipe zero emissions"', () => {
      const d = deck([
        card({
          blocks: [
            { type: 'heading', text: 'Clean driving' },
            { type: 'paragraph', text: 'The car offers tailpipe zero emissions on every trip.' },
          ],
        }),
      ])
      expect(structureFlags(d).filter((f) => f.type === 'OVERCLAIM')).toEqual([])
    })

    it('flags "zero emissions" when tailpipe is not mentioned first on the line', () => {
      const d = deck([
        card({
          blocks: [
            { type: 'heading', text: 'Clean driving' },
            { type: 'paragraph', text: 'This car has zero emissions overall.' },
          ],
        }),
      ])
      expect(structureFlags(d).filter((f) => f.type === 'OVERCLAIM')).toHaveLength(1)
    })
  })

  describe('NARRATION_DUPLICATES_SLIDE', () => {
    it('flags empty speaker notes', () => {
      const d = deck([card({ speakerNotes: '   ' })])
      const flags = structureFlags(d).filter((f) => f.type === 'NARRATION_DUPLICATES_SLIDE')
      expect(flags).toHaveLength(1)
      expect(flags[0].severity).toBe('medium')
    })

    it('flags notes that mostly repeat the slide', () => {
      const d = deck([
        card({
          blocks: [
            { type: 'heading', text: 'Revenue growth' },
            { type: 'paragraph', text: 'Revenue growth accelerated significantly across every region.' },
          ],
          speakerNotes: 'Revenue growth accelerated significantly across every region this quarter.',
        }),
      ])
      const flags = structureFlags(d).filter((f) => f.type === 'NARRATION_DUPLICATES_SLIDE')
      expect(flags).toHaveLength(1)
    })

    it('does not flag notes that mostly add new words', () => {
      const d = deck([
        card({
          blocks: [
            { type: 'heading', text: 'Revenue growth' },
            { type: 'paragraph', text: 'Revenue growth accelerated significantly across every region.' },
          ],
          speakerNotes:
            'Mention the finance team that verified these figures before the board meeting happened yesterday afternoon.',
        }),
      ])
      expect(structureFlags(d).filter((f) => f.type === 'NARRATION_DUPLICATES_SLIDE')).toEqual([])
    })
  })

  describe('structured blocks', () => {
    const ofType = (d: GeneratedDeck, type: string) => structureFlags(d).filter((f) => f.type === type)
    const point = (n: number, extra = '') => ({
      type: 'point' as const,
      label: `Term${n}`,
      text: `meaning ${n}${extra}`,
    })
    const pointCard = (count: number, plan: PlanOverrides = {}) =>
      card({
        plan,
        blocks: [{ type: 'heading', text: 'Key terms' }, ...Array.from({ length: count }, (_, i) => point(i))],
      })

    describe('visible text', () => {
      it('counts each point label and text, and nothing from a kicker, callout or code', () => {
        const c = card({
          blocks: [
            { type: 'heading', text: 'Title', kicker: 'Kick words not counted here' },
            { type: 'point', label: 'one two', text: 'three four five' },
            { type: 'callout', label: 'Note', text: 'callout words are not counted either' },
            { type: 'code', code: 'a = 1\nb = 2', label: 'Python', caption: 'caption words' },
          ],
        })
        expect(visibleLines(c)).toEqual(['one two three four five'])
      })

      it('flags a point slide that is over the density ceiling', () => {
        const d = deck([
          card({
            blocks: [{ type: 'heading', text: 'Terms' }, { type: 'point', label: 'Term', text: words(60) }],
          }),
        ])
        expect(ofType(d, 'BODY_TOO_DENSE')).toHaveLength(1)
      })

      it('does not flag a balanced slide of 5 points, a callout and a kicker', () => {
        const d = deck([
          card({
            blocks: [
              { type: 'heading', text: 'Key terms', kicker: 'Vocabulary for the week' },
              ...Array.from({ length: 5 }, (_, i) => ({
                type: 'point' as const,
                label: `Term ${i}`,
                text: 'a short plain meaning here',
              })),
              { type: 'callout', label: 'Remember', text: words(14) },
            ],
          }),
        ])
        // 5 x (2 + 5) = 35 counted words, under the 55 ceiling; the callout and kicker add none.
        expect(ofType(d, 'BODY_TOO_DENSE')).toEqual([])
      })
    })

    describe('code slides are exempt from density', () => {
      const longCode = Array.from({ length: 12 }, (_, i) => `line_${i} = compute(${words(8)})`).join('\n')

      it('is not dense, even with a long paragraph beside the code', () => {
        const dense = card({
          blocks: [
            { type: 'heading', text: 'A code slide' },
            { type: 'paragraph', text: words(60) },
            { type: 'code', code: longCode },
          ],
        })
        expect(ofType(deck([dense]), 'BODY_TOO_DENSE')).toEqual([])
      })

      it('is not thin on a detailed deck', () => {
        const thin = card({ blocks: [{ type: 'heading', text: 'A code slide' }, { type: 'code', code: 'x = 1' }] })
        // Slide 0 is skipped by the rule, so the code slide goes second.
        const d = deck([card(), thin])
        expect(structureFlags(d, 'detailed').filter((f) => f.type === 'BODY_TOO_THIN' && f.slideIndex === 1)).toEqual([])
      })

      it('is still thin without code, so the exemption is what spares it', () => {
        const thin = card({ blocks: [{ type: 'heading', text: 'A slide' }, { type: 'paragraph', text: 'Short.' }] })
        const d = deck([card(), thin])
        expect(structureFlags(d, 'detailed').filter((f) => f.type === 'BODY_TOO_THIN' && f.slideIndex === 1)).toHaveLength(1)
      })
    })

    describe('VISUAL_MISMATCH for the new visual types', () => {
      it('flags definitions with fewer than 2 points, at low', () => {
        for (const count of [0, 1]) {
          const flags = ofType(deck([pointCard(count, { visualType: 'definitions' })]), 'VISUAL_MISMATCH')
          expect(flags).toHaveLength(1)
          expect(flags[0].severity).toBe('low')
        }
      })

      it('does not flag definitions with 2 points', () => {
        expect(ofType(deck([pointCard(2, { visualType: 'definitions' })]), 'VISUAL_MISMATCH')).toEqual([])
      })

      it('flags code_example with no code block, at low', () => {
        const flags = ofType(deck([card({ plan: { visualType: 'code_example' } })]), 'VISUAL_MISMATCH')
        expect(flags).toHaveLength(1)
        expect(flags[0].severity).toBe('low')
      })

      it('does not flag code_example with a code block', () => {
        const c = card({
          plan: { visualType: 'code_example' },
          blocks: [{ type: 'heading', text: 'Code' }, { type: 'code', code: 'x = 1' }],
        })
        expect(ofType(deck([c]), 'VISUAL_MISMATCH')).toEqual([])
      })

      it('keeps the existing cases at medium', () => {
        const flags = ofType(deck([card({ plan: { visualType: 'metric_cards' } })]), 'VISUAL_MISMATCH')
        expect(flags[0].severity).toBe('medium')
      })
    })

    describe('LIST_DOMINANT', () => {
      it('does not treat a point-run slide as list-led', () => {
        const prose = (n: number) =>
          card({ blocks: [{ type: 'heading', text: `Prose ${n}` }, { type: 'paragraph', text: 'One idea, said plainly.' }] })
        const stat = card({ blocks: [{ type: 'heading', text: 'Stat' }, { type: 'stat', value: '1', label: 'm' }] })
        // Three point-run slides, two of them adjacent: would be flagged if they counted as lists.
        const d = deck([prose(1), pointCard(3), pointCard(3), stat, pointCard(4), prose(2)])
        expect(ofType(d, 'LIST_DOMINANT')).toEqual([])
      })
    })

    describe('POINT_RUN_TOO_LONG', () => {
      it('does not flag a run of 6', () => {
        expect(ofType(deck([pointCard(6)]), 'POINT_RUN_TOO_LONG')).toEqual([])
      })

      it('flags a run of 7 as low, on that slide', () => {
        const flags = ofType(deck([card(), pointCard(7)]), 'POINT_RUN_TOO_LONG')
        expect(flags).toHaveLength(1)
        expect(flags[0].severity).toBe('low')
        expect(flags[0].slideIndex).toBe(1)
      })

      it('judges runs separately: two runs of 4 split by a paragraph are fine', () => {
        const c = card({
          blocks: [
            { type: 'heading', text: 'Terms' },
            ...Array.from({ length: 4 }, (_, i) => point(i)),
            { type: 'paragraph', text: 'A break.' },
            ...Array.from({ length: 4 }, (_, i) => point(i + 4)),
          ],
        })
        expect(ofType(deck([c]), 'POINT_RUN_TOO_LONG')).toEqual([])
      })
    })

    describe('CODE_TOO_LONG', () => {
      const codeCard = (code: string) =>
        card({ blocks: [{ type: 'heading', text: 'Code' }, { type: 'code', code }] })
      const lines = (n: number, width = 10) => Array.from({ length: n }, () => 'x'.repeat(width)).join('\n')

      it('does not flag 12 lines of 60 characters', () => {
        expect(ofType(deck([codeCard(lines(12, 60))]), 'CODE_TOO_LONG')).toEqual([])
      })

      it('flags 13 lines, at low', () => {
        const flags = ofType(deck([codeCard(lines(13))]), 'CODE_TOO_LONG')
        expect(flags).toHaveLength(1)
        expect(flags[0].severity).toBe('low')
      })

      it('does not count a final newline as a 13th line', () => {
        expect(ofType(deck([codeCard(lines(12, 10) + '\n')]), 'CODE_TOO_LONG')).toEqual([])
        expect(ofType(deck([codeCard(lines(13, 10) + '\n')]), 'CODE_TOO_LONG')).toHaveLength(1)
      })

      it('does not count the carriage return of a CRLF line as a character', () => {
        expect(ofType(deck([codeCard(lines(2, 60).replace(/\n/g, '\r\n') + '\r\n')]), 'CODE_TOO_LONG')).toEqual([])
        expect(ofType(deck([codeCard(lines(2, 61).replace(/\n/g, '\r\n'))]), 'CODE_TOO_LONG')).toHaveLength(1)
      })

      it('flags a line of 61 characters', () => {
        expect(ofType(deck([codeCard(lines(2, 61))]), 'CODE_TOO_LONG')).toHaveLength(1)
      })

      it('flags a slide once even with two long code blocks', () => {
        const c = card({
          blocks: [
            { type: 'heading', text: 'Code' },
            { type: 'code', code: lines(13) },
            { type: 'code', code: lines(14) },
          ],
        })
        expect(ofType(deck([c]), 'CODE_TOO_LONG')).toHaveLength(1)
      })
    })

    describe('CALLOUT_REPEATS_HEADING', () => {
      const calloutCard = (heading: string, text: string) =>
        card({ blocks: [{ type: 'heading', text: heading }, { type: 'callout', text }] })

      it('flags a callout that equals the heading, ignoring case and punctuation', () => {
        const flags = ofType(deck([calloutCard('Why it matters', 'Why it matters!')]), 'CALLOUT_REPEATS_HEADING')
        expect(flags).toHaveLength(1)
        expect(flags[0].severity).toBe('low')
      })

      it('flags a callout that contains the heading', () => {
        expect(
          ofType(deck([calloutCard('Why it matters', 'Remember why it matters most.')]), 'CALLOUT_REPEATS_HEADING'),
        ).toHaveLength(1)
      })

      it('does not flag a callout that says something else', () => {
        expect(ofType(deck([calloutCard('Why it matters', 'Check the label twice.')]), 'CALLOUT_REPEATS_HEADING')).toEqual(
          [],
        )
      })

      it('does not flag a card with no heading text to compare', () => {
        const c = card({ blocks: [{ type: 'heading', text: '' }, { type: 'callout', text: 'Anything at all.' }] })
        expect(ofType(deck([c]), 'CALLOUT_REPEATS_HEADING')).toEqual([])
      })
    })
  })
})
