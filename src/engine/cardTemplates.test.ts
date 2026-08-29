import { describe, expect, it } from 'vitest'
import {
  CREATABLE_KINDS,
  contentLines,
  convertBlocks,
  layoutForKind,
  starterBlocks,
  type CreatableKind,
} from './cardTemplates'
import { cardKind, layoutVarieties, resolveLayout } from './layoutEngine'
import type { ContentBlock } from './contentBlocks'

/*
  The one promise both features make: the type you pick is the type you get.

  A user choosing "Timeline" from the modal and landing on a card the classifier
  reads as a bullet list would be the whole feature broken, and nothing else in
  the app would notice — the card would render, save and export perfectly well
  as the wrong kind of slide. So the round trip is pinned here rather than left
  to the two starter tables agreeing by eye.
*/

/** The context a card of this kind sits in — `title` only classifies as one at the front. */
const contextFor = (kind: CreatableKind) => ({ isFirstCard: kind === 'title' })

describe('starterBlocks', () => {
  it.each(CREATABLE_KINDS)('a new %s card reads back as that type', (kind) => {
    expect(cardKind(starterBlocks(kind), contextFor(kind))).toBe(kind)
  })

  it.each(CREATABLE_KINDS)('a new %s card resolves to a layout its own picker offers', (kind) => {
    const blocks = starterBlocks(kind)
    const resolved = resolveLayout(layoutForKind(kind), blocks, contextFor(kind))
    const offered = layoutVarieties(blocks, kind).map((v) => v.layout)
    expect(offered).toContain(resolved)
  })

  /*
    A title slide added at position 9 is still a title slide. `chooseLayout`
    only awards `hero` to the first card in the deck, so this is the one type
    that has to name its layout explicitly — without it the card silently
    renders as a plain standard slide and the modal's promise is broken for
    every position but the first.
  */
  it('gives a title card the hero layout wherever it sits', () => {
    const blocks = starterBlocks('title')
    expect(resolveLayout(layoutForKind('title'), blocks, { isFirstCard: false })).toBe('hero')
  })

  it('leaves every other type on the classifier', () => {
    for (const kind of CREATABLE_KINDS.filter((k) => k !== 'title')) {
      expect(layoutForKind(kind)).toBe('auto')
    }
  })

  /*
    Editing one card's placeholder text must not edit every other card created
    from the same template — the starter table would otherwise be shared
    structure handed out by reference.
  */
  it('hands out a fresh copy each time', () => {
    const first = starterBlocks('list')
    const second = starterBlocks('list')
    expect(first[1]).not.toBe(second[1])
    ;(first[1] as { items: string[] }).items[0] = 'Edited'
    expect((second[1] as { items: string[] }).items[0]).toBe('First point')
  })
})

const HEADING: ContentBlock = { type: 'heading', text: 'The heading' }

