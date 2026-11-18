import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Card, ContentBlock, LayoutType, VisualStyle } from '@/engine/contentBlocks'
import { FIXTURE_PHOTO } from '@/engine/fixtures/galleryDeck'
import { LayoutRenderer } from './LayoutRenderer'
import { TextEditingContext, type TextEditing } from './textEditingContext'

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

  /*
    `Adjustable` writes an element's own weight on the group, the holder's one child. The title's own
    weight class would beat an inherited weight, so the stylesheet hands it back (a font or size pick
    already reaches the title, being custom properties it reads at its own use site).
  */
  describe('an element weight pick on a heading with a kicker', () => {
    const css = readFileSync(new URL('../../index.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

    it('is handed on to the title and the kicker by an unlayered rule', () => {
      const rule = css.split('}').find((r) => r.trimStart().startsWith("[data-kicker-group][style*='font-weight']")) ?? ''
      expect(rule).not.toBe('')
      for (const tag of ['h1', 'h2', 'h3', '[data-kicker]']) expect(rule).toContain(tag)
      expect(rule).toContain('> :is(')
      expect(rule).toContain('font-weight: inherit')
    })

    it.each(LAYOUTS.filter(([, , , extra]) => !extra.some((b) => b.type === 'image')))(
      '%s: the title is the group\'s direct child and keeps its own weight class',
      (_name, layout, first, extra) => {
        const html = render(card(layout, withKicker(extra)), first)
        const group = html.indexOf('data-kicker-group')
        expect(group).toBeGreaterThan(-1)
        const title = html.slice(group).match(/<(h[123])[^>]*class="([^"]*)"/)
        expect(title).not.toBeNull()
        expect(title![2]).toMatch(/\bfont-(semibold|bold|extrabold)\b/)
        // The kicker is the group's first child, the title the second: nothing sits between them.
        const between = html.slice(group, group + html.slice(group).indexOf(`<${title![1]}`))
        expect(between.match(/<(div|section)\b/g)).toBeNull()
      },
    )
  })

  it('draws every other block once beside it', () => {
    const html = render(card('standard', withKicker([{ type: 'bulletList', items: ['alpha', 'beta'] }])))
    for (const text of [TITLE, 'Branches choose which lines run.', 'alpha', 'beta']) {
      expect(html.split(text)).toHaveLength(2)
    }
  })

  /*
    The editor holds `""` while the kicker's run is open (the page removes it when editing
    ends). Only that run keeps the group, so it has a caret box; everywhere else a kicker that
    says nothing draws nothing.
  */
  describe('a kicker that says nothing', () => {
    const editing = (activeRef: string | null): TextEditing => ({
      activeRef,
      inline: undefined,
      onSelectText: () => {},
      onChangeText: () => {},
      onSelectionChange: () => {},
      onToggleMark: () => {},
    })
    const inEditor = (c: Card, activeRef: string | null, first = false) =>
      renderToStaticMarkup(
        <TextEditingContext.Provider value={editing(activeRef)}>
          <LayoutRenderer card={c} context={{ isFirstCard: first }} />
        </TextEditingContext.Provider>,
      )
    const blank = (kicker: string): ContentBlock[] => [
      { type: 'heading', text: TITLE, kicker },
      { type: 'paragraph', text: 'Branches choose which lines run.' },
    ]

    it.each([[''], ['   ']])('draws nothing read-only for %j, exactly as if there were none', (kicker) => {
      for (const [, layout, first, extra] of LAYOUTS) {
        const html = render(card(layout, [...blank(kicker), ...extra]), first)
        expect(html, layout).not.toContain('data-kicker')
        expect(html, layout).toBe(render(card(layout, withoutKicker(extra)), first))
      }
    })

    it('draws nothing in the editor while another run is being edited', () => {
      expect(inEditor(card('standard', blank('')), null)).not.toContain('data-kicker')
      expect(inEditor(card('standard', blank('')), '0:text')).not.toContain('data-kicker')
      expect(inEditor(card('standard', blank('')), '1:text')).not.toContain('data-kicker')
    })

    it.each([[''], ['  ']])('keeps the group, with its run live, while that run is being edited (%j)', (kicker) => {
      for (const [, layout, first, extra] of LAYOUTS) {
        const html = inEditor(card(layout, [...blank(kicker), ...extra]), '0:kicker', first)
        expect(html, layout).toContain('data-kicker-group')
        expect(html, layout).toMatch(/data-kicker=""[^>]*>\s*<span[^>]*contenteditable/i)
      }
    })

    it('leaves a kicker with words drawn however the editor is', () => {
      expect(inEditor(card('standard', blank('Part two')), null)).toContain('data-kicker-group')
    })
  })
})
