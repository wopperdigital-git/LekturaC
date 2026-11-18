import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Card, ContentBlock, LayoutType, VisualStyle } from '@/engine/contentBlocks'
import { GALLERY_DECK, FIXTURE_PHOTO } from '@/engine/fixtures/galleryDeck'
import { LayoutRenderer } from './LayoutRenderer'

/**
 * Term rows: a run of `point` blocks drawn as a table of ruled rows, and a lone point as one
 * row of the same table, through the real renderer in both treatments. The rows are per-element
 * borders (the `Adjustable` holder is `display: contents`), the term is accent text, the run
 * owns no accent fill, and every term and meaning is drawn exactly once under its own address.
 */
const point = (label: string, text: string): ContentBlock => ({ type: 'point', label, text })
const heading: ContentBlock = { type: 'heading', text: 'MARKTITLE' }
const lead: ContentBlock = { type: 'paragraph', text: 'MARKLEAD' }
const RUN = [point('MARKTERMA', 'MARKMEANA'), point('MARKTERMB', 'MARKMEANB'), point('MARKTERMC', 'MARKMEANC')]

const card = (blocks: ContentBlock[], style: VisualStyle, layout: LayoutType = 'auto', orderIndex = 3): Card => ({
  id: 'c',
  orderIndex,
  layout,
  visualStyle: style,
  blocks,
})
const html = (c: Card) => renderToStaticMarkup(<LayoutRenderer card={c} />)
const count = (markup: string, text: string) => markup.split(text).length - 1
const tagsWith = (markup: string, attr: string) =>
  markup.match(new RegExp(`<[a-z0-9]+[^>]*${attr}[^>]*>`, 'g')) ?? []
const classesOf = (tag: string) => (tag.match(/class="([^"]*)"/)?.[1] ?? '').split(/\s+/)