describe('convertBlocks', () => {
  it.each(CREATABLE_KINDS)('converting a text card to %s produces that type', (kind) => {
    const source: ContentBlock[] = [
      HEADING,
      { type: 'paragraph', text: 'First thought' },
      { type: 'paragraph', text: 'Second thought' },
    ]
    const converted = convertBlocks(source, kind)
    expect(cardKind(converted, contextFor(kind))).toBe(kind)
  })

  it.each(CREATABLE_KINDS)('keeps the heading when converting to %s', (kind) => {
    const converted = convertBlocks([HEADING, { type: 'paragraph', text: 'Body' }], kind)
    expect(converted[0]).toEqual({ type: 'heading', text: 'The heading' })
  })

  /*
    Content is generated once and never regenerated, so a conversion that
    quietly drops a line has destroyed the only copy of it. Structure cannot
    always survive a reshape; the words have to.
  */
  it('carries every line of the source into the target', () => {
    const source: ContentBlock[] = [
      HEADING,
      { type: 'bulletList', items: ['Alpha', 'Beta', 'Gamma', 'Delta'] },
    ]
    for (const kind of ['text', 'list', 'timeline', 'comparison'] as const) {
      const text = JSON.stringify(convertBlocks(source, kind))
      for (const item of ['Alpha', 'Beta', 'Gamma', 'Delta']) {
        expect(text).toContain(item)
      }
    }
  })

  it('pads a thin card with the target type placeholders rather than under-filling it', () => {
    // One line, but a timeline needs two steps before the classifier will
    // render it as one.
    const converted = convertBlocks([HEADING, { type: 'paragraph', text: 'Only line' }], 'timeline')
    expect(converted.filter((b) => b.type === 'timelineStep')).toHaveLength(2)
  })

  /*
    Numbers cannot be derived from prose. Turning a paragraph into a stat has to
    leave the value as an obvious placeholder — inventing a plausible figure
    would put a statistic on the slide that nobody wrote, which is the exact
    failure `ai/prompts.ts` treats numbers as opt-in to avoid.
  */
  it('never invents a number when converting prose to stats', () => {
    const converted = convertBlocks(
      [HEADING, { type: 'paragraph', text: 'Adoption grew' }, { type: 'paragraph', text: 'Churn fell' }],
      'stats',
    )
    const stats = converted.filter((b) => b.type === 'stat')
    expect(stats.map((s) => s.value)).toEqual(['00', '00'])
    expect(stats.map((s) => s.label)).toEqual(['Adoption grew', 'Churn fell'])
  })

  it('keeps existing stats intact rather than folding each value into its label', () => {
    const source: ContentBlock[] = [
      HEADING,
      { type: 'stat', value: '87%', label: 'Retention' },
      { type: 'stat', value: '2.4x', label: 'Growth' },
    ]
    expect(convertBlocks(source, 'stats')).toEqual(source)
  })

  it('keeps existing comparison groups intact', () => {
    const source: ContentBlock[] = [
      HEADING,
      { type: 'comparisonGroup', heading: 'Before', items: ['Slow'] },
      { type: 'comparisonGroup', heading: 'After', items: ['Fast'] },
    ]
    expect(convertBlocks(source, 'comparison')).toEqual(source)
  })

  it('splits a list down the middle into two comparison groups', () => {
    const converted = convertBlocks(
      [HEADING, { type: 'bulletList', items: ['A', 'B', 'C'] }],
      'comparison',
    )
    const groups = converted.filter((b) => b.type === 'comparisonGroup')
    expect(groups.map((g) => g.items)).toEqual([['A', 'B'], ['C']])
  })

  it('survives a card with nothing but a heading', () => {
    for (const kind of CREATABLE_KINDS) {
      const converted = convertBlocks([HEADING], kind)
      expect(cardKind(converted, contextFor(kind))).toBe(kind)
    }
  })
})

describe('contentLines', () => {
  it('skips the heading and keeps everything else in reading order', () => {
    const lines = contentLines([
      HEADING,
      { type: 'paragraph', text: 'Prose' },
      { type: 'bulletList', items: ['One', 'Two'] },
      { type: 'timelineStep', label: 'Step', text: 'Detail' },
    ])
    expect(lines).toEqual(['Prose', 'One', 'Two', 'Step — Detail'])
  })

  // A stat's number and its label are two runs on screen but one thought;
  // splitting them into two lines reads as an accidental duplicate.
  it('keeps a stat value with its label', () => {
    expect(contentLines([HEADING, { type: 'stat', value: '40%', label: 'Faster' }])).toEqual([
      '40% Faster',
    ])
  })

  it('drops an image with no alt text rather than writing a line about it', () => {
    expect(contentLines([HEADING, { type: 'image', url: 'x.png' }])).toEqual([])
    expect(contentLines([HEADING, { type: 'image', url: 'x.png', alt: 'A chart' }])).toEqual([
      'A chart',
    ])
  })
})
