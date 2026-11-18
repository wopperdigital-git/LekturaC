import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Card, ContentBlock, VisualStyle } from '@/engine/contentBlocks'
import { CPP_DECK } from '@/engine/fixtures/cppDeck'
import { LayoutRenderer } from './LayoutRenderer'

/**
 * The frames added with the new layouts, drawn through the real renderer in both treatments.
 * Each block must be drawn exactly once, so a layout cannot drop or repeat words.
 */
const card = (layout: Card['layout'], blocks: ContentBlock[], style: VisualStyle, orderIndex = 3): Card => ({
  ...CPP_DECK[0],
  orderIndex,
  layout,
  visualStyle: style,
  blocks,
})

const html = (c: Card) => renderToStaticMarkup(<LayoutRenderer card={c} />)
const count = (markup: string, text: string) => markup.split(text).length - 1
const tagWith = (markup: string, attr: string) => markup.match(new RegExp(`<[a-z0-9]+[^>]*${attr}[^>]*>`))?.[0] ?? ''
const classesOf = (tag: string) => (tag.match(/class="([^"]*)"/)?.[1] ?? '').split(/\s+/)

const heading: ContentBlock = { type: 'heading', text: 'Loops and branches' }
const lead: ContentBlock = { type: 'paragraph', text: 'Every program decides what to do next.' }
const extra: ContentBlock = { type: 'paragraph', text: 'An extra paragraph nobody planned for.' }
const photo: ContentBlock = { type: 'image', url: 'https://example.test/s.png', alt: 'a section photo' }

describe.each(['structured', 'expressive'] as const)('section (%s)', (style) => {
  it('draws the slide position as a two digit, aria-hidden accent numeral', () => {
    const markup = html(card('section', [heading], style, 3))
    const tag = tagWith(markup, 'data-section-number')
    expect(tag).not.toBe('')
    expect(tag).toContain('aria-hidden="true"')
    expect(classesOf(tag)).toContain('text-slide-accent')
    expect(markup).toMatch(/data-section-number[^>]*>04</)
  })

  it('pads a single digit and counts from one', () => {
    expect(html(card('section', [heading], style, 0))).toMatch(/data-section-number[^>]*>01</)
    expect(html(card('section', [heading], style, 11))).toMatch(/data-section-number[^>]*>12</)
  })

  it('draws the heading once, as the slide title', () => {
    const markup = html(card('section', [heading], style))
    expect(count(markup, 'Loops and branches')).toBe(1)
    expect(markup).toContain('<h1')
  })

  it('sits at the foot of the slide, left-aligned, never centred', () => {
    const tag = tagWith(html(card('section', [heading], style)), 'data-section-root')
    expect(classesOf(tag)).toContain('mt-auto')
    expect(classesOf(tag)).not.toContain('my-auto')
    expect(classesOf(tag)).toContain('text-left')
  })

  it('draws a card holding more than a heading, each block once', () => {
    const markup = html(card('section', [heading, extra], style))
    expect(count(markup, 'Loops and branches')).toBe(1)
    expect(count(markup, 'An extra paragraph nobody planned for.')).toBe(1)
  })

  it('draws a lone photo through the leftovers, once', () => {
    const markup = html(card('section', [heading, photo], style))
    expect(count(markup, `src="${photo.type === 'image' ? photo.url : ''}"`)).toBe(1)
    expect(count(markup, 'Loops and branches')).toBe(1)
  })
})

describe.each(['structured', 'expressive'] as const)('statement (%s)', (style) => {
  it('draws the heading and the paragraph once each', () => {
    const markup = html(card('statement', [heading, lead], style))
    expect(count(markup, 'Loops and branches')).toBe(1)
    expect(count(markup, 'Every program decides what to do next.')).toBe(1)
    expect(markup).toContain('<h1')
  })

  it('centres itself on its own root, left-aligned', () => {
    const tag = tagWith(html(card('statement', [heading, lead], style)), 'data-statement-root')
    expect(tag).not.toBe('')
    expect(classesOf(tag)).toContain('my-auto')
    expect(classesOf(tag)).not.toContain('mt-auto')
    expect(classesOf(tag)).toContain('text-left')
  })

  it('draws a second paragraph and a stat through the leftovers, once', () => {
    const markup = html(
      card('statement', [heading, lead, extra, { type: 'stat', value: '777', label: 'extra figure' }], style),
    )
    expect(count(markup, 'An extra paragraph nobody planned for.')).toBe(1)
    expect(count(markup, 'extra figure')).toBe(1)
    expect(count(markup, 'Every program decides what to do next.')).toBe(1)
  })

  it('draws a heading-only card without a paragraph', () => {
    const markup = html(card('statement', [heading], style))
    expect(count(markup, 'Loops and branches')).toBe(1)
  })
})

