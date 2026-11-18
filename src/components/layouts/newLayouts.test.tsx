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

  it('draws a paragraph after the list once, in the body', () => {
    const after: ContentBlock = { type: 'paragraph', text: 'A closing line after the list.' }
    const markup = html(card('photoList', [heading, listBlock, after, photo], style))
    for (const text of ['Loops and branches', 'Find the start', 'Check the condition', 'Run the body', 'A closing line after the list.']) {
      expect(count(markup, text), text).toBe(1)
    }
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

const stepBlock = (label: string, text: string): ContentBlock => ({ type: 'timelineStep', label, text })
const groupBlock = (name: string, ...items: string[]): ContentBlock => ({ type: 'comparisonGroup', heading: name, items })
const stepWords = (n: number) => Array.from({ length: n }, (_, i) => [`StepLabel${i}x`, `StepText${i}x`] as const)
const stepsOf = (n: number): ContentBlock[] => [heading, ...stepWords(n).map(([label, text]) => stepBlock(label, text))]
const tagsWith = (markup: string, attr: string) => markup.match(new RegExp(`<[a-z0-9]+[^>]*${attr}[^>]*>`, 'g')) ?? []

describe.each(['structured', 'expressive'] as const)('steps (%s)', (style) => {
  it('draws every step label and text once', () => {
    const markup = html(card('steps', stepsOf(4), style))
    for (const [label, text] of stepWords(4)) {
      expect(count(markup, label), label).toBe(1)
      expect(count(markup, text), text).toBe(1)
    }
    expect(count(markup, 'Loops and branches')).toBe(1)
  })

  it('draws a chevron between steps: one fewer than the steps in a row', () => {
    expect(tagsWith(html(card('steps', stepsOf(4), style)), 'data-step-chevron').length).toBe(3)
    expect(tagsWith(html(card('steps', stepsOf(5), style)), 'data-step-chevron').length).toBe(4)
  })

  it('draws chevrons as aria-hidden stroke-only accent SVGs', () => {
    const markup = html(card('steps', stepsOf(3), style))
    for (const tag of tagsWith(markup, 'data-step-chevron')) expect(tag).toContain('aria-hidden="true"')
    const svg = markup.match(/<svg[^>]*>/g) ?? []
    expect(svg.length).toBe(2)
    for (const tag of svg) {
      expect(tag).toContain('fill="none"')
      expect(tag).toContain('stroke="currentColor"')
      expect(tag).toContain('aria-hidden="true"')
    }
    expect(classesOf(tagsWith(markup, 'data-step-chevron')[0] ?? '')).toContain('text-slide-accent')
  })

  it('wraps seven steps into two rows of four, dropping the chevron at the end of a row', () => {
    const markup = html(card('steps', stepsOf(7), style))
    const root = tagWith(markup, 'data-steps')
    expect(root).toContain('grid-template-rows:repeat(2,')
    // Four columns and the three gaps between them.
    expect(root).toContain('grid-template-columns:minmax(0, 1fr) auto minmax(0, 1fr) auto minmax(0, 1fr) auto minmax(0, 1fr)')
    expect(tagsWith(markup, 'data-step-chevron').length).toBe(5)
    for (const [label, text] of stepWords(7)) {
      expect(count(markup, label), label).toBe(1)
      expect(count(markup, text), text).toBe(1)
    }
  })

  it('draws one step with no chevron and no row of its own', () => {
    const markup = html(card('steps', stepsOf(1), style))
    expect(tagsWith(markup, 'data-step-chevron').length).toBe(0)
    expect(count(markup, 'StepLabel0x')).toBe(1)
    expect(count(markup, 'StepText0x')).toBe(1)
  })

  it('draws twelve steps in two rows of six, ten chevrons', () => {
    const markup = html(card('steps', stepsOf(12), style))
    expect(tagWith(markup, 'data-steps')).toContain('grid-template-rows:repeat(2,')
    expect(tagsWith(markup, 'data-step-chevron').length).toBe(10)
    for (const [label, text] of stepWords(12)) {
      expect(count(markup, label), label).toBe(1)
      expect(count(markup, text), text).toBe(1)
    }
  })

  it('keeps a chevron level with the numeral: both cells carry the step rule when structured', () => {
    const tag = tagsWith(html(card('steps', stepsOf(3), style)), 'data-step-chevron')[0] ?? ''
    expect(classesOf(tag).includes('border-t')).toBe(style === 'structured')
    if (style === 'structured') expect(classesOf(tag)).toContain('border-transparent')
  })

  it('draws six steps in two rows of three', () => {
    const markup = html(card('steps', stepsOf(6), style))
    expect(tagWith(markup, 'data-steps')).toContain('grid-template-rows:repeat(2,')
    expect(tagsWith(markup, 'data-step-chevron').length).toBe(4)
  })

  it('draws the number as an aria-hidden accent h3 numeral, never a disc', () => {
    const markup = html(card('steps', stepsOf(4), style))
    const tags = tagsWith(markup, 'data-step-number')
    expect(tags.length).toBe(4)
    for (const tag of tags) {
      expect(tag).toContain('aria-hidden="true"')
      expect(classesOf(tag)).toContain('text-slide-accent')
      expect(classesOf(tag)).not.toContain('rounded-full')
      expect(tag).toContain('font-size:var(--slide-size-h3)')
    }
    expect(markup).toMatch(/data-step-number[^>]*>01</)
  })

  it('fills nothing with the accent and draws no box', () => {
    const markup = html(card('steps', stepsOf(4), style))
    expect(markup).not.toContain('data-accent-owner')
    expect(markup).not.toContain('bg-slide-accent')
    expect(markup).not.toContain('bg-slide-surface')
    expect(markup).not.toContain('divide-')
  })

  it('lets a lone group fill the body, the rows sharing the height', () => {
    const root = tagWith(html(card('steps', stepsOf(4), style)), 'data-steps')
    expect(root).toContain('data-fill')
    expect(classesOf(root)).toContain('flex-1')
    expect(root).toContain('minmax(min-content, 1fr)')
  })

  it('keeps each step under its own block index and draws no screen breakpoint', () => {
    const markup = html(card('steps', stepsOf(4), style))
    for (const index of [1, 2, 3, 4]) expect(markup).toContain(`data-block-index="${index}"`)
    expect(markup).not.toMatch(/class="[^"]*\b(sm|md|lg):/)
  })
})

describe.each(['structured', 'expressive'] as const)('beforeAfter (%s)', (style) => {
  const blocks: ContentBlock[] = [
    heading,
    groupBlock('BeforeHead', 'BeforeOne', 'BeforeTwo', 'BeforeThree'),
    groupBlock('AfterHead', 'AfterOne', 'AfterTwo', 'AfterThree'),
  ]

  it('draws both group headings and every item once', () => {
    const markup = html(card('beforeAfter', blocks, style))
    for (const text of ['BeforeHead', 'BeforeOne', 'BeforeTwo', 'BeforeThree', 'AfterHead', 'AfterOne', 'AfterTwo', 'AfterThree']) {
      expect(count(markup, text), text).toBe(1)
    }
    expect(tagsWith(markup, 'data-group-heading').length).toBe(2)
  })

  it('is two halves side by side from the container width up, stacked below', () => {
    const root = tagWith(html(card('beforeAfter', blocks, style)), 'data-before-after=')
    expect(root).not.toBe('')
    expect(classesOf(root)).toContain('grid-cols-1')
    expect(classesOf(root).some((c) => c.startsWith('@min-[640px]:grid-cols-['))).toBe(true)
  })

  it('puts the deep ground on the second half only', () => {
    const markup = html(card('beforeAfter', blocks, style))
    const halves = tagsWith(markup, 'data-half')
    expect(halves.length).toBe(2)
    expect(halves[0]).not.toContain('data-ground')
    expect(halves[1]).toContain('data-ground="deep"')
    expect(halves[1]).toContain('background:var(--slide-background)')
    expect(classesOf(halves[1])).toContain('rounded-slide')
    expect(count(markup, 'data-ground="deep"')).toBe(1)
    for (const tag of halves) expect(tag).toContain('padding:var(--slide-gap-group)')
  })

  it('draws an aria-hidden arrow between them, pointing down when stacked', () => {
    const markup = html(card('beforeAfter', blocks, style))
    const arrow = tagWith(markup, 'data-before-after-arrow')
    expect(arrow).toContain('aria-hidden="true"')
    expect(classesOf(arrow)).toContain('rotate-90')
    expect(classesOf(arrow)).toContain('@min-[640px]:rotate-0')
    expect(markup.indexOf('data-before-after-arrow')).toBeGreaterThan(markup.indexOf('BeforeThree'))
    expect(markup.indexOf('data-before-after-arrow')).toBeLessThan(markup.indexOf('AfterHead'))
    expect(markup).toMatch(/data-before-after-arrow[^>]*><svg[^>]*stroke="currentColor"/)
  })

  it('draws the items as ruled rows and owns no accent', () => {
    const markup = html(card('beforeAfter', blocks, style))
    expect(markup).not.toContain('data-accent-owner')
    expect(markup).not.toContain('data-accent-panel')
    expect(markup).not.toContain('divide-')
    expect(markup).not.toContain('bg-slide-surface')
    if (style === 'structured') expect(count(markup, 'border-t border-slide-border')).toBe(6)
  })

  it('stays editable: each half keeps its own block index', () => {
    const markup = html(card('beforeAfter', blocks, style))
    expect(markup).toContain('data-block-index="1"')
    expect(markup).toContain('data-block-index="2"')
  })

  it('lets a lone before and after fill the body', () => {
    const root = tagWith(html(card('beforeAfter', blocks, style)), 'data-before-after=')
    expect(root).toContain('data-fill')
    expect(classesOf(root)).toContain('flex-1')
  })

  it('sets its two halves side by side with a class Tailwind can read from the source', () => {
    const root = tagWith(html(card('beforeAfter', blocks, style)), 'data-before-after=')
    expect(classesOf(root)).toContain('@min-[640px]:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]')
  })

  it('draws three groups as columns, not a before and after', () => {
    const markup = html(card('beforeAfter', [...blocks, groupBlock('ThirdHead', 'ThirdOne')], style))
    expect(markup).not.toContain('data-before-after')
    expect(count(markup, 'ThirdHead')).toBe(1)
  })
})
