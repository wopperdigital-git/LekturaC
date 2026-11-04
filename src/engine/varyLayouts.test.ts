import { describe, expect, it } from 'vitest'
import type { ContentBlock, LayoutType } from './contentBlocks'
import { cardKind, chooseLayout, componentsForKind } from './layoutEngine'
import { varyLayouts } from './varyLayouts'

const heading: ContentBlock = { type: 'heading', text: 'Title' }
const shortList: ContentBlock = { type: 'bulletList', items: ['One', 'Two', 'Three'] }
const quote: ContentBlock = { type: 'quote', text: 'A quote' }
const step = (label: string): ContentBlock => ({ type: 'timelineStep', label, text: 'Detail' })

const listCard = { blocks: [heading, shortList], layout: 'auto' as LayoutType }
const timelineCard = {
  blocks: [heading, step('One'), step('Two'), step('Three')],
  layout: 'auto' as LayoutType,
}
const quoteCard = { blocks: [heading, quote], layout: 'auto' as LayoutType }

/** What each card actually renders with once the result is applied. */
function resolved(cards: { blocks: ContentBlock[]; layout: LayoutType }[], out: LayoutType[]) {
  return cards.map((c, i) => (out[i] === 'auto' ? chooseLayout(c.blocks, { isFirstCard: i === 0 }) : out[i]))
}

describe('varyLayouts', () => {
  it('gives the second of two consecutive short-list cards a list variety other than iconGrid', () => {
    const cards = [listCard, listCard]
    expect(chooseLayout(listCard.blocks)).toBe('iconGrid')
    const out = varyLayouts(cards)
    expect(out[0]).toBe('auto')
    expect(out[1]).not.toBe('auto')
    expect(out[1]).not.toBe('iconGrid')
    expect(componentsForKind('list', listCard.blocks)).toContain(out[1])
  })

  it('alternates timeline / timelineRow / timeline across three timeline cards', () => {
    const cards = [timelineCard, timelineCard, timelineCard]
    const out = varyLayouts(cards)
    expect(resolved(cards, out)).toEqual(['timeline', 'timelineRow', 'timeline'])
  })

  it('returns an explicit layout unchanged and counts it as the previous arrangement', () => {
    const explicit = { blocks: listCard.blocks, layout: 'iconGrid' as LayoutType }
    const out = varyLayouts([explicit, listCard])
    expect(out[0]).toBe('iconGrid')
    // The next auto list card would resolve to iconGrid too, so it is varied.
    expect(out[1]).not.toBe('auto')
    expect(out[1]).not.toBe('iconGrid')

    const named = { blocks: listCard.blocks, layout: 'checklist' as LayoutType }
    expect(varyLayouts([named, listCard])).toEqual(['checklist', 'auto'])
  })

  it('leaves a card of a single-component kind on auto even after another quote', () => {
    expect(varyLayouts([quoteCard, quoteCard])).toEqual(['auto', 'auto'])
  })

  it('resolves the first card with isFirstCard', () => {
    const titleCard = { blocks: [heading], layout: 'auto' as LayoutType }
    const plain = { blocks: [heading], layout: 'auto' as LayoutType }
    expect(chooseLayout(titleCard.blocks, { isFirstCard: true })).toBe('hero')
    expect(chooseLayout(plain.blocks, { isFirstCard: false })).toBe('standard')
    // hero then standard differ, so nothing changes; were isFirstCard ignored
    // both would read 'standard' and the second would be varied.
    expect(varyLayouts([titleCard, plain])).toEqual(['auto', 'auto'])
  })

  it('never returns a layout outside componentsForKind of that card', () => {
    const cards = [
      listCard,
      listCard,
      listCard,
      timelineCard,
      timelineCard,
      quoteCard,
      quoteCard,
      { blocks: [heading, { type: 'paragraph', text: 'Body' } as ContentBlock], layout: 'auto' as LayoutType },
      { blocks: [heading, { type: 'paragraph', text: 'Body' } as ContentBlock], layout: 'auto' as LayoutType },
      { blocks: [heading, { type: 'stat', value: '4', label: 'x' } as ContentBlock], layout: 'auto' as LayoutType },
      { blocks: [heading, { type: 'stat', value: '4', label: 'x' } as ContentBlock], layout: 'auto' as LayoutType },
    ]
    const out = varyLayouts(cards)
    expect(out).toHaveLength(cards.length)
    out.forEach((layout, i) => {
      if (layout === 'auto') return
      const allowed = componentsForKind(cardKind(cards[i].blocks, { isFirstCard: i === 0 }), cards[i].blocks)
      expect(allowed).toContain(layout)
    })
  })
})