describe.each(['structured', 'expressive'] as const)('section and statement stay editable (%s)', (style) => {
  it('wraps the section heading in its own holder', () => {
    expect(html(card('section', [heading], style))).toMatch(/data-block-index="0"[^>]*><h1/)
  })

  it('wraps the statement heading and paragraph in their own holders', () => {
    const markup = html(card('statement', [heading, lead], style))
    expect(markup).toMatch(/data-block-index="0"[^>]*><h1/)
    expect(markup).toMatch(/data-block-index="1"[^>]*><p/)
  })

  it('caps the statement at a reading measure of 14 times the h1 step', () => {
    const tag = tagWith(html(card('statement', [heading, lead], style)), 'data-statement-root')
    expect(tag).toContain('max-width:calc(var(--slide-size-h1) * 14)')
  })
})

const para = (text: string): ContentBlock => ({ type: 'paragraph', text })
const bullets = (...items: string[]): ContentBlock => ({ type: 'bulletList', items })
const figure: ContentBlock = { type: 'stat', value: '42%', label: 'of loops need no update' }
const listBlock = bullets('Find the start', 'Check the condition', 'Run the body')

describe.each(['structured', 'expressive'] as const)('twoColumn (%s)', (style) => {
  const blocks: ContentBlock[] = [heading, lead, para('Second paragraph in the body.'), para('Third paragraph in the body.'), listBlock]

  it('draws every block once', () => {
    const markup = html(card('twoColumn', blocks, style))
    for (const text of [
      'Loops and branches',
      'Every program decides what to do next.',
      'Second paragraph in the body.',
      'Third paragraph in the body.',
      'Find the start',
      'Check the condition',
      'Run the body',
    ]) {
      expect(count(markup, text), text).toBe(1)
    }
  })

  it('flows the body into two columns from the container width up, one below it', () => {
    const tag = tagWith(html(card('twoColumn', blocks, style)), 'data-two-column')
    expect(tag).not.toBe('')
    expect(classesOf(tag)).toContain('@min-[640px]:columns-2')
    expect(tag).toContain('column-gap:var(--slide-gap-section)')
    expect(tag).not.toMatch(/column-count/)
  })

  it('keeps every body block whole inside its column', () => {
    const markup = html(card('twoColumn', blocks, style))
    // Second paragraph, third paragraph and the list.
    expect(count(markup, 'break-inside-avoid')).toBe(3)
  })

  it('makes each block a container that caps a list numeral by its column', () => {
    const short = bullets('One', 'Two', 'Three', 'Four')
    const markup = html(card('twoColumn', [heading, lead, para('Body paragraph.'), short], style))
    const wrappers = markup.match(/<div[^>]*break-inside-avoid[^>]*>/g) ?? []
    expect(wrappers.length).toBe(2)
    for (const tag of wrappers) {
      expect(classesOf(tag)).toContain('@container')
      expect(tag).toContain('--zone-width:100cqi')
    }
    // The chips arrangement sizes its numerals by the zone width.
    expect(markup).toContain('var(--zone-width')
  })

  it('leaves no space above the first block or after the last: a top margin on all but the first', () => {
    const markup = html(card('twoColumn', blocks, style))
    const wrappers = markup.match(/<div[^>]*break-inside-avoid[^>]*>/g) ?? []
    expect(wrappers[0]).not.toContain('margin')
    for (const tag of wrappers.slice(1)) expect(tag).toContain('margin-top:var(--slide-gap-group)')
    expect(markup).not.toContain('margin-bottom:var(--slide-gap-group)')
  })

  it('stays editable: each body block keeps its own index', () => {
    const markup = html(card('twoColumn', blocks, style))
    for (const index of [2, 3, 4]) expect(markup).toContain(`data-block-index="${index}"`)
  })
})

