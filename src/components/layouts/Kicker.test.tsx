import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Card, ContentBlock, LayoutType, VisualStyle } from '@/engine/contentBlocks'
import { FIXTURE_PHOTO } from '@/engine/fixtures/galleryDeck'
import { LayoutRenderer } from './LayoutRenderer'

/*
  The kicker is part of its heading element: drawn before the title inside the heading's own
  holder, in small accent capitals, never on a fill, and only when the heading has one. A
  heading without one draws exactly as it did before the field existed.
*/

const TITLE = 'Making decisions'
const KICKER = 'Part two'

function card(layout: LayoutType, blocks: ContentBlock[], visualStyle: VisualStyle = 'structured'): Card {
  return { id: 'k', orderIndex: 1, layout, visualStyle, blocks }
}

function render(c: Card, isFirstCard = false): string {
  return renderToStaticMarkup(<LayoutRenderer card={c} context={{ isFirstCard }} />)
}

const withKicker = (extra: ContentBlock[] = []): ContentBlock[] => [
  { type: 'heading', text: TITLE, kicker: KICKER },
  { type: 'paragraph', text: 'Branches choose which lines run.' },
  ...extra,
]
const withoutKicker = (extra: ContentBlock[] = []): ContentBlock[] => [
  { type: 'heading', text: TITLE },
  { type: 'paragraph', text: 'Branches choose which lines run.' },
  ...extra,
]

const LAYOUTS: Array<[string, LayoutType, boolean, ContentBlock[]]> = [
  ['a standard slide', 'standard', false, []],
  ['a text focus slide', 'textFocus', false, []],
  ['a list slide', 'iconGrid', false, [{ type: 'bulletList', items: ['if', 'else', 'switch'] }]],
  ['a hero', 'hero', true, []],
  ['a hero over a photo', 'hero', true, [{ type: 'image', url: FIXTURE_PHOTO, alt: 'x' }]],
  ['a section', 'section', false, []],
  ['a statement', 'statement', false, []],
  ['a quote', 'quote', false, [{ type: 'quote', text: 'Make it work.' }]],
  ['a stat hero', 'statHero', false, [{ type: 'stat', value: '3', label: 'forms' }]],
]

describe('Kicker', () => {
  describe.each(['structured', 'expressive'] as const)('%s', (style) => {
    it.each(LAYOUTS)('%s draws the kicker once, before its title', (_name, layout, first, extra) => {
      const html = render(card(layout, withKicker(extra), style), first)
      expect(html.split(KICKER)).toHaveLength(2)
      expect(html.indexOf(KICKER)).toBeLessThan(html.indexOf(TITLE))
      expect(html.match(/data-kicker=""/g)).toHaveLength(1)
    })

    it.each(LAYOUTS)('%s draws a heading with no kicker without one', (_name, layout, first, extra) => {
      const html = render(card(layout, withoutKicker(extra), style), first)
      expect(html).not.toContain('data-kicker')
    })

    it('draws the kicker in small accent capitals and never on a fill', () => {
      const html = render(card('standard', withKicker(), style))
      const tag = html.match(/<[a-z0-9]+[^>]*data-kicker=""[^>]*>/)?.[0] ?? ''
      expect(tag).toMatch(/\buppercase\b/)
      expect(tag).toMatch(/\btext-slide-accent\b/)
      expect(tag).toMatch(/letter-spacing:0\.12em/)
      expect(tag).toContain('font-size:calc(var(--slide-size-body) * 0.65)')
      expect(tag).toContain('margin-bottom:var(--slide-gap-tight)')
      expect(tag).not.toMatch(/bg-slide-accent/)
    })
  })

  it('sits inside the heading\'s own holder, so one element carries both', () => {
    const html = render(card('standard', withKicker()))
    const holder = html.match(/<div style="display:contents" data-block-index="0">/)
    expect(holder).not.toBeNull()
    const from = html.indexOf(holder![0])
    // Only the heading's own holder (index 0) contains the kicker and the title.
    const nextHolder = html.indexOf('data-block-index="1"')
    expect(from).toBeLessThan(html.indexOf(KICKER))
    expect(html.indexOf(TITLE)).toBeLessThan(nextHolder)
    expect(html.indexOf(KICKER)).toBeLessThan(nextHolder)
    expect(html.match(/data-block-index="0"/g)).toHaveLength(1)
  })

  it('addresses the kicker as the kicker field of its heading', () => {
    // Read-only draws no address, so the holder index is the evidence the run is under block 0.
    const html = render(card('section', [{ type: 'heading', text: TITLE, kicker: KICKER }]))
    expect(html.match(/data-block-index="\d+"/g)).toEqual(['data-block-index="0"'])
  })

  it('draws a heading whose kicker was removed exactly as one that never had it', async () => {
    const { withKicker: strip } = await import('@/engine/kicker')
    const had: ContentBlock[] = [{ type: 'heading', text: TITLE, kicker: KICKER }, { type: 'paragraph', text: 'Body' }]
    const removed = [strip(had[0], '  '), had[1]]
    const never: ContentBlock[] = [{ type: 'heading', text: TITLE }, { type: 'paragraph', text: 'Body' }]
    for (const layout of ['standard', 'hero', 'section', 'statement'] as const) {
      expect(render(card(layout, removed), layout === 'hero')).toBe(render(card(layout, never), layout === 'hero'))
    }
  })

  it('draws every other block once beside it', () => {
    const html = render(card('standard', withKicker([{ type: 'bulletList', items: ['alpha', 'beta'] }])))
    for (const text of [TITLE, 'Branches choose which lines run.', 'alpha', 'beta']) {
      expect(html.split(text)).toHaveLength(2)
    }
  })
})
