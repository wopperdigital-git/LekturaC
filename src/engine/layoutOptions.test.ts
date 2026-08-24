import { describe, expect, it } from 'vitest'
import type { ContentBlock } from './contentBlocks'
import { cardKind, chooseLayout, layoutVarieties } from './layoutEngine'

const heading: ContentBlock = { type: 'heading', text: 'Title' }
const paragraph: ContentBlock = { type: 'paragraph', text: 'Some prose.' }
const stat = (value: string): ContentBlock => ({ type: 'stat', value, label: 'label' })
const step = (label: string): ContentBlock => ({ type: 'timelineStep', label, text: 'text' })
const group = (h: string): ContentBlock => ({ type: 'comparisonGroup', heading: h, items: ['a'] })
const bullets: ContentBlock = { type: 'bulletList', items: ['one', 'two'] }
const quote: ContentBlock = { type: 'quote', text: 'A saying.' }
const image = (url: string): ContentBlock => ({ type: 'image', url })

const layoutsIn = (blocks: ContentBlock[], kind: Parameters<typeof layoutVarieties>[1]) =>
  [...new Set(layoutVarieties(blocks, kind).map((v) => v.layout))]

describe('layoutVarieties', () => {
  /*
    The load-bearing rule. A user picking a layout is choosing a variety of
    their card's own type, never a different type — switching a bullet list
    into a quote layout is a different kind of slide, not a restyle.
  */
  it('never offers a layout belonging to another card type', () => {
    expect(layoutsIn([heading, bullets], 'list')).toEqual(['iconGrid', 'numberedList'])
    expect(layoutsIn([heading, quote], 'quote')).toEqual(['quote'])
    expect(layoutsIn([heading, step('a'), step('b')], 'timeline')).toEqual(['timeline'])
    expect(layoutsIn([heading, group('a'), group('b')], 'comparison')).toEqual(['comparison'])
    expect(layoutsIn([heading, image('a'), image('b')], 'gallery')).toEqual(['gallery'])
    expect(layoutsIn([heading, paragraph], 'title')).toEqual(['hero'])
  })

  it('offers both treatments of every component in the family', () => {
    // Two components x two treatments is what gives a list card four varieties.
    const list = layoutVarieties([heading, bullets], 'list')
    expect(list).toHaveLength(4)
    expect(list.filter((v) => v.layout === 'iconGrid').map((v) => v.visualStyle)).toEqual([
      'structured',
      'expressive',
    ])
  })

  it('gives a single-component type one variety per treatment', () => {
    expect(layoutVarieties([heading, paragraph], 'title')).toEqual([
      { layout: 'hero', visualStyle: 'structured' },
      { layout: 'hero', visualStyle: 'expressive' },
    ])
  })

  it('withholds a component the card lacks the blocks for', () => {
    // A stat grid needs two stats; a split needs a picture beside the prose.
    expect(layoutsIn([heading, stat('1')], 'stats')).toEqual(['statHero'])
    expect(layoutsIn([heading, stat('1'), stat('2')], 'stats')).toEqual(['statHero', 'statGrid'])
    expect(layoutsIn([heading, paragraph], 'text')).not.toContain('standardSplit')
    expect(layoutsIn([heading, paragraph, image('a')], 'text')).toContain('standardSplit')
  })

  it('includes whatever the classifier would have picked for the same card', () => {
    // If these disagree, a card's current layout is missing from its own
    // picker and the active option becomes unselectable.
    const cards: ContentBlock[][] = [
      [heading, paragraph],
      [heading, stat('1')],
      [heading, stat('1'), stat('2')],
      [heading, group('a'), group('b')],
      [heading, step('a'), step('b')],
      [heading, quote],
      [heading, bullets],
      [heading, image('a'), image('b')],
      [heading, paragraph, paragraph],
    ]
    for (const blocks of cards) {
      const context = { isFirstCard: false }
      const auto = chooseLayout(blocks, context)
      expect(layoutsIn(blocks, cardKind(blocks, context))).toContain(auto)
    }
  })

  it('covers the opening card too, where the classifier may pick hero', () => {
    const blocks = [heading, paragraph]
    const context = { isFirstCard: true }
    expect(layoutsIn(blocks, cardKind(blocks, context))).toContain(chooseLayout(blocks, context))
  })
})

describe('cardKind', () => {
  it('labels by dominant content in the classifier’s priority order', () => {
    expect(cardKind([heading, group('a'), group('b')])).toBe('comparison')
    expect(cardKind([heading, step('a'), step('b')])).toBe('timeline')
    expect(cardKind([heading, stat('1')])).toBe('stats')
    expect(cardKind([heading, quote])).toBe('quote')
    expect(cardKind([heading, image('a'), image('b')])).toBe('gallery')
    expect(cardKind([heading, bullets])).toBe('list')
    expect(cardKind([heading, paragraph])).toBe('text')
  })

  it('only calls a card a title when it opens the deck', () => {
    expect(cardKind([heading, paragraph], { isFirstCard: true })).toBe('title')
    expect(cardKind([heading, paragraph], { isFirstCard: false })).toBe('text')
  })
})