describe.each(['structured', 'expressive'] as const)('statSplit (%s)', (style) => {
  const blocks: ContentBlock[] = [heading, figure, listBlock]

  it('draws the figure, its label and each list item once', () => {
    const markup = html(card('statSplit', blocks, style))
    for (const text of ['Loops and branches', '42%', 'of loops need no update', 'Find the start', 'Check the condition', 'Run the body']) {
      expect(count(markup, text), text).toBe(1)
    }
  })

  it('is a two-fifths and three-fifths grid from the container width up', () => {
    const tag = tagWith(html(card('statSplit', blocks, style)), 'data-stat-split')
    expect(tag).not.toBe('')
    expect(classesOf(tag)).toContain('@min-[640px]:grid-cols-[2fr_3fr]')
  })

  it('draws the figure as accent text and fills nothing with the accent', () => {
    const markup = html(card('statSplit', blocks, style))
    expect(classesOf(tagWith(markup, 'data-stat-figure'))).toContain('text-slide-accent')
    expect(markup).not.toContain('bg-slide-accent')
    expect(markup).not.toContain('data-accent-owner')
  })

  it('draws the list as ruled numbered rows in a column that caps the numeral', () => {
    const markup = html(card('statSplit', blocks, style))
    expect(markup).toContain('<ol')
    expect(markup).toContain('--zone-width:100cqi')
  })

  it('makes both cells containers that set the zone width', () => {
    const markup = html(card('statSplit', blocks, style))
    for (const attr of ['data-stat-cell', 'data-list-cell']) {
      const tag = tagWith(markup, attr)
      expect(classesOf(tag), attr).toContain('@container')
      expect(tag, attr).toContain('--zone-width:100cqi')
    }
  })

  it('caps the figure by its column so a four-character value fits', () => {
    const tag = tagWith(html(card('statSplit', blocks, style)), 'data-stat-figure')
    expect(tag).toContain('min(calc(var(--slide-size-h1) *')
    expect(tag).toContain('calc(var(--zone-width, 9999px) / 2.6))')
  })

  it('draws one column, with no empty cell, when the card has no list', () => {
    const markup = html(card('statSplit', [heading, figure], style))
    expect(count(markup, '42%')).toBe(1)
    expect(count(markup, 'of loops need no update')).toBe(1)
    expect(markup).not.toContain('grid-cols-[2fr_3fr]')
    expect(markup).not.toContain('data-list-cell')
  })

  it('draws one column, with no empty cell, when the card has no figure', () => {
    const markup = html(card('statSplit', [heading, listBlock], style))
    for (const text of ['Find the start', 'Check the condition', 'Run the body']) expect(count(markup, text), text).toBe(1)
    expect(markup).not.toContain('grid-cols-[2fr_3fr]')
    expect(markup).not.toContain('data-stat-cell')
  })

  it('draws a trailing paragraph once, below the grid', () => {
    const markup = html(card('statSplit', [...blocks, para('A closing note after the grid.')], style))
    expect(count(markup, 'A closing note after the grid.')).toBe(1)
    expect(markup.indexOf('A closing note after the grid.')).toBeGreaterThan(markup.indexOf('Run the body'))
  })

  it('draws a photo the picker allowed, once, after the grid', () => {
    const markup = html(card('statSplit', [...blocks, photo], style))
    expect(count(markup, 'src="https://example.test/s.png"')).toBe(1)
    expect(count(markup, 'Run the body')).toBe(1)
  })

  it('stays editable: the figure and the list keep their own indices', () => {
    const markup = html(card('statSplit', blocks, style))
    expect(markup).toContain('data-block-index="1"')
    expect(markup).toContain('data-block-index="2"')
  })
})

describe.each(['structured', 'expressive'] as const)('photoList (%s)', (style) => {
  const blocks: ContentBlock[] = [heading, listBlock, photo]

  it('draws the list items and the photo once each', () => {
    const markup = html(card('photoList', blocks, style))
    for (const text of ['Loops and branches', 'Find the start', 'Check the condition', 'Run the body']) {
      expect(count(markup, text), text).toBe(1)
    }
    expect(count(markup, 'src="https://example.test/s.png"')).toBe(1)
  })

  it('bleeds the photo on the right at an even position and on the left at an odd one', () => {
    expect(tagWith(html(card('photoList', blocks, style, 2)), 'data-bleed')).toContain('data-bleed="right"')
    expect(tagWith(html(card('photoList', blocks, style, 3)), 'data-bleed')).toContain('data-bleed="left"')
  })

  it('draws the list as numbered rows in a container that caps the numeral', () => {
    const markup = html(card('photoList', blocks, style))
    const tag = tagWith(markup, 'data-photo-list')
    expect(tag).not.toBe('')
    expect(classesOf(tag)).toContain('@container')
    expect(tag).toContain('--zone-width:100cqi')
    expect(markup).toContain('<ol')
  })

  it('lets a lone list fill the text column', () => {
    expect(html(card('photoList', blocks, style))).toContain('data-fill')
  })

  it('draws every block once on a card the picker offers it for with no photo', () => {
    const markup = html(card('photoList', [heading, listBlock], style))
    expect(count(markup, 'Find the start')).toBe(1)
    expect(markup).not.toContain('data-bleed')
  })

  it('draws every block once on a card with two lists', () => {
    const markup = html(card('photoList', [heading, listBlock, bullets('Second list a', 'Second list b'), photo], style))
    for (const text of ['Find the start', 'Second list a', 'Second list b']) expect(count(markup, text), text).toBe(1)
    expect(count(markup, 'src="https://example.test/s.png"')).toBe(1)
  })

  it('draws two photos as a gallery in the body, none as the aside', () => {
    const second: ContentBlock = { type: 'image', url: 'https://example.test/t.png', alt: 'another' }
    const markup = html(card('photoList', [heading, listBlock, photo, second], style))
    expect(markup).not.toContain('data-bleed')
    expect(count(markup, 'src="https://example.test/s.png"')).toBe(1)
    expect(count(markup, 'src="https://example.test/t.png"')).toBe(1)
  })
})
