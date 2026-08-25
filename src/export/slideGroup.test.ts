import { describe, expect, it } from 'vitest'
import { slideGroup } from './slideGroup'
import type { Card, ContentBlock } from '@/engine/contentBlocks'

function card(blocks: ContentBlock[], layout: Card['layout'] = 'auto'): Card {
  return { id: 'c1', orderIndex: 0, blocks, layout, visualStyle: 'structured' }
}

const HEADING: ContentBlock = { type: 'heading', text: 'Title' }

describe('slideGroup', () => {
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
  })

  it('maps hero and textFocus to the title group', () => {
    expect(slideGroup(card([HEADING], 'hero'), false)).toBe('title')
    expect(slideGroup(card([HEADING], 'textFocus'), false)).toBe('title')
  })

  it('maps the remaining layouts to body', () => {
    for (const layout of ['standard', 'standardSplit', 'timeline', 'iconGrid', 'numberedList', 'gallery'] as const) {
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
