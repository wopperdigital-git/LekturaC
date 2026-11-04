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
  it('gives the second of two consecutive icon-grid cards a checklist', () => {
    expect(chooseLayout(listCard.blocks)).toBe('iconGrid')
    expect(varyLayouts([listCard, listCard])).toEqual(['auto', 'checklist'])
  })

  it('gives the second of two numbered-list cards a checklist', () => {
    const longItems: ContentBlock = {
      type: 'bulletList',
      items: ['A fairly long item that is well past the short chip limit of forty characters', 'Another long one, also over the limit for the compact grid layout'],
    }
    const numbered = { blocks: [heading, longItems], layout: 'auto' as LayoutType }
    expect(chooseLayout(numbered.blocks)).toBe('numberedList')
    expect(varyLayouts([numbered, numbered])).toEqual(['auto', 'checklist'])
  })

  it('gives the second of two stat-grid cards a statList, not a statHero', () => {
    const stat = (v: string): ContentBlock => ({ type: 'stat', value: v, label: 'x' })
    const grid = { blocks: [heading, stat('1'), stat('2'), stat('3')], layout: 'auto' as LayoutType }
    expect(chooseLayout(grid.blocks)).toBe('statGrid')
    expect(varyLayouts([grid, grid])).toEqual(['auto', 'statList'])
  })

  it('gives the second of two comparison cards a comparisonTable', () => {
    const group = (h: string): ContentBlock => ({ type: 'comparisonGroup', heading: h, items: ['a'] })
    const cmp = { blocks: [heading, group('A'), group('B')], layout: 'auto' as LayoutType }
    expect(chooseLayout(cmp.blocks)).toBe('comparison')
    expect(varyLayouts([cmp, cmp])).toEqual(['auto', 'comparisonTable'])
  })

  it('leaves a quote-plus-list card on auto when its kind (quote) cannot hold the list layout', () => {
    const mixed = { blocks: [heading, quote, shortList], layout: 'auto' as LayoutType }
    expect(chooseLayout(mixed.blocks)).toBe('iconGrid')
    expect(varyLayouts([listCard, mixed])).toEqual(['auto', 'auto'])
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

  it('still varies two consecutive list cards that each carry a photo', () => {
    const photo: ContentBlock = { type: 'image', url: 'https://example.com/a.jpg' }
    const withPhoto = { blocks: [heading, shortList, photo], layout: 'auto' as LayoutType }
    expect(varyLayouts([timelineCard, withPhoto, withPhoto])).toEqual(['auto', 'auto', 'checklist'])
  })
})
