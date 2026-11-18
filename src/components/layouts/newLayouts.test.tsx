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
    expect(count(markup, 'a section photo')).toBeGreaterThanOrEqual(1)
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
