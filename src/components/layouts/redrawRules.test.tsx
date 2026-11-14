import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Card, ContentBlock, LayoutType, VisualStyle } from '@/engine/contentBlocks'
import { withStyle } from '@/engine/fixtures/cppDeck'
import { GALLERY_DECK } from '@/engine/fixtures/galleryDeck'
import { LayoutRenderer } from './LayoutRenderer'

/*
  The rules every redrawn arrangement shares, checked over the gallery deck's cards in both
  visual treatments: numerals are the graphic, items are separated by rules and space rather
  than boxes, text is sized by the slide's own steps. Later tasks of the redraw add their
  arrangements to this file.
*/

const html = (card: Card) => renderToStaticMarkup(<LayoutRenderer card={card} context={{ isFirstCard: false }} />)

const BOXED = /class="[^"]*\bborder\b[^"]*\bbg-slide-surface\b|class="[^"]*\bbg-slide-surface\b[^"]*\bborder\b/
const NUMERAL_DISC = /class="[^"]*rounded-full[^"]*bg-slide-accent[^"]*"[^>]*>\s*\d/
const FIXED_TEXT_SIZE = /class="[^"]*\btext-(xs|sm|base|lg|xl|2xl)\b/
const SIDE_TAB = /class="[^"]*\bborder-l-4\b/

const LIST_IDS = ['g-icons3', 'g-icons6', 'g-numbered', 'g-numbered10', 'g-checklist', 'g-split']
const STYLES: VisualStyle[] = ['structured', 'expressive']

/** The text of every aria-hidden element that holds only digits, in document order. */
const numerals = (out: string) =>
  [...out.matchAll(/<[a-z]+[^>]*aria-hidden="true"[^>]*>(\d{2})<\/[a-z]+>/g)].map((match) => match[1])

const listCard = (layout: LayoutType, items: string[], style: VisualStyle): Card => ({
  id: 'x',
  orderIndex: 1,
  layout,
  visualStyle: style,
  blocks: [
    { type: 'heading', text: 'ROWHEAD' },
    { type: 'bulletList', items },
  ] as ContentBlock[],
})

const items = (n: number) => Array.from({ length: n }, (_, i) => `ITEMTEXT${String.fromCharCode(65 + i)}`)

