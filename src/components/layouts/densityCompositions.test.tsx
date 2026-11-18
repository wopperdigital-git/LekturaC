import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Card, ContentBlock, LayoutType, VisualStyle } from '@/engine/contentBlocks'
import { GALLERY_DECK } from '@/engine/fixtures/galleryDeck'
import { LayoutRenderer } from './LayoutRenderer'

/**
 * The compositions (`compositionOf`): a slide with several body units is drawn as a side
 * head (claim and lead left, the body on a zone panel right) or a split body (head across
 * the top, two units side by side). JSX-only: the choice is pure and tested beside
 * `composition.ts`; what these pin is the markup each one is drawn as, in both treatments.
 */

const VARIANTS: VisualStyle[] = ['structured', 'expressive']

function render(blocks: ContentBlock[], variant: VisualStyle, layout: LayoutType = 'auto'): string {
  const card: Card = { id: 'card', orderIndex: 1, blocks, layout, visualStyle: variant }
  return renderToStaticMarkup(<LayoutRenderer card={card} />)
}

const count = (html: string, needle: string) => html.split(needle).length - 1

const LIST: ContentBlock = { type: 'bulletList', items: ['MARKITEMA', 'MARKITEMB', 'MARKITEMC'] }
const LEAD: ContentBlock = { type: 'paragraph', text: 'MARKLEAD' }
const TAIL: ContentBlock = { type: 'paragraph', text: 'MARKTAIL' }

describe('compositions', () => {
  for (const variant of VARIANTS) {
    describe(variant, () => {
      it('a short claim with several body units is a side head: the body is on the zone panel', () => {
        const html = render([{ type: 'heading', text: 'Loops' }, LEAD, LIST, TAIL], variant)
        expect(html).toContain('data-composition="sideHead"')
        const panel = html.indexOf('data-zone-panel')
        expect(count(html, 'data-zone-panel')).toBe(1)
        expect(html.indexOf('Loops')).toBeLessThan(panel)
        expect(html.indexOf('MARKLEAD')).toBeLessThan(panel)
        expect(html.indexOf('MARKITEMA')).toBeGreaterThan(panel)
        expect(html.indexOf('MARKTAIL')).toBeGreaterThan(panel)
      })

      it('a long claim with two units is a split body: the first unit is on the panel', () => {
        const long = 'L'.repeat(61)
        const html = render([{ type: 'heading', text: long }, LEAD, LIST, TAIL], variant)
        expect(html).toContain('data-composition="splitBody"')
        expect(count(html, 'data-zone-panel')).toBe(1)
        const panel = html.indexOf('data-zone-panel')
        expect(html.indexOf(long)).toBeLessThan(panel)
        expect(html.indexOf('MARKITEMA')).toBeGreaterThan(panel)
        expect(html.indexOf('MARKITEMC')).toBeGreaterThan(panel)
        // The second unit is outside the panel: after the list the panel's box closes and a
        // sibling cell (not marked as a panel) opens before the trailing paragraph.
        const between = html.slice(html.indexOf('MARKITEMC'), html.indexOf('MARKTAIL'))
        expect(between).toMatch(/<\/div><\/div><div class="@container[^"]*"/)
        expect(between).not.toContain('data-zone-panel')
      })

      it('a long claim with two units draws every block of the card exactly once', () => {
        const html = render(
          [
            { type: 'heading', text: `SPLITHEAD ${'L'.repeat(61)}` },
            { type: 'paragraph', text: 'SPLITLEAD' },
            { type: 'bulletList', items: ['SPLITA1', 'SPLITA2'] },
            { type: 'paragraph', text: 'SPLITB' },
          ],
          variant,
        )
        expect(html).toContain('data-composition="splitBody"')
        for (const text of ['SPLITHEAD', 'SPLITLEAD', 'SPLITA1', 'SPLITA2', 'SPLITB']) {
          expect(count(html, text), text).toBe(1)
        }
      })

      it('every zone panel and the split body second cell carry the panel width for the numeral caps', () => {
        const side = render([{ type: 'heading', text: 'Loops' }, LEAD, LIST, TAIL], variant)
        expect(count(side, '--zone-width:100cqi')).toBe(1)
        const split = render([{ type: 'heading', text: 'L'.repeat(61) }, LEAD, LIST, TAIL], variant)
        expect(count(split, '--zone-width:100cqi')).toBe(2)
        // Not drawn on a stack: nothing there is a panel.
        const stack = render([{ type: 'heading', text: 'Loops' }, LEAD, LIST], variant)
        expect(stack).not.toContain('--zone-width:')
      })

      it('a text focus slide keeps its reading measure in a stack and drops it when zoned', () => {
        const stack = render([{ type: 'heading', text: 'Loops' }, LEAD, TAIL], variant, 'textFocus')
        expect(stack).toContain('data-composition="stack"')
        expect(stack).toContain('class="flex max-w-prose flex-col"')
        const zoned = render([{ type: 'heading', text: 'Loops' }, LEAD, LIST, TAIL], variant, 'textFocus')
        expect(zoned).toContain('data-composition="sideHead"')
        expect(zoned).not.toContain('class="flex max-w-prose flex-col"')
      })

      it('a lead and one list is a stack: no zone panel', () => {
        const html = render([{ type: 'heading', text: 'Loops' }, LEAD, LIST], variant)
        expect(html).toContain('data-composition="stack"')
        expect(html).not.toContain('data-zone-panel')
      })

      it('a comparison with a paragraph is a side head with exactly one accent owner', () => {
        const html = render(
          [
            { type: 'heading', text: 'Two ways' },
            { type: 'comparisonGroup', heading: 'MARKCMPHA', items: ['MARKCMPIA'] },
            { type: 'comparisonGroup', heading: 'MARKCMPHB', items: ['MARKCMPIB'] },
            TAIL,
          ],
          variant,
          'comparison',
        )
        expect(html).toContain('data-composition="sideHead"')
        expect(count(html, 'data-accent-owner')).toBe(1)
      })

      it('a paragraph before the heading is drawn on the panel, the heading in the head', () => {
        const html = render(
          [{ type: 'paragraph', text: 'MARKFIRST' }, { type: 'heading', text: 'Loops' }, LIST, TAIL],
          variant,
        )
        expect(html).toContain('data-composition="sideHead"')
        const panel = html.indexOf('data-zone-panel')
        expect(html.indexOf('Loops')).toBeLessThan(panel)
        expect(html.indexOf('MARKFIRST')).toBeGreaterThan(panel)
      })
    })
  }

  it.each([
    ['g-sidehead', 'sideHead'],
    ['g-sidehead-stats', 'sideHead'],
    ['g-splitbody', 'splitBody'],
  ])('the gallery card %s is drawn as %s', (id, composition) => {
    const galleryCard = GALLERY_DECK.find((c) => c.id === id)!
    const html = renderToStaticMarkup(<LayoutRenderer card={galleryCard} />)
    expect(html).toContain(`data-composition="${composition}"`)
  })

  it('the stylesheet swaps a featured panel to the page colour inside a zone panel', () => {
    const css = readFileSync(new URL('../../index.css', import.meta.url), 'utf8')
    const rule = css.match(/\[data-zone-panel\] \[data-accent-panel\]\s*\{([^}]*)\}/)
    expect(rule, 'index.css should hold a [data-zone-panel] [data-accent-panel] rule').not.toBeNull()
    expect(rule![1]).toMatch(/--slide-panel-bg:\s*var\(--slide-background\)/)
  })
})
