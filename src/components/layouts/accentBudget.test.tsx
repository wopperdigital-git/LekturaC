import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Card } from '@/engine/contentBlocks'
import { CPP_DECK, withStyle } from '@/engine/fixtures/cppDeck'
import { LayoutRenderer } from './LayoutRenderer'

const owners = (html: string) => html.split('data-accent-owner').length - 1

describe('accent is a budget: one filled panel per slide', () => {
  it.each(['structured', 'expressive'] as const)('marks at most one accent owner per slide (%s)', (style) => {
    for (const [i, card] of withStyle(CPP_DECK, style).entries()) {
      const out = renderToStaticMarkup(<LayoutRenderer card={card} context={{ isFirstCard: i === 0 }} />)
      expect(owners(out), `card ${i}`).toBeLessThanOrEqual(1)
    }
  })

  it('fills no stat in an expressive stat grid', () => {
    const out = renderToStaticMarkup(<LayoutRenderer card={withStyle(CPP_DECK, 'expressive')[2]} />)
    expect(out).not.toContain('data-accent-owner')
    expect(out).not.toMatch(/bg-slide-accent p-6/)
  })

  it('features only the first group of a comparison', () => {
    const out = renderToStaticMarkup(<LayoutRenderer card={CPP_DECK[4]} />)
    expect(owners(out)).toBe(1)
  })

  it('features only the first group of an expressive comparison', () => {
    const out = renderToStaticMarkup(<LayoutRenderer card={withStyle(CPP_DECK, 'expressive')[4]} />)
    expect(owners(out)).toBe(1)
  })

  it.each(['structured', 'expressive'] as const)(
    'gives a comparison split into two runs one accent owner, not one per run (%s)',
    (style) => {
      const card = {
        ...CPP_DECK[4],
        layout: 'comparison' as const,
        visualStyle: style,
        blocks: [
          { type: 'heading', text: 'Two runs' },
          { type: 'comparisonGroup', heading: 'A', items: ['a1'] },
          { type: 'comparisonGroup', heading: 'B', items: ['b1'] },
          { type: 'paragraph', text: 'Between the runs.' },
          { type: 'comparisonGroup', heading: 'C', items: ['c1'] },
          { type: 'comparisonGroup', heading: 'D', items: ['d1'] },
        ],
      } as Card
      const out = renderToStaticMarkup(<LayoutRenderer card={card} />)
      expect(owners(out)).toBe(1)
    },
  )

  it.each(['structured', 'expressive'] as const)('marks only the first column of a comparison table (%s)', (style) => {
    const card = { ...withStyle(CPP_DECK, style)[4], layout: 'comparisonTable' as const }
    const out = renderToStaticMarkup(<LayoutRenderer card={card} />)
    expect(owners(out)).toBe(1)
    // The one panel is a tint, never an accent fill, and only the expressive table draws it.
    expect(out).not.toMatch(/\bbg-slide-accent(?!\/)/)
    expect(out.split('data-accent-panel').length - 1).toBe(style === 'expressive' ? 1 : 0)
  })

  it('draws the expressive stat hero figure on the one owner panel', () => {
    const card = { ...withStyle(CPP_DECK, 'expressive')[2], layout: 'statHero' as const }
    const out = renderToStaticMarkup(<LayoutRenderer card={card} />)
    expect(owners(out)).toBe(1)
  })

  it.each(['structured', 'expressive'] as const)(
    'gives a callout the accent in every layout, still one owner (%s)',
    (style) => {
      const blocks = [
        { type: 'heading', text: 'Mixed' },
        { type: 'stat', value: '72%', label: 'of bugs' },
        { type: 'comparisonGroup', heading: 'A', items: ['a1'] },
        { type: 'comparisonGroup', heading: 'B', items: ['b1'] },
        { type: 'callout', label: 'Key idea', text: 'Say it once.' },
      ] as Card['blocks']
      for (const layout of [
        'auto',
        'standard',
        'statHero',
        'statGrid',
        'statList',
        'comparison',
        'comparisonTable',
        'beforeAfter',
        'iconGrid',
        'textFocus',
        'section',
        'statement',
        'hero',
      ] as const) {
        const out = renderToStaticMarkup(
          <LayoutRenderer card={{ ...CPP_DECK[4], layout, visualStyle: style, blocks }} context={{ isFirstCard: false }} />,
        )
        expect(owners(out), layout).toBe(1)
        expect(out.match(/<[a-z0-9]+[^>]*data-accent-owner[^>]*>/)?.[0], layout).toContain('data-callout')
        // A callout takes the featured comparison panel's place too.
        expect(out, layout).not.toContain('data-accent-panel')
      }
    },
  )

  it('gives a stat row no accent fill in the expressive ledger', () => {
    const card = { ...withStyle(CPP_DECK, 'expressive')[2], layout: 'statList' as const }
    const out = renderToStaticMarkup(<LayoutRenderer card={card} />)
    expect(owners(out)).toBe(0)
    expect(out).not.toMatch(/bg-slide-accent/)
  })
})
