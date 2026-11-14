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
const rowTags = (out: string) => [...out.matchAll(/<li\b[^>]*>/g)].map((match) => match[0]).filter((tag) => !tag.includes('data-track'))
/** The font size on each item's text element, in order. */
const itemTextSizes = (out: string) =>
  [...out.matchAll(/<span data-item-text=""[^>]*style="[^"]*?font-size:([^;"]+)/g)].map((match) => match[1])

const LEAD = 'calc(var(--slide-size-body) * 1.2)'
const EYEBROW = 'calc(var(--slide-size-body) * 0.65)'
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

    it('sets the labels in muted ink', () => {
      for (const tag of labelTags(html(find('g-stats3')))) expect(tag).toContain('text-slide-muted')
    })

    it('grows the figure to 2.2 times h1 for up to three columns, 1.7 for four and 1.4 for five or more', () => {
      const bump = expressive ? 1.15 : 1
      const factor = (values: string[]) => figureFactor(figureTags(html(statCard('statGrid', values, style)))[0])
      expect(factor(['1', '2', '3'])).toBeCloseTo(2.2 * bump, 3)
      expect(factor(['1', '2', '3', '4'])).toBeCloseTo(1.7 * bump, 3)
      expect(factor(['1', '2', '3', '4', '5'])).toBeCloseTo(1.4 * bump, 3)
      expect(factor(['1', '2', '3', '4', '5', '6', '7'])).toBeCloseTo(1.4 * bump, 3)
    })

    it('sizes each figure by its own value: only the long one steps down, the short ones are at the full factor', () => {
      const sizes = figureTags(html(find('g-stats5'))).map(figureFactor)
      expect(sizes.length).toBe(5)
      const full = 1.4 * (expressive ? 1.15 : 1)
      for (const [i, size] of sizes.entries()) {
        if (i === 2) expect(size).toBeLessThan(full * 0.6)
        else expect(size).toBeCloseTo(full, 3)
      }
    })

    it('sits each figure at the foot of the shared figure row so a smaller one keeps its neighbours baseline', () => {
      for (const tag of figureTags(html(find('g-stats5')))) expect(tag).toContain('align-self:end')
    })

    it('sets the labels at the lead size for a few short labels and body size otherwise', () => {
      const size = (tags: string[]) => tags.map((tag) => tag.match(/font-size:([^;"]+)/)?.[1])
      expect(size(labelTags(html(find('g-stats3'))))).toEqual(Array(3).fill(LEAD))
      expect(size(labelTags(html(find('g-stats5'))))).toEqual(Array(5).fill(LEAD))
      const long = statCard('statGrid', ['1', '2', '3'], style, 'x'.repeat(65))
      expect(size(labelTags(html(long)))).toEqual(Array(3).fill(BODY))
    })

    it('lays five or six stats out three to a row and seven or more four to a row', () => {
      expect(html(statCard('statGrid', ['1', '2', '3', '4', '5'], style))).toContain('repeat(3, minmax(0, 1fr))')
      expect(html(statCard('statGrid', ['1', '2', '3', '4', '5', '6'], style))).toContain('repeat(3, minmax(0, 1fr))')
      expect(html(statCard('statGrid', ['1', '2', '3', '4', '5', '6', '7'], style))).toContain('repeat(4, minmax(0, 1fr))')
      expect(html(statCard('statGrid', ['1', '2', '3', '4'], style))).toContain('repeat(4, minmax(0, 1fr))')
    })

    it('gives the grid the remaining height with the pair at the top of each column when it fills the body', () => {
      const out = html(find('g-stats3'))
      const root = out.match(/<div [^>]*data-fill=""[^>]*>/)?.[0] ?? ''
      expect(root).toMatch(/class="[^"]*\bflex-1\b/)
      expect(root).toContain('align-content:start')
      expect(root).toContain('grid-auto-rows:auto minmax(min-content, 1fr)')
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
    it('draws a left-aligned figure column 24% wide in accent', () => {
      const tags = figureTags(html(find('g-statlist')))
      expect(tags.length).toBe(4)
      for (const tag of tags) {
        expect(tag).not.toContain('text-right')
        expect(tag).toContain('text-slide-accent')
        expect(tag).toContain('width:24%')
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
      const root = out.match(/<div [^>]*data-fill=""[^>]*>/)?.[0] ?? ''
      expect(root).toMatch(/class="[^"]*\bflex-1\b/)
      expect(out).toContain('gap:var(--slide-gap-section)')
      const rows = [...out.matchAll(/<div class="flex [^"]*items-center[^"]*"[^>]*>/g)].map((m) => m[0])
      expect(rows.length).toBe(4)
      for (const row of rows) expect(row).toMatch(/\bflex-1\b/)
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

/* Timelines: one continuous track per row of steps, a node per step, the label and its text beside it. */

const TIMELINE_IDS = ['g-timeline', 'g-timelinerow', 'g-timelinerow6']

/** The opening tag of every timeline track, step label, text and number, and the words inside each label and text. */
const trackTags = (out: string) => [...out.matchAll(/<li [^>]*data-track=""[^>]*>/g)].map((m) => m[0])
const stepLabelTags = (out: string) => [...out.matchAll(/<div data-step-label=""[^>]*>/g)].map((m) => m[0])
const stepTextTags = (out: string) => [...out.matchAll(/<div data-step-text=""[^>]*>/g)].map((m) => m[0])
const stepNumberTags = (out: string) => [...out.matchAll(/<span [^>]*data-step-number=""[^>]*>[^<]*<\/span>/g)].map((m) => m[0])
const stepWords = (out: string, hook: 'label' | 'text') =>
  [...out.matchAll(new RegExp(`<div data-step-${hook}=""[^>]*>(.*?)</div>`, 'g'))].map((m) => m[1].replace(/<[^>]*>/g, ''))
const stepsOf = (card: Card) => card.blocks.flatMap((b) => (b.type === 'timelineStep' ? [b] : []))
const SPACING_UTILITY = /class="[^"]*\b(gap|space-y|space-x|p|px|py|pl|pt|pb)-\d/
const STEP_FONT_SIZE = 'font-size:var(--slide-size-h3)'

const stepCard = (layout: LayoutType, count: number, style: VisualStyle, text = 'STEPTEXT'): Card => ({
  id: 'x',
  orderIndex: 1,
  layout,
  visualStyle: style,
  blocks: [
    { type: 'heading', text: 'STEPHEAD' },
    ...Array.from({ length: count }, (_, i) => ({
      type: 'timelineStep',
      label: `STEPLABEL${String.fromCharCode(65 + i)}`,
      text: `${text}${String.fromCharCode(65 + i)}`,
    })),
  ] as ContentBlock[],
})

describe.each(STYLES)('redrawn timelines (%s)', (style) => {
  const expressive = style === 'expressive'
  const cards = withStyle(GALLERY_DECK, style)
  const find = (id: string) => cards.find((c) => c.id === id) as Card

  it.each(TIMELINE_IDS)('%s draws no boxed card, no numeral disc, no surface, no gradient and no fixed text size', (id) => {
    const out = html(find(id))
    expect(out).not.toMatch(BOXED)
    expect(out).not.toMatch(NUMERAL_DISC)
    expect(out).not.toMatch(SIDE_TAB)
    expect(out).not.toMatch(FIXED_TEXT_SIZE)
    expect(out).not.toMatch(SPACING_UTILITY)
    expect(out).not.toContain('bg-slide-surface')
    expect(out).not.toContain('bg-gradient')
    expect(out).not.toContain('data-accent-owner')
  })

  it.each([
    ['g-timeline', 1],
    ['g-timelinerow', 1],
    ['g-timelinerow6', 2],
  ])('%s draws %i track element(s): empty, hidden from assistive technology and in accent', (id, count) => {
    const out = html(find(id))
    const tags = trackTags(out)
    expect(tags.length).toBe(count)
    for (const tag of tags) {
      expect(tag).toContain('aria-hidden="true"')
      expect(tag).toContain('bg-slide-accent/40')
    }
    // The track holds nothing: it is a sibling of the steps, never a wrapper around them.
    expect(out.split('data-track=""').length - 1).toBe(count)
    expect(out.match(/<li [^>]*data-track=""[^>]*><\/li>/g)?.length).toBe(count)
  })

  it('draws the vertical track as one line the height of the arrangement, 2px thick and 4px when expressive', () => {
    const [track] = trackTags(html(find('g-timeline')))
    expect(track).toContain('inset-y-0')
    expect(track).toContain(`width:${expressive ? 4 : 2}px`)
  })

  it('sizes the vertical track and node column from the body size of the list, so an element size pick on a step cannot move a node off the track', () => {
    const out = html(find('g-timeline'))
    const [track] = trackTags(out)
    expect(out).toContain('--timeline-unit:var(--slide-size-body)')
    expect(track).toMatch(/left:calc\(var\(--timeline-unit\) \* 1\.25 - /)
    expect(track).toContain('role="presentation"')
    expect(out).toMatch(/width:calc\(var\(--timeline-unit\) \* 2\.5\);height:calc\(var\(--slide-size-h3\)/)
    expect(out).not.toMatch(/width:2\.5em/)
  })

  it('draws each horizontal track across every column, 2px thick and 4px when expressive', () => {
    for (const id of ['g-timelinerow', 'g-timelinerow6']) {
      for (const track of trackTags(html(find(id)))) {
        expect(track).toContain('grid-column:1 / -1')
        expect(track).toContain(`height:${expressive ? 4 : 2}px`)
      }
    }
  })

  it.each(TIMELINE_IDS)('%s sets every label at h3 in the heading font, accent and semibold', (id) => {
    const tags = stepLabelTags(html(find(id)))
    expect(tags.length).toBe(stepsOf(find(id)).length)
    for (const tag of tags) {
      expect(tag).toContain(STEP_FONT_SIZE)
      expect(tag).toContain('var(--slide-font-heading)')
      expect(tag).toContain('text-slide-accent')
      expect(tag).toContain('font-weight:600')
    }
  })

  it.each(TIMELINE_IDS)('%s draws every step once, label and text, in order, one element per step', (id) => {
    const out = html(find(id))
    const steps = stepsOf(find(id))
    expect(stepWords(out, 'label')).toEqual(steps.map((s) => s.label))
    expect(stepWords(out, 'text')).toEqual(steps.map((s) => s.text))
    for (const s of steps) {
      expect(out.split(s.label).length - 1).toBe(1)
      expect(out.split(s.text).length - 1).toBe(1)
    }
    expect(rowTags(out).length).toBe(steps.length)
  })

  it('draws a one-step timeline once in both arrangements (a lone step is a leaf, not a group, so it has no track)', () => {
    for (const layout of ['timeline', 'timelineRow'] as const) {
      const out = html(stepCard(layout, 1, style, 'ONLYTEXT'))
      expect(out.split('STEPLABELA').length - 1).toBe(1)
      expect(out.split('ONLYTEXTA').length - 1).toBe(1)
      expect(trackTags(out).length).toBe(0)
    }
  })

  it('draws a two-step timeline as a group with one track, each step once', () => {
    for (const layout of ['timeline', 'timelineRow'] as const) {
      const out = html(stepCard(layout, 2, style, 'PAIRTEXT'))
      expect(trackTags(out).length).toBe(1)
      expect(rowTags(out).length).toBe(2)
      for (const letter of ['A', 'B']) {
        expect(out.split('STEPLABEL' + letter).length - 1).toBe(1)
        expect(out.split('PAIRTEXT' + letter).length - 1).toBe(1)
      }
    }
  })

  it('sets the step text at the lead size for a few short steps and body size for many or long ones', () => {
    const size = (tags: string[]) => tags.map((tag) => tag.match(/font-size:([^;"]+)/)?.[1])
    expect(size(stepTextTags(html(find('g-timeline'))))).toEqual(Array(4).fill(LEAD))
    expect(size(stepTextTags(html(find('g-timelinerow6'))))).toEqual(Array(6).fill(LEAD))
    expect(size(stepTextTags(html(stepCard('timelineRow', 7, style))))).toEqual(Array(7).fill(BODY))
    expect(size(stepTextTags(html(stepCard('timeline', 2, style, 'x'.repeat(65)))))).toEqual([BODY, BODY])
  })

  it('puts a dot on the track per step when structured and the step number when expressive', () => {
    for (const id of ['g-timeline', 'g-timelinerow']) {
      const out = html(find(id))
      const dots = out.split('width:0.75em;height:0.75em').length - 1
      const numbers = stepNumberTags(out)
      if (expressive) {
        expect(dots).toBe(0)
        expect(numbers.map((tag) => tag.replace(/<[^>]*>/g, ''))).toEqual(['1', '2', '3', '4'])
      } else {
        expect(dots).toBe(4)
        expect(numbers).toEqual([])
      }
    }
  })

  if (expressive) {
    it('sets the vertical step number at h3 on a patch of the slide background, the horizontal one at h1', () => {
      const out = html(find('g-timeline'))
      for (const tag of stepNumberTags(out)) {
        expect(tag).toContain(STEP_FONT_SIZE)
        expect(tag).toContain('font-weight:800')
        expect(tag).toContain('text-slide-accent')
      }
      expect(out.split('bg-slide-background').length - 1).toBe(4)
      const row = html(find('g-timelinerow'))
      for (const tag of stepNumberTags(row)) {
        expect(tag).toContain('font-size:var(--slide-size-h1)')
        expect(tag).toContain('font-weight:800')
        expect(tag).toContain('aria-hidden="true"')
      }
    })
  } else {
    it('draws no step number and no background patch when structured', () => {
      expect(html(find('g-timeline'))).not.toContain('bg-slide-background')
      expect(html(find('g-timelinerow6'))).not.toContain('data-step-number')
    })
  }

  it('arranges up to five steps in one row and wraps six or more into two rows of ceil(n / 2)', () => {
    const columns = (n: number) => html(stepCard('timelineRow', n, style)).match(/grid-template-columns:repeat\((\d+), /)?.[1]
    expect([2, 4, 5].map(columns)).toEqual(['2', '4', '5'])
    expect([6, 7, 8].map(columns)).toEqual(['3', '4', '4'])
    expect(trackTags(html(stepCard('timelineRow', 5, style))).length).toBe(1)
    expect(trackTags(html(stepCard('timelineRow', 7, style))).length).toBe(2)
  })

  it('draws the second row of a wrapped timeline after the first, its track between them', () => {
    const out = html(find('g-timelinerow6'))
    const tracks = [...out.matchAll(/data-track=""/g)].map((m) => m.index as number)
    const at = (label: string) => out.indexOf(label)
    expect(tracks[0]).toBeLessThan(at('Mon'))
    expect(at('Wed')).toBeLessThan(tracks[1])
    expect(tracks[1]).toBeLessThan(at('Thu'))
  })

  it('gives the arrangement the remaining height with the steps sharing it, content at the top', () => {
    const column = html(find('g-timeline'))
    const root = column.match(/<ol [^>]*data-fill=""[^>]*>/)?.[0] ?? ''
    expect(root).toMatch(/class="[^"]*\bflex-1\b/)
    for (const row of rowTags(column)) expect(row).toMatch(/\bflex-1\b/)
    const wide = html(find('g-timelinerow')).match(/<ol [^>]*data-fill=""[^>]*>/)?.[0] ?? ''
    expect(wide).toMatch(/class="[^"]*\bflex-1\b/)
    expect(wide).toContain('minmax(min-content, 1fr)')
    expect(wide).toContain('align-content:start')
  })
})

/* Comparisons: side-by-side columns with one toned panel for the accent owner, and a table of ruled cells. */

const COMPARE_IDS = ['g-compare', 'g-compare3', 'g-table']

/** The opening tag of every group or column heading, in document order. */
const groupHeadingTags = (out: string) => [...out.matchAll(/<div data-group-heading=""[^>]*>/g)].map((m) => m[0])
/** The words inside every group or column heading, in document order. */
const groupHeadingWords = (out: string) =>
  [...out.matchAll(/<div data-group-heading=""[^>]*>(.*?)<\/div>/g)].map((m) => m[1].replace(/<[^>]*>/g, ''))
/** The opening tag of the element carrying the accent owner mark. */
const ownerTags = (out: string) => [...out.matchAll(/<div [^>]*data-accent-owner=""[^>]*>/g)].map((m) => m[0])
/** The opening tag of every column of a comparison: the elements that sit under an `Adjustable`. */
const columnTags = (out: string) => [...out.matchAll(/<div [^>]*data-cmp-column=""[^>]*>/g)].map((m) => m[0])
const solidAccent = /\bbg-slide-accent(?!\/)/
const cmpCard = (layout: LayoutType, groups: number, style: VisualStyle, itemText = 'CELL'): Card => ({
  id: 'x',
  orderIndex: 1,
  layout,
  visualStyle: style,
  blocks: [
    { type: 'heading', text: 'CMPHEAD' },
    ...Array.from({ length: groups }, (_, g) => ({
      type: 'comparisonGroup',
      heading: `GROUP${g}`,
      items: [0, 1, 2].map((j) => `${itemText}${g}${j}`),
    })),
  ] as ContentBlock[],
})
const groupsOf = (card: Card) => card.blocks.flatMap((b) => (b.type === 'comparisonGroup' ? [b] : []))

describe.each(STYLES)('redrawn comparisons (%s)', (style) => {
  const expressive = style === 'expressive'
  const cards = withStyle(GALLERY_DECK, style)
  const find = (id: string) => cards.find((c) => c.id === id) as Card

  it.each(COMPARE_IDS)('%s draws no boxed card, no surface, no side tab, no fixed text size and no spacing utility', (id) => {
    const out = html(find(id))
    expect(out).not.toMatch(BOXED)
    expect(out).not.toMatch(SIDE_TAB)
    expect(out).not.toMatch(FIXED_TEXT_SIZE)
    expect(out).not.toMatch(SPACING_UTILITY)
    expect(out).not.toContain('bg-slide-surface')
    expect(out).not.toContain('divide-')
  })

  it.each(COMPARE_IDS)('%s has exactly one accent owner', (id) => {
    const out = html(find(id))
    expect(ownerTags(out).length).toBe(1)
    expect(out.split('data-accent-owner').length - 1).toBe(1)
  })

  it.each(COMPARE_IDS)('%s draws every group heading and item once, in order', (id) => {
    const out = html(find(id))
    const groups = groupsOf(find(id))
    expect(groupHeadingWords(out)).toEqual(groups.map((g) => g.heading))
    let last = -1
    // The headings are short words that sit inside other text, so they are checked by the words list above.
    for (const group of groups) {
      for (const text of group.items) {
        expect(out.split(text).length - 1, text).toBe(1)
        const at = out.indexOf(text)
        expect(at).toBeGreaterThan(last)
        last = at
      }
    }
  })

  it.each(COMPARE_IDS)('%s sets every heading at h3 in the heading font, semibold', (id) => {
    const tags = groupHeadingTags(html(find(id)))
    expect(tags.length).toBe(groupsOf(find(id)).length)
    for (const tag of tags) {
      expect(tag).toContain('font-size:var(--slide-size-h3)')
      expect(tag).toContain('var(--slide-font-heading)')
      expect(tag).toContain('font-semibold')
    }
  })

  it.each(COMPARE_IDS)('%s sets the owner heading in accent and every other in the foreground', (id) => {
    groupHeadingTags(html(find(id))).forEach((tag, i) => {
      if (i === 0) expect(tag).toContain('text-slide-accent')
      else {
        expect(tag).toContain('text-slide-foreground')
        expect(tag).not.toContain('text-slide-accent')
      }
    })
  })

  it('draws a one-group comparison once', () => {
    for (const layout of ['comparison', 'comparisonTable'] as const) {
      const out = html(cmpCard(layout, 1, style, 'ONLY'))
      for (const text of ['GROUP0', 'ONLY00', 'ONLY01', 'ONLY02']) expect(out.split(text).length - 1, text).toBe(1)
    }
  })

  describe('columns', () => {
    it('draws the groups side by side in equal columns from 640px up, in both treatments, with no stacked divider', () => {
      for (const id of ['g-compare', 'g-compare3']) {
        const out = html(find(id))
        const n = groupsOf(find(id)).length
        const root = out.match(/<div [^>]*data-fill=""[^>]*>/)?.[0] ?? ''
        expect(root).toContain(`repeat(${n}, minmax(0, 1fr))`)
        expect(root).toContain('@min-[640px]:[grid-template-columns:var(--cmp-cols)]')
        expect(root).toContain('column-gap:var(--slide-gap-group)')
        expect(root).not.toContain('flex-col')
        expect(out).not.toContain('divide-y')
      }
    })

    it('puts the same padding on every group, the owner and the others alike, so the headings line up', () => {
      const cols = columnTags(html(find('g-compare3')))
      expect(cols.length).toBe(3)
      for (const tag of cols) expect(tag).toContain('padding:var(--slide-gap-group)')
    })

    it('draws the accent owner on the tint with rounded corners and no border, and no other group on any ground', () => {
      const out = html(find('g-compare3'))
      const [owner] = ownerTags(out)
      expect(owner).toContain('data-cmp-column=""')
      expect(owner).toContain('data-accent-panel=""')
      expect(owner).toContain('background:var(--slide-panel-bg, var(--slide-ground-tint))')
      expect(owner).toContain('rounded-slide-sm')
      expect(owner).not.toMatch(/\bborder/)
      for (const tag of columnTags(out).slice(1)) {
        expect(tag).not.toContain('background')
        expect(tag).not.toContain('data-accent-panel')
        expect(tag).not.toContain('rounded-slide-sm')
      }
      expect(out.split('data-accent-panel').length - 1).toBe(1)
    })

    it('puts a vertical hairline only between two unowned neighbours, on desktop widths only', () => {
      const cols = columnTags(html(cmpCard('comparison', 4, style)))
      expect(cols.length).toBe(4)
      // The owner (first) and the group after it have none; the third and fourth sit beside an unowned neighbour.
      expect(cols[0]).not.toContain('border-l')
      expect(cols[1]).not.toContain('border-l')
      for (const tag of cols.slice(2)) expect(tag).toContain('@min-[640px]:border-l border-slide-border')
      for (const tag of columnTags(html(find('g-compare')))) expect(tag).not.toContain('border-l')
    })

    it('sets each structured item under a hairline, including the first, and an expressive one under none', () => {
      const rows = rowTags(html(find('g-compare3')))
      expect(rows.length).toBe(9)
      for (const row of rows) {
        if (expressive) expect(row).not.toContain('border-t')
        else expect(row).toContain('border-t border-slide-border')
      }
    })

    it('puts a small accent square before each expressive item and no marker when structured', () => {
      const out = html(find('g-compare3'))
      const squares = [...out.matchAll(/<span [^>]*aria-hidden="true"[^>]*width:0\.45em[^>]*><\/span>/g)].map((m) => m[0])
      if (expressive) {
        expect(squares.length).toBe(9)
        for (const square of squares) {
          expect(square).toContain('bg-slide-accent')
          expect(square).toContain('height:0.45em')
        }
        const texts = [...out.matchAll(/<span data-item-text=""[^>]*>/g)].map((m) => m[0])
        expect(texts.length).toBe(9)
        for (const tag of texts) expect(tag).toContain('font-weight:600')
      } else {
        expect(squares).toEqual([])
        expect(out).not.toMatch(solidAccent)
      }
    })

    it('sets the items at the lead size for a few short items across every group, else the body size', () => {
      expect(itemTextSizes(html(find('g-compare')))).toEqual(Array(6).fill(LEAD))
      expect(itemTextSizes(html(find('g-compare3')))).toEqual(Array(9).fill(BODY))
      expect(itemTextSizes(html(cmpCard('comparison', 2, style, 'x'.repeat(65))))).toEqual(Array(6).fill(BODY))
      expect(itemTextSizes(html(cmpCard('comparison', 4, style)))).toEqual(Array(12).fill(BODY))
    })

    it('stretches the columns to the zone height when it fills the body and leaves them their own height otherwise', () => {
      const root = html(find('g-compare')).match(/<div [^>]*data-fill=""[^>]*>/)?.[0] ?? ''
      expect(root).toMatch(/class="[^"]*\bflex-1\b/)
      expect(root).not.toContain('align-items')
      const card = cmpCard('comparison', 2, style)
      card.blocks.push({ type: 'paragraph', text: 'AFTERCOLUMNS' })
      expect(html(card)).not.toContain('data-fill')
    })
    it('shares the panel height between the rows when it fills the body, each item centred in its row', () => {
      for (const id of ['g-compare', 'g-compare3']) {
        const out = html(find(id))
        const lists = [...out.matchAll(/<ul [^>]*>/g)].map((m) => m[0])
        expect(lists.length).toBe(groupsOf(find(id)).length)
        for (const list of lists) expect(list).toMatch(/class="[^"]*\bflex-1\b/)
        const rows = rowTags(out)
        expect(rows.length).toBe(groupsOf(find(id)).length * 3)
        for (const row of rows) {
          expect(row).toMatch(/class="[^"]*\bflex-1\b/)
          expect(row).toMatch(/class="[^"]*\bitems-center\b/)
          expect(row).not.toMatch(/\bitems-start\b/)
        }
      }
    })

    it('leaves the rows at their own height, at the top, when the comparison does not fill the body', () => {
      const card = cmpCard('comparison', 2, style)
      card.blocks.push({ type: 'paragraph', text: 'AFTERCOLUMNS' })
      const out = html(card)
      for (const list of [...out.matchAll(/<ul [^>]*>/g)].map((m) => m[0])) expect(list).not.toContain('flex-1')
      for (const row of rowTags(out)) {
        expect(row).not.toContain('flex-1')
        expect(row).toContain('items-start')
      }
    })
  })

  describe('table', () => {
    it('draws no solid accent fill anywhere', () => {
      expect(html(find('g-table'))).not.toMatch(solidAccent)
    })

    it('keeps one subgrid element per column spanning the header row and every item row', () => {
      const out = html(find('g-table'))
      expect(out.split('grid-rows-subgrid').length - 1).toBe(3)
      expect(out.split('grid-row:span 5').length - 1).toBe(3)
    })

    it('puts a 2px accent rule under every header and the header text in accent for the owner only', () => {
      const tags = groupHeadingTags(html(find('g-table')))
      expect(tags.length).toBe(3)
      for (const tag of tags) expect(tag).toContain('border-b-2 border-slide-accent')
      expect(tags[0]).toContain('text-slide-accent')
      for (const tag of tags.slice(1)) expect(tag).toContain('text-slide-foreground')
    })

    it('puts a hairline under each cell with a tight vertical padding and no surface', () => {
      const out = html(find('g-table'))
      const cells = [...out.matchAll(/<div [^>]*class="[^"]*border-b border-slide-border[^"]*"[^>]*>/g)].map((m) => m[0])
      expect(cells.length).toBe(12)
      for (const cell of cells) {
        expect(cell).toContain('padding-block:var(--slide-gap-tight)')
        expect(cell).not.toContain('bg-slide-surface')
      }
    })

    it('marks the owner column element, with the tint panel only when expressive', () => {
      const out = html(find('g-table'))
      const [owner] = ownerTags(out)
      expect(owner).toContain('grid-rows-subgrid')
      if (expressive) {
        expect(owner).toContain('data-accent-panel=""')
        expect(owner).toContain('background:var(--slide-panel-bg, var(--slide-ground-tint))')
        expect(owner).toContain('rounded-slide-sm')
      } else {
        expect(owner).not.toContain('data-accent-panel')
        expect(owner).not.toContain('background')
      }
      expect(out.split('data-accent-panel').length - 1).toBe(expressive ? 1 : 0)
    })

    it('centres each cell in its row when it fills the body and leaves it alone otherwise', () => {
      const cells = (out: string) =>
        [...out.matchAll(/<div [^>]*class="[^"]*border-b border-slide-border[^"]*"[^>]*>/g)].map((m) => m[0])
      const filled = cells(html(find('g-table')))
      expect(filled.length).toBe(12)
      for (const cell of filled) {
        expect(cell).toMatch(/class="[^"]*\bflex\b/)
        expect(cell).toMatch(/class="[^"]*\bitems-center\b/)
      }
      const card = cmpCard('comparisonTable', 2, style)
      card.blocks.push({ type: 'paragraph', text: 'AFTERTABLE' })
      const loose = cells(html(card))
      expect(loose.length).toBe(6)
      for (const cell of loose) expect(cell).not.toContain('items-center')
    })

    it('shares the height between the item rows and leaves the header row to its content when it fills the body', () => {
      const root = html(find('g-table')).match(/<div [^>]*data-fill=""[^>]*>/)?.[0] ?? ''
      expect(root).toMatch(/class="[^"]*\bflex-1\b/)
      expect(root).toContain('grid-template-rows:auto repeat(4, minmax(min-content, 1fr))')
      const card = cmpCard('comparisonTable', 2, style)
      card.blocks.push({ type: 'paragraph', text: 'AFTERTABLE' })
      expect(html(card)).not.toContain('grid-template-rows')
    })
  })
})

/* Hero and quote: the title at the foot of the slide on the deep ground, the quote left-aligned under an oversized mark. */

const PHOTO_BLOCK: ContentBlock = { type: 'image', url: 'https://example.test/GROUND.png', alt: 'ground' }

/** The opening tag of the first element carrying the attribute `hook`. */
const tagWith = (out: string, hook: string) => out.match(new RegExp(`<[a-z0-9]+ [^>]*${hook}=""[^>]*>`))?.[0] ?? ''
/** The opening tag of every element carrying the attribute `hook`, in order. */
const tagsWith = (out: string, hook: string) =>
  [...out.matchAll(new RegExp(`<[a-z0-9]+ [^>]*${hook}=""[^>]*>`, 'g'))].map((m) => m[0])
/** The words inside the first element carrying `hook`, tags removed. */
const wordsOf = (out: string, hook: string) =>
  out.match(new RegExp(`<([a-z0-9]+) [^>]*${hook}=""[^>]*>(.*?)</\\1>`))?.[2].replace(/<[^>]*>/g, '') ?? ''

/**
 * Hard-coded colours: a `#` plus 3, 6 or 8 hex digits inside a `class` or `style` attribute value. Photo data
 * URIs (in `src`) and `url(#...)` references are not colours and are left out.
 */
const hardCodedColours = (out: string): string[] =>
  [...out.matchAll(/\b(?:class|style)="([^"]*)"/g)].flatMap((attribute) =>
    [
      ...attribute[1]
        .replace(/url\(#[^)]*\)/g, '')
        .matchAll(/#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![0-9a-fA-F])/g),
    ].map((m) => m[0]),
  )

describe('the colour check itself', () => {
  it('finds a hex colour in a style or class and nothing in a url reference or a src', () => {
    expect(hardCodedColours('<p style="color:#fff">')).toEqual(['#fff'])
    expect(hardCodedColours('<p class="bg-[#12ab34]" style="fill:#ffffff80">')).toEqual(['#12ab34', '#ffffff80'])
    expect(hardCodedColours('<rect style="fill:url(#g)"/><img src="data:image/svg+xml;utf8,%23fff#8fb8c9"/>')).toEqual([])
  })
})

const HERO_TITLE_SIZE = (expressive: boolean) => `calc(var(--slide-size-h1) * ${expressive ? 1.45 : 1.2})`

describe.each(STYLES)('redrawn hero (%s)', (style) => {
  const expressive = style === 'expressive'
  const cards = withStyle(GALLERY_DECK, style)
  const find = (id: string) => cards.find((c) => c.id === id) as Card

  it('sets the title larger than h1 with a tight line height, extrabold when expressive', () => {
    const title = tagWith(html(find('g-hero')), 'data-hero-title')
    expect(title).toContain(`font-size:${HERO_TITLE_SIZE(expressive)}`)
    expect(title).toContain('line-height:1')
    expect(title).not.toContain('line-height:1.')
    expect(title).toMatch(expressive ? /\bfont-extrabold\b/ : /\bfont-bold\b/)
    expect(title).not.toMatch(expressive ? /\bfont-bold\b/ : /\bfont-extrabold\b/)
    expect(title).toContain('var(--slide-font-heading)')
    expect(title.startsWith('<h1')).toBe(true)
  })

  it('sets the subtitle at the lead size, at most 62% wide, in muted ink', () => {
    const subtitle = tagWith(html(find('g-hero')), 'data-hero-subtitle')
    expect(subtitle).toContain(`font-size:${LEAD}`)
    expect(subtitle).toContain('max-width:62%')
    expect(subtitle).toContain('text-slide-muted')
    expect(subtitle).toContain('var(--slide-font-body)')
  })

  it('sits at the foot of the slide on the left, with a tight gap to the subtitle and a group gap under the rule', () => {
    const out = html(find('g-hero'))
    const root = tagWith(out, 'data-hero-root')
    expect(root).toMatch(/class="[^"]*\bmt-auto\b/)
    expect(root).not.toMatch(/\bmy-auto\b/)
    expect(root).toContain('items-start')
    expect(root).toContain('text-left')
    expect(tagWith(out, 'data-hero-subtitle')).toContain(`margin-top:${TIGHT}`)
    expect(tagWith(out, 'data-hero-rule')).toContain('margin-bottom:var(--slide-gap-group)')
  })

  it('draws one eyebrow rule above the title, 4rem by 3px in accent, hidden from assistive technology', () => {
    const out = html(find('g-hero'))
    expect(tagsWith(out, 'data-hero-rule').length).toBe(1)
    const rule = tagWith(out, 'data-hero-rule')
    expect(rule).toContain('aria-hidden="true"')
    expect(rule).toContain('bg-slide-accent')
    expect(rule).toContain('pointer-events-none')
    expect(rule).toContain('width:4rem')
    expect(rule).toContain('height:3px')
    expect(out.indexOf('data-hero-rule')).toBeLessThan(out.indexOf('data-hero-title'))
  })

  it('draws the large decorative circle only when expressive, before the text and clear of every press', () => {
    const out = html(find('g-hero'))
    const circles = tagsWith(out, 'data-hero-ornament')
    if (!expressive) {
      expect(circles).toEqual([])
      return
    }
    expect(circles.length).toBe(1)
    const [circle] = circles
    expect(circle).toContain('aria-hidden="true"')
    expect(circle).toContain('pointer-events-none')
    expect(circle).toContain('rounded-full')
    expect(circle).toContain('bg-slide-accent')
    expect(circle).toContain('opacity-[0.12]')
    expect(circle).not.toContain('opacity-30')
    expect(circle).toMatch(/\babsolute\b/)
    expect(circle).toContain('aspect-ratio:1')
    // It bleeds past the slide's top-right corner through the padding.
    expect(circle).toContain('top:calc(-1 * var(--slide-pad, 0px)')
    expect(circle).toContain('right:calc(-1 * var(--slide-pad, 0px)')
    // A sibling drawn before the text, so the text paints over it; it holds nothing.
    expect(out.indexOf('data-hero-ornament')).toBeLessThan(out.indexOf('data-hero-root'))
    expect(out).toMatch(/data-hero-ornament=""[^>]*><\/div>/)
    // The text block is positioned, so it paints above the circle.
    expect(tagWith(out, 'data-hero-root')).toMatch(/\brelative\b/)
  })

  it('draws its words once, the title in an h1', () => {
    const out = html(find('g-hero'))
    expect(out.split('Control Structures in C++').length - 1).toBe(1)
    expect(out.split('How a program decides what to do next.').length - 1).toBe(1)
    expect(wordsOf(out, 'data-hero-title')).toBe('Control Structures in C++')
  })

  it('keeps the photo drawing unchanged: no foot placement, no rule, no circle', () => {
    const card = { ...find('g-hero'), blocks: [...find('g-hero').blocks, PHOTO_BLOCK] }
    const out = html(card)
    expect(out).toContain('data-on-photo')
    expect(out).not.toContain('data-hero-root')
    expect(out).not.toContain('data-hero-ornament')
    expect(out).not.toContain('data-hero-rule')
    expect(tagWith(out, 'data-hero-title')).toContain('font-size:var(--slide-size-h1)')
    expect(tagWith(out, 'data-hero-title')).toContain('line-height:1.05')
  })

  describe('with leftovers on the deep ground', () => {
    const extra = () => find('g-hero-extra')

    it('draws every block once', () => {
      const out = html(extra())
      for (const text of [
        'Control Structures in C++',
        'How a program decides what to do next.',
        'Branches',
        'Loops',
        'Jumps',
        'loop forms',
        'branch forms',
      ]) {
        expect(out.split(text).length - 1, text).toBe(1)
      }
    })

    it('draws the leftovers below the subtitle, after a group gap', () => {
      const out = html(extra())
      expect(out.indexOf('Branches')).toBeGreaterThan(out.indexOf('How a program decides'))
      expect(out).toContain('margin-top:var(--slide-gap-group)')
    })

    it('hard-codes no colour', () => {
      expect(hardCodedColours(html(extra()))).toEqual([])
    })

    it('sets the leftover bullet list in the slide ink, which the deep ground re-points', () => {
      const out = html(extra())
      const lists = [...out.matchAll(/<ul [^>]*>/g)].map((m) => m[0])
      expect(lists.length).toBe(1)
      for (const list of lists) expect(list).toMatch(/class="[^"]*\btext-slide-foreground\b/)
    })
  })
})

describe.each(STYLES)('redrawn quote (%s)', (style) => {
  const expressive = style === 'expressive'
  const cards = withStyle(GALLERY_DECK, style)
  const find = (id: string) => cards.find((c) => c.id === id) as Card
  const QUOTE = 'Make it work, make it right, then make it fast.'

  it('draws one oversized opening mark, hidden from assistive technology, in accent', () => {
    const out = html(find('g-quote'))
    const marks = tagsWith(out, 'data-quote-mark')
    expect(marks.length).toBe(1)
    const [mark] = marks
    expect(mark).toContain('aria-hidden="true"')
    expect(mark).toContain('text-slide-accent')
    expect(mark).toContain('pointer-events-none')
    expect(mark).toContain('var(--slide-font-heading)')
    expect(mark).toContain('font-size:calc(var(--slide-size-h1) * 2.4)')
    expect(mark).toContain('line-height:0.8')
    // The box hugs the glyph (no clipping), so the quote starts right under it, a tight gap below.
    expect(mark).toContain('height:0.42em')
    expect(mark.match(/class="([^"]*)"/)?.[1].split(' ')).toContain('block')
    expect(mark).not.toMatch(/overflow/)
    expect(tagWith(out, 'data-quote-text')).toContain(`margin-top:${TIGHT}`)
    expect(wordsOf(out, 'data-quote-mark')).toBe('“')
  })

  it('draws the heading above the mark, and the mark above the quote', () => {
    const out = html(find('g-quote'))
    const at = (needle: string) => out.indexOf(needle)
    expect(at('A rule worth keeping')).toBeLessThan(at('data-quote-mark'))
    expect(at('data-quote-mark')).toBeLessThan(at('data-quote-text'))
    expect(at('data-quote-text')).toBeLessThan(at('data-quote-attribution'))
  })

  it('sets the quote at the h2 step (a little larger and semibold when expressive), never italic, at most 85% wide', () => {
    const out = html(find('g-quote'))
    const text = tagWith(out, 'data-quote-text')
    expect(tagsWith(out, 'data-quote-text').length).toBe(1)
    expect(text).toContain(`font-size:${expressive ? 'calc(var(--slide-size-h2) * 1.15)' : 'var(--slide-size-h2)'}`)
    expect(text).toContain(`font-weight:${expressive ? 600 : 400}`)
    expect(text).toContain('max-width:85%')
    expect(text).toContain('line-height:1.25')
    expect(text).not.toMatch(/\bitalic\b/)
    expect(out.split(QUOTE).length - 1).toBe(1)
    expect(wordsOf(out, 'data-quote-text')).toBe(QUOTE)
  })

  it('draws the attribution once as an uppercase eyebrow, with an accent rule before it and no dash prefix', () => {
    const out = html(find('g-quote'))
    expect(tagsWith(out, 'data-quote-attribution').length).toBe(1)
    const attribution = tagWith(out, 'data-quote-attribution')
    expect(attribution).toContain('uppercase')
    expect(attribution).toContain('tracking-[0.14em]')
    expect(attribution).toContain('text-slide-muted')
    expect(attribution).toContain(`font-size:${EYEBROW}`)
    expect(attribution).toContain('items-center')
    expect(out.split('Kent Beck').length - 1).toBe(1)
    expect(wordsOf(out, 'data-quote-attribution')).toBe('Kent Beck')
    const rule = tagWith(out, 'data-quote-rule')
    expect(rule).toContain('aria-hidden="true"')
    expect(rule).toContain('bg-slide-accent')
    expect(rule).toContain('width:2rem')
    expect(rule).toContain('height:2px')
    expect(out.indexOf('data-quote-rule')).toBeLessThan(out.indexOf('Kent Beck'))
    expect(out).not.toContain('\u2014')
  })

  it('is left-aligned on the frame and centred vertically, with no italic and no centred text', () => {
    const out = html(find('g-quote'))
    const root = tagWith(out, 'data-quote-root')
    expect(root).toMatch(/class="[^"]*\bmy-auto\b/)
    expect(root).toContain('items-start')
    expect(root).toContain('text-left')
    expect(root).not.toMatch(/\btext-center\b|\bitems-center\b/)
    expect(out).not.toMatch(/\bitalic\b/)
  })

  it('draws its decoration as empty or glyph-only hidden spans, never as a run', () => {
    const out = html(find('g-quote'))
    expect(out).toMatch(/data-quote-mark=""[^>]*>“<\/span>/)
    expect(out).toMatch(/data-quote-rule=""[^>]*><\/span>/)
  })

  it('keeps the photo drawing unchanged: its own mark and italic quote, the dash before the attribution', () => {
    const card = { ...find('g-quote'), blocks: [...find('g-quote').blocks, PHOTO_BLOCK] }
    const out = html(card)
    expect(out).toContain('data-on-photo')
    expect(out).not.toContain('data-quote-root')
    expect(out).not.toContain('data-quote-text')
    if (!expressive) expect(out).toContain('text-center')
    expect(out).toContain(expressive ? 'calc(var(--slide-size-h1) * 3)' : 'font-size:var(--slide-size-h1)')
    expect(out).toMatch(/\bitalic\b/)
    expect(out).toContain('\u2014')
  })
})
