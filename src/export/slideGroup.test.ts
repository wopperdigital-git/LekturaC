import { describe, expect, it } from 'vitest'
import { slideGroup } from './slideGroup'
import type { Card, ContentBlock } from '@/engine/contentBlocks'

function card(blocks: ContentBlock[], layout: Card['layout'] = 'auto'): Card {
  return { id: 'c1', orderIndex: 0, blocks, layout, visualStyle: 'structured' }
}

const HEADING: ContentBlock = { type: 'heading', text: 'Title' }

describe('slideGroup', () => {
  /*
    A nudged element has to survive the export, and none of the five
    arrangements can carry it — `body` in particular merges every block after
    the heading into one text box, leaving a per-element offset nowhere to go.
    So the check has to come before the classifier does anything.
  */
  it('routes a card with a nudged element to the adjusted group, whatever its layout', () => {
    const c = {
      ...card([HEADING, { type: 'quote', text: 'Words' }], 'quote'),
      adjusts: { '1': { dx: 0.1, dy: 0, rotation: 0 } },
    }
    expect(slideGroup(c, false)).toBe('adjusted')
  })

  it('routes an adjusted card to the adjusted group even as the first card', () => {
    const c = { ...card([HEADING]), adjusts: { '0': { dx: 0, dy: 0.05, rotation: 0 } } }
    expect(slideGroup(c, true)).toBe('adjusted')
  })

  /*
    An empty record is the shape a card gets back from Supabase's `default '{}'`
    column, so "has an adjusts field" is not the same question as "has been
    adjusted". Treating it as adjusted would route every untouched card in the
    database down the approximate path.
  */
  it('treats an empty adjusts record as untouched', () => {
    expect(slideGroup({ ...card([HEADING]), adjusts: {} }, true)).not.toBe('adjusted')
  })

  it('leaves untouched cards on the classifier', () => {
    expect(slideGroup(card([HEADING]), true)).not.toBe('adjusted')
  })

  it('maps an explicit quote layout to the quote group', () => {
    const c = card([HEADING, { type: 'quote', text: 'Words' }], 'quote')
    expect(slideGroup(c, false)).toBe('quote')
  })

  it('maps an explicit comparison layout to twoCol', () => {
    expect(slideGroup(card([HEADING], 'comparison'), false)).toBe('twoCol')
  })

  it('maps both stat layouts to the stat group', () => {
    expect(slideGroup(card([HEADING], 'statHero'), false)).toBe('stat')
    expect(slideGroup(card([HEADING], 'statGrid'), false)).toBe('stat')
    expect(slideGroup(card([HEADING], 'statList'), false)).toBe('stat')
  })

  it('maps both comparison layouts to the two-column group', () => {
    expect(slideGroup(card([HEADING], 'comparison'), false)).toBe('twoCol')
    expect(slideGroup(card([HEADING], 'comparisonTable'), false)).toBe('twoCol')
  })

  it('maps hero and textFocus to the title group', () => {
    expect(slideGroup(card([HEADING], 'hero'), false)).toBe('title')
    expect(slideGroup(card([HEADING], 'textFocus'), false)).toBe('title')
  })

  it('maps the remaining layouts to body', () => {
    for (const layout of [
      'standard',
      'standardSplit',
      'timeline',
      'timelineRow',
      'iconGrid',
      'numberedList',
      'checklist',
      'splitList',
      'gallery',
    ] as const) {
      expect(slideGroup(card([HEADING], layout), false)).toBe('body')
    }
  })

  // The load-bearing case: 'auto' must be resolved by the classifier first,
  // not treated as a layout in its own right.
  it('resolves auto through the classifier instead of falling through', () => {
    const quoteCard = card([HEADING, { type: 'quote', text: 'Words' }], 'auto')
    expect(slideGroup(quoteCard, false)).toBe('quote')
  })

  it('passes isFirstCard through, so an opening card can reach the hero treatment', () => {
    const opening = card([HEADING, { type: 'paragraph', text: 'Subtitle' }], 'auto')
    expect(slideGroup(opening, true)).toBe('title')
  })
})