describe.each(['structured', 'expressive'] as const)('term rows (%s)', (style) => {
  const run = html(card([heading, lead, ...RUN], style))

  it('is the automatic layout of a run of points, drawn once per term and meaning', () => {
    expect(run).toContain('data-term-rows')
    for (const word of ['MARKTITLE', 'MARKLEAD', 'MARKTERMA', 'MARKMEANA', 'MARKTERMB', 'MARKMEANB', 'MARKTERMC', 'MARKMEANC']) {
      expect(count(run, word), word).toBe(1)
    }
  })

  it('draws one row per point, a hairline above each and one below the last only', () => {
    const rows = tagsWith(run, 'data-term-row=""')
    expect(rows).toHaveLength(3)
    rows.forEach((row, i) => {
      const classes = classesOf(row)
      expect(classes).toContain('border-t')
      expect(classes).toContain('border-slide-border')
      expect(classes.includes('border-b'), `row ${i} closing rule`).toBe(i === rows.length - 1)
    })
  })

  it('draws the rules per element, never as divide utilities or first: variants', () => {
    expect(run).not.toMatch(/divide-/)
    expect(run).not.toMatch(/first:/)
  })

  it('draws every term as accent text in the heading font at h3 or larger, never a disc or a fill', () => {
    const terms = tagsWith(run, 'data-term=""')
    expect(terms).toHaveLength(3)
    for (const term of terms) {
      expect(classesOf(term)).toContain('text-slide-accent')
      expect(term).toMatch(/font-family:var\(--slide-font-heading\)/)
      expect(term).toMatch(style === 'expressive' ? /font-size:var\(--slide-size-h2\)/ : /font-size:var\(--slide-size-h3\)/)
      expect(classesOf(term)).not.toContain('bg-slide-accent')
      expect(classesOf(term)).not.toContain('rounded-full')
    }
  })

  it('draws the meanings at the lead size when few and short, the body size otherwise', () => {
    for (const tag of tagsWith(run, 'data-term-text')) {
      expect(tag).toContain('font-size:calc(var(--slide-size-body) * 1.2)')
    }
    const many = html(card([heading, ...Array.from({ length: 7 }, (_, i) => point(`T${i}`, `meaning ${i}`))], style))
    for (const tag of tagsWith(many, 'data-term-text')) {
      expect(tag).toContain('font-size:var(--slide-size-body)')
      expect(tag).not.toContain('* 1.2')
    }
    const long = html(card([heading, point('A', 'x'.repeat(65)), point('B', 'short')], style))
    for (const tag of tagsWith(long, 'data-term-text')) expect(tag).toContain('font-size:var(--slide-size-body)')
  })

  it('lays each row out as a two column grid from 640px of slide width, stacked below it, with no screen breakpoint', () => {
    for (const row of tagsWith(run, 'data-term-row=""')) {
      expect(classesOf(row)).toContain('grid-cols-1')
      expect(classesOf(row)).toContain('@min-[640px]:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]')
    }
  })

  it('owns no accent fill and draws no surface box or side tab', () => {
    expect(run).not.toContain('data-accent-owner')
    expect(run).not.toContain('bg-slide-surface')
    expect(run).not.toContain('bg-slide-accent')
    expect(run).not.toMatch(/border-l/)
  })

  it('fills the body when the run is the only thing in it, the rows sharing the height', () => {
    expect(tagsWith(run, 'data-fill')).toHaveLength(1)
    expect(classesOf(tagsWith(run, 'data-term-rows')[0]!)).toContain('flex-1')
    for (const row of tagsWith(run, 'data-term-row=""')) expect(classesOf(row)).toContain('flex-1')
  })

  it('does not fill when a paragraph sits beside the run in the body', () => {
    const beside = html(card([heading, lead, ...RUN, { type: 'paragraph', text: 'MARKAFTER' }], style, 'termRows'))
    expect(beside).not.toContain('data-fill')
    expect(count(beside, 'MARKAFTER')).toBe(1)
  })

  it('draws a lone point as one row of the same table, closed by a hairline below', () => {
    const lone = html(card([heading, point('MARKSOLO', 'MARKSOLOTEXT')], style))
    const rows = tagsWith(lone, 'data-term-row=""')
    expect(rows).toHaveLength(1)
    expect(classesOf(rows[0]!)).toEqual(expect.arrayContaining(['border-t', 'border-b', 'border-slide-border']))
    expect(count(lone, 'MARKSOLO')).toBe(2) // the term, and the first letters of the meaning
    expect(count(lone, 'MARKSOLOTEXT')).toBe(1)
    expect(lone).not.toContain('data-term-rows')
    expect(lone).not.toContain('data-accent-owner')
  })

  it('draws the run as rows beside a lone photo, each block once', () => {
    const photo: ContentBlock = { type: 'image', url: FIXTURE_PHOTO, alt: 'MARKPHOTOALT' }
    const markup = html(card([heading, ...RUN, photo], style))
    expect(tagsWith(markup, 'data-term-row=""')).toHaveLength(3)
    expect(count(markup, `src="${FIXTURE_PHOTO}"`)).toBe(1)
    expect(count(markup, 'MARKTERMB')).toBe(1)
  })

  it('draws a run as rows under any family layout that groups its blocks', () => {
    for (const layout of ['numberedList', 'iconGrid', 'statGrid', 'timeline'] as const) {
      const markup = html(card([heading, ...RUN], style, layout))
      expect(tagsWith(markup, 'data-term-row=""'), layout).toHaveLength(3)
      expect(count(markup, 'MARKMEANC'), layout).toBe(1)
    }
  })

  it('is one unit of the body: a heading, lead and run stay a stack, no zone panel', () => {
    expect(run).toContain('data-composition="stack"')
    expect(run).not.toContain('data-zone-panel')
  })

  it('keeps the gallery card on term rows with every word drawn once', () => {
    const gallery = GALLERY_DECK.find((c) => c.id === 'g-termrows')!
    const markup = html({ ...gallery, visualStyle: style })
    expect(tagsWith(markup, 'data-term-row=""')).toHaveLength(4)
    for (const block of gallery.blocks) {
      if (block.type !== 'point') continue
      expect(count(markup, block.label), block.label).toBe(1)
      expect(count(markup, block.text), block.text).toBe(1)
    }
  })
})

describe('a run of points beside other body units', () => {
  it('is one unit, so a paragraph after it zones the slide and every point is still drawn once', () => {
    const markup = html(
      card([{ type: 'heading', text: 'Short claim' }, ...RUN, { type: 'paragraph', text: 'MARKAFTER' }], 'structured', 'termRows'),
    )
    expect(markup).toContain('data-composition="sideHead"')
    expect(count(markup, 'MARKTERMA')).toBe(1)
    expect(tagsWith(markup, 'data-term-row=""')).toHaveLength(3)
  })
})