describe.each(STYLES)('redrawn lists (%s)', (style) => {
  const cards = withStyle(GALLERY_DECK, style)
  const find = (id: string) => cards.find((c) => c.id === id) as Card

  it.each(LIST_IDS)('%s draws no boxed card, no numeral disc, no side tab and no fixed text size', (id) => {
    const out = html(find(id))
    expect(out).not.toMatch(BOXED)
    expect(out).not.toMatch(NUMERAL_DISC)
    expect(out).not.toMatch(SIDE_TAB)
    expect(out).not.toMatch(FIXED_TEXT_SIZE)
    expect(out).not.toContain('bg-slide-surface')
  })

  it('draws a large accent numeral per item', () => {
    const out = html(find('g-icons3'))
    expect(numerals(out)).toEqual(['01', '02', '03'])
    const tags = [...out.matchAll(/<[a-z]+[^>]*aria-hidden="true"[^>]*>\d{2}<\/[a-z]+>/g)].map((m) => m[0])
    for (const tag of tags) expect(tag).toContain('text-slide-accent')
    expect(tags[0]).toContain(style === 'expressive' ? 'calc(var(--slide-size-h1) * 1.25)' : 'var(--slide-size-h1)')
  })

  it('falls back to rows past six chips, drawing every item once', () => {
    const texts = items(7)
    const out = html(listCard('iconGrid', texts, style))
    expect(out).not.toContain('repeat(7, minmax(0, 1fr))')
    expect(out).not.toContain('grid-cols-3')
    expect(numerals(out)).toEqual(['01', '02', '03', '04', '05', '06', '07'])
    for (const text of texts) expect(out.split(text).length - 1).toBe(1)
  })

  it('arranges up to four chips in one row and five or six in three columns', () => {
    expect(html(listCard('iconGrid', items(4), style))).toContain('repeat(4, minmax(0, 1fr))')
    expect(html(listCard('iconGrid', items(6), style))).toContain('repeat(3, minmax(0, 1fr))')
  })

  it('puts a long numbered list in two columns, ten items once each in order', () => {
    const out = html(find('g-numbered10'))
    expect(out).toContain('@min-[640px]:grid-cols-2')
    expect(out).toContain('@min-[640px]:grid-flow-col')
    expect(out).toContain('repeat(5, minmax(min-content, 1fr))')
    expect(numerals(out)).toEqual(['01', '02', '03', '04', '05', '06', '07', '08', '09', '10'])
    const texts = GALLERY_DECK.find((c) => c.id === 'g-numbered10')!.blocks.flatMap((b) =>
      b.type === 'bulletList' ? b.items : [],
    )
    let last = -1
    for (const text of texts) {
      expect(out.split(text).length - 1).toBe(1)
      const at = out.indexOf(text)
      expect(at).toBeGreaterThan(last)
      last = at
    }
  })

  it('lets the rows of a long list take their own height when it does not fill the body', () => {
    const card = listCard('numberedList', items(10), style)
    card.blocks.push({ type: 'paragraph', text: 'AFTERLIST' })
    expect(html(card)).toContain('repeat(5, auto)')
  })

  it('keeps a short numbered list in one column', () => {
    const out = html(find('g-numbered'))
    expect(out).not.toContain('grid-flow-col')
    expect(numerals(out)).toEqual(['01', '02', '03', '04', '05'])
  })

  it('uses the roomy step for a few short items and the normal step otherwise', () => {
    const roomy = html(find('g-icons3'))
    expect(roomy).toContain('font-size:calc(var(--slide-size-body) * 1.2)')
    const normal = html(find('g-numbered10'))
    expect(normal).not.toContain('font-size:calc(var(--slide-size-body) * 1.2)')
    expect(normal).toContain('font-size:var(--slide-size-body)')
  })

  it('separates structured rows with rules and expressive rows with space only', () => {
    const out = html(find('g-numbered'))
    if (style === 'structured') expect(out).toContain('divide-slide-border')
    else expect(out).not.toMatch(/divide-|border-t|border-b/)
  })

  it.each<[LayoutType, 'numeral' | 'tick' | 'either']>([
    ['iconGrid', 'numeral'],
    ['numberedList', 'numeral'],
    ['checklist', 'tick'],
    ['splitList', 'either'],
  ])('draws a one-item %s', (layout, mark) => {
    const out = html(listCard(layout, ['ONLYITEM'], style))
    expect(out.split('ONLYITEM').length - 1).toBe(1)
    if (mark === 'numeral') expect(numerals(out)).toEqual(['01'])
    if (mark === 'tick') expect(out.split('<svg').length - 1).toBe(1)
    if (mark === 'either') expect(numerals(out)).toEqual(style === 'expressive' ? ['01'] : [])
  })

  it('draws a tick per checklist row, in a ring only when expressive', () => {
    const out = html(find('g-checklist'))
    expect(out.split('<svg').length - 1).toBe(4)
    if (style === 'expressive') expect(out).toContain('border-2 border-slide-accent')
    else expect(out).not.toContain('border-2')
  })

  it('draws the split list in two columns with a marker per row', () => {
    const out = html(find('g-split'))
    expect(out).toContain('grid-cols-2')
    if (style === 'expressive') expect(numerals(out).length).toBe(8)
  })

  it('draws every list item once under its own address', () => {
    for (const id of LIST_IDS) {
      const card = find(id)
      const list = card.blocks.find((b) => b.type === 'bulletList')
      if (list?.type !== 'bulletList') throw new Error('no list')
      const out = html(card)
      for (const text of list.items) expect(out.split(text).length - 1).toBe(1)
    }
  })
})
