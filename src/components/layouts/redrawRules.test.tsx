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
/** The opening tag of every aria-hidden numeral, in order. */
const numeralTags = (out: string) =>
  [...out.matchAll(/<[a-z]+[^>]*aria-hidden="true"[^>]*>\d{2}<\/[a-z]+>/g)].map((match) => match[0])
/** The opening tags of the list's item containers (`li`), in order. */
const rowTags = (out: string) => [...out.matchAll(/<li\b[^>]*>/g)].map((match) => match[0])
/** The font size on each item's text element, in order. */
const itemTextSizes = (out: string) =>
  [...out.matchAll(/<span data-item-text=""[^>]*style="[^"]*?font-size:([^;"]+)/g)].map((match) => match[1])

const LEAD = 'calc(var(--slide-size-body) * 1.2)'
const BODY = 'var(--slide-size-body)'
const TIGHT = 'var(--slide-gap-tight)'

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
  const expressive = style === 'expressive'
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

  describe('chips', () => {
    it('draws a large accent numeral per item', () => {
      const out = html(find('g-icons3'))
      expect(numerals(out)).toEqual(['01', '02', '03'])
      for (const tag of numeralTags(out)) expect(tag).toContain('text-slide-accent')
    })

    it('grows the numeral in a single row and keeps h1 for the two-row form', () => {
      const one = numeralTags(html(find('g-icons3')))[0]
      expect(one).toContain(`font-size:calc(var(--slide-size-h1) * ${expressive ? 2 : 1.6})`)
      const two = numeralTags(html(find('g-icons6')))[0]
      expect(two).toContain(expressive ? 'font-size:calc(var(--slide-size-h1) * 1.25)' : 'font-size:var(--slide-size-h1)')
    })

    it('sets the text at the foot of a single-row column and directly under the numeral in two rows', () => {
      const one = html(find('g-icons3'))
      expect(one.split('class="min-w-0 text-slide-foreground/90 mt-auto"').length - 1).toBe(3)
      expect(html(find('g-icons6'))).not.toContain('mt-auto')
    })

    it('always draws the item text at the lead size, long items included', () => {
      expect(itemTextSizes(html(find('g-icons6')))).toEqual(Array(6).fill(LEAD))
      const long = listCard('iconGrid', Array.from({ length: 5 }, (_, i) => `${'long text '.repeat(6)}${i}`), style)
      expect(itemTextSizes(html(long))).toEqual(Array(5).fill(LEAD))
    })

    it('puts a hairline above each structured column and none above an expressive one', () => {
      const rows = rowTags(html(find('g-icons3')))
      expect(rows.length).toBe(3)
      for (const row of rows) {
        if (expressive) expect(row).not.toContain('border-t')
        else expect(row).toContain('border-t border-slide-border')
      }
    })

    it('arranges up to four chips in one row and five or six in three columns', () => {
      expect(html(listCard('iconGrid', items(4), style))).toContain('repeat(4, minmax(0, 1fr))')
      expect(html(listCard('iconGrid', items(6), style))).toContain('repeat(3, minmax(0, 1fr))')
    })

    it('falls back to numbered rows past six chips, drawing every item once', () => {
      const texts = items(7)
      const out = html(listCard('iconGrid', texts, style))
      expect(out).not.toContain('repeat(3, minmax(0, 1fr))')
      expect(out).not.toContain('repeat(7, minmax(0, 1fr))')
      // The numbered drawing: the fixed numeral column and the two-column flow.
      expect(out).toContain('width:3.5em')
      expect(out).toContain('@min-[640px]:grid-flow-col')
      expect(numerals(out)).toEqual(['01', '02', '03', '04', '05', '06', '07'])
      for (const text of texts) expect(out.split(text).length - 1).toBe(1)
    })
  })

  describe('numbered', () => {
    it('sets the numeral at h2 (structured) or h1 (expressive) in a 3.5em column', () => {
      const tags = numeralTags(html(find('g-numbered')))
      expect(tags.length).toBe(5)
      for (const tag of tags) {
        expect(tag).toContain(`font-size:var(--slide-size-${expressive ? 'h1' : 'h2'})`)
        expect(tag).toContain('width:3.5em')
        expect(tag).toContain('text-slide-accent')
      }
    })

    it('steps the numeral down to h3 past six items', () => {
      for (const tag of numeralTags(html(find('g-numbered10')))) {
        expect(tag).toContain('font-size:var(--slide-size-h3)')
        expect(tag).toContain('width:3.5em')
      }
    })

    it('puts a long list in two columns, ten items once each in order', () => {
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

    it('draws a hairline between structured rows and only space between expressive ones', () => {
      const out = html(find('g-numbered'))
      const root = out.match(/<ol [^>]*>/)?.[0] ?? ''
      if (expressive) {
        expect(out).not.toMatch(/divide-|border-t|border-b/)
        expect(root).toContain(`gap:${TIGHT}`)
      } else {
        expect(out).toContain('divide-y divide-slide-border')
        expect(root).not.toContain('gap:')
      }
    })

    it('puts no hairline above the first row of either column of a long list', () => {
      const rows = rowTags(html(find('g-numbered10')))
      expect(rows.length).toBe(10)
      if (expressive) {
        for (const row of rows) expect(row).not.toContain('border-t')
        return
      }
      expect(rows[0]).not.toContain('border-t')
      // The second column starts at row 6 on a wide slide; stacked below 640px it keeps its rule.
      expect(rows[5]).toContain('border-t border-slide-border @min-[640px]:border-t-0')
      for (const i of [1, 2, 3, 4, 6, 7, 8, 9]) {
        expect(rows[i]).toContain('border-t border-slide-border')
        expect(rows[i]).not.toContain('border-t-0')
      }
    })
  })

  describe('item text step', () => {
    it('is the lead size for a list of up to six short items', () => {
      expect(itemTextSizes(html(find('g-numbered')))).toEqual(Array(5).fill(LEAD))
      expect(itemTextSizes(html(find('g-checklist')))).toEqual(Array(4).fill(LEAD))
    })

    it('is the body size for ten items or for a long text', () => {
      expect(itemTextSizes(html(find('g-numbered10')))).toEqual(Array(10).fill(BODY))
      expect(itemTextSizes(html(find('g-split')))).toEqual(Array(8).fill(BODY))
      const long = listCard('numberedList', ['x'.repeat(65), 'short'], style)
      expect(itemTextSizes(html(long))).toEqual([BODY, BODY])
    })
  })

  describe('checklist', () => {
    it('draws a tick per row, 1.4em in accent when structured and in an unfilled ring when expressive', () => {
      const out = html(find('g-checklist'))
      expect(out.split('<svg').length - 1).toBe(4)
      if (expressive) {
        expect(out).toContain('border-2 border-slide-accent')
        expect(out).toContain('width:1.9em')
        expect(out).not.toContain('width:1.4em')
      } else {
        expect(out).toContain('width:1.4em')
        expect(out).toContain('text-slide-accent')
        expect(out).not.toContain('border-2')
      }
    })
  })

  describe('split', () => {
    it('draws two columns with a square marker (structured) or an h3 numeral (expressive)', () => {
      const out = html(find('g-split'))
      expect(out).toContain('grid-cols-2')
      if (expressive) {
        expect(numerals(out).length).toBe(8)
        for (const tag of numeralTags(out)) expect(tag).toContain('font-size:var(--slide-size-h3)')
        expect(out).toContain(`row-gap:${TIGHT}`)
      } else {
        expect(numerals(out)).toEqual([])
        expect(out.split('class="block bg-slide-accent"').length - 1).toBe(8)
      }
    })

    it('puts no hairline above the first row of either column', () => {
      const rows = rowTags(html(find('g-split')))
      expect(rows.length).toBe(8)
      rows.forEach((row, i) => {
        if (expressive || i < 2) expect(row).not.toContain('border-t')
        else expect(row).toContain('border-t border-slide-border')
      })
    })
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
    if (mark === 'either') expect(numerals(out)).toEqual(expressive ? ['01'] : [])
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

/* Stats: the figure is the graphic. A column of figures on one baseline, a ledger, and the lone hero figure. */

const STAT_IDS = ['g-stats3', 'g-stats5', 'g-statlist', 'g-stathero']

/** The opening tag of every stat figure, and of every stat label, in document order. */
const figureTags = (out: string) => [...out.matchAll(/<div data-stat-figure=""[^>]*>/g)].map((match) => match[0])
const labelTags = (out: string) => [...out.matchAll(/<div data-stat-label=""[^>]*>/g)].map((match) => match[0])
/** The words inside every stat figure, and inside every stat label, in document order. */
const innerTexts = (out: string, hook: 'figure' | 'label') =>
  [...out.matchAll(new RegExp(`<div data-stat-${hook}=""[^>]*>(.*?)</div>`, 'g'))].map((m) => m[1].replace(/<[^>]*>/g, ''))
/** The number a figure's `calc(var(--slide-size-hN) * n)` multiplies its step by. */
const figureFactor = (tag: string) => Number(tag.match(/font-size:calc\(var\(--slide-size-h\d\) \* ([\d.]+)\)/)?.[1])

const statCard = (layout: LayoutType, values: string[], style: VisualStyle, label = 'LABEL'): Card => ({
  id: 'x',
  orderIndex: 1,
  layout,
  visualStyle: style,
  blocks: [
    { type: 'heading', text: 'STATHEAD' },
    ...values.map((value, i) => ({ type: 'stat', value, label: `${label}${String.fromCharCode(65 + i)}` })),
  ] as ContentBlock[],
})

describe.each(STYLES)('redrawn stats (%s)', (style) => {
  const expressive = style === 'expressive'
  const cards = withStyle(GALLERY_DECK, style)
  const find = (id: string) => cards.find((c) => c.id === id) as Card

  it.each(STAT_IDS)('%s draws no boxed card, no surface and no fixed text size', (id) => {
    const out = html(find(id))
    expect(out).not.toMatch(BOXED)
    expect(out).not.toMatch(FIXED_TEXT_SIZE)
    expect(out).not.toMatch(SIDE_TAB)
    // The expressive hero keeps its one accent panel, which is not a surface.
    expect(out).not.toContain('bg-slide-surface')
  })

  describe('boxes', () => {
    it('draws every figure and label once, the long value too', () => {
      const out = html(find('g-stats5'))
      const stats = find('g-stats5').blocks.flatMap((b) => (b.type === 'stat' ? [b] : []))
      expect(stats.length).toBe(5)
      expect(innerTexts(out, 'figure')).toEqual(stats.map((b) => b.value))
      expect(innerTexts(out, 'label')).toEqual(stats.map((b) => b.label))
      expect(out.split('1,250,000').length - 1).toBe(1)
      expect(figureTags(out).length).toBe(5)
      expect(labelTags(out).length).toBe(5)
    })

    it('keeps each stat one element on the figure row and the label row of a shared grid', () => {
      const out = html(find('g-stats3'))
      expect(out.split('grid-rows-subgrid').length - 1).toBe(3)
      expect(out.split('grid-row:span 2').length - 1).toBe(3)
      // Within each stat the figure comes before its label, and a label comes before the next figure.
      const figures = [...out.matchAll(/data-stat-figure=""/g)].map((m) => m.index as number)
      const labels = [...out.matchAll(/data-stat-label=""/g)].map((m) => m.index as number)
      expect(figures.length).toBe(3)
      figures.forEach((at, i) => {
        expect(at).toBeLessThan(labels[i])
        if (i > 0) expect(labels[i - 1]).toBeLessThan(at)
      })
    })

    it('sets each figure in accent, in the heading font, heavier when expressive', () => {
      for (const tag of figureTags(html(find('g-stats3')))) {
        expect(tag).toContain('text-slide-accent')
        expect(tag).toContain('var(--slide-font-heading)')
        expect(tag).toContain(`font-weight:${expressive ? 800 : 600}`)
      }
    })

    it('puts a rule in accent over each structured column and none over an expressive one', () => {
      const out = html(find('g-stats3'))
      expect(out.split('border-t border-slide-accent').length - 1).toBe(expressive ? 0 : 3)
    })

    it('sets the labels at body size in muted ink', () => {
      for (const tag of labelTags(html(find('g-stats3')))) {
        expect(tag).toContain('text-slide-muted')
        expect(tag).toContain('font-size:var(--slide-size-body)')
      }
    })

    it('grows the figure past h1 for up to three columns, less for four and h1 itself for five or more', () => {
      const bump = expressive ? 1.15 : 1
      const factor = (values: string[]) => figureFactor(figureTags(html(statCard('statGrid', values, style)))[0])
      expect(factor(['1', '2', '3'])).toBeCloseTo(1.4 * bump, 3)
      expect(factor(['1', '2', '3', '4'])).toBeCloseTo(1.15 * bump, 3)
      expect(factor(['1', '2', '3', '4', '5'])).toBeCloseTo(1 * bump, 3)
    })

    it('steps every figure down together when the longest value will not fit, and no figure grows past its factor', () => {
      const long = figureTags(html(find('g-stats5'))).map(figureFactor)
      const short = figureTags(html(statCard('statGrid', ['1', '2', '3', '4', '5'], style))).map(figureFactor)
      expect(new Set(long).size).toBe(1)
      expect(long[0]).toBeLessThan(short[0] * 0.75)
    })

    it('lays five or six stats out three to a row and seven or more four to a row', () => {
      expect(html(statCard('statGrid', ['1', '2', '3', '4', '5'], style))).toContain('repeat(3, minmax(0, 1fr))')
      expect(html(statCard('statGrid', ['1', '2', '3', '4', '5', '6'], style))).toContain('repeat(3, minmax(0, 1fr))')
      expect(html(statCard('statGrid', ['1', '2', '3', '4', '5', '6', '7'], style))).toContain('repeat(4, minmax(0, 1fr))')
      expect(html(statCard('statGrid', ['1', '2', '3', '4'], style))).toContain('repeat(4, minmax(0, 1fr))')
    })

    it('gives the grid the remaining height with the pair at the top of each column when it fills the body', () => {
      const out = html(find('g-stats3'))
      expect(out).toContain('data-fill=""')
      expect(out).toContain('flex-1')
      expect(out).toContain('align-content:start')
      expect(out).toContain('grid-auto-rows:auto minmax(min-content, 1fr)')
    })

    it('draws a one-stat grid once', () => {
      const out = html(statCard('statGrid', ['ONLYFIGURE'], style, 'ONLYLABEL'))
      expect(out.split('ONLYFIGURE').length - 1).toBe(1)
      expect(out.split('ONLYLABELA').length - 1).toBe(1)
      expect(figureTags(out).length).toBe(1)
    })

    it('has no accent owner', () => {
      expect(html(find('g-stats5'))).not.toContain('data-accent-owner')
    })
  })

  describe('statRows', () => {
    it('draws a right-aligned figure column 34% wide in accent', () => {
      const tags = figureTags(html(find('g-statlist')))
      expect(tags.length).toBe(4)
      for (const tag of tags) {
        expect(tag).toContain('text-right')
        expect(tag).toContain('text-slide-accent')
        expect(tag).toContain('width:34%')
        expect(tag).toContain(`font-weight:${expressive ? 800 : 600}`)
      }
    })

    it('sets the figure at h2 when structured and h1 when expressive', () => {
      for (const tag of figureTags(html(find('g-statlist')))) {
        expect(tag).toContain(`font-size:calc(var(--slide-size-${expressive ? 'h1' : 'h2'}) * 1.000)`)
      }
    })

    it('separates structured rows by a hairline between rows only and expressive rows by space alone', () => {
      const out = html(find('g-statlist'))
      const root = out.match(/<div [^>]*data-fill=""[^>]*>/)?.[0] ?? ''
      const rows = [...out.matchAll(/<div class="flex [^"]*items-center[^"]*"[^>]*>/g)].map((m) => m[0])
      expect(rows.length).toBe(4)
      expect(out).not.toContain('divide-')
      if (expressive) {
        expect(out).not.toMatch(/border-t|border-b/)
        expect(root).toContain(`gap:${TIGHT}`)
      } else {
        expect(rows[0]).not.toContain('border-t')
        for (const row of rows.slice(1)) expect(row).toContain('border-t border-slide-border')
      }
    })

    it('sets the label at the lead size for a few short labels and body size otherwise', () => {
      const size = (tags: string[]) => tags.map((tag) => tag.match(/font-size:([^;"]+)/)?.[1])
      expect(size(labelTags(html(find('g-statlist'))))).toEqual(Array(4).fill(LEAD))
      const long = statCard('statList', ['1', '2'], style, 'x'.repeat(65))
      expect(size(labelTags(html(long)))).toEqual([BODY, BODY])
    })

    it('puts a section gap between the figure and its label and shares the height when it fills', () => {
      const out = html(find('g-statlist'))
      expect(out).toContain('data-fill=""')
      expect(out).toContain('gap:var(--slide-gap-section)')
      expect(out.split('flex-1').length - 1).toBeGreaterThanOrEqual(5)
    })

    it('draws every stat once', () => {
      const out = html(find('g-statlist'))
      for (const block of find('g-statlist').blocks) {
        if (block.type !== 'stat') continue
        expect(out.split(block.label).length - 1).toBe(1)
      }
    })
  })

  describe('statHero', () => {
    it('draws exactly one accent owner when expressive and at most one when structured', () => {
      const owners = html(find('g-stathero')).split('data-accent-owner').length - 1
      if (expressive) expect(owners).toBe(1)
      else expect(owners).toBeLessThanOrEqual(1)
    })

    it('sets the figure at 2.2 times h1 with a tight line height, and its label at the lead size', () => {
      const out = html(find('g-stathero'))
      const [figure] = figureTags(out)
      expect(figure).toContain('font-size:calc(var(--slide-size-h1) * 2.200)')
      expect(figure).toContain('line-height:0.95')
      // Accent text when structured; on the expressive panel it is the panel's own ink.
      expect(figure).toMatch(expressive ? /text-slide-accent-foreground/ : /text-slide-accent(?!-)/)
      expect(labelTags(out)[0]).toContain(`font-size:${LEAD}`)
    })

    it('steps a long figure down so it fits', () => {
      const card = statCard('statHero', ['1,250,000,000'], style)
      expect(figureFactor(figureTags(html(card))[0])).toBeLessThan(1.5)
    })

    it('draws the figure and its label once', () => {
      const out = html(find('g-stathero'))
      expect(out.split('100%').length - 1).toBe(1)
      expect(out.split('of loops need an exit').length - 1).toBe(1)
    })
  })
})
