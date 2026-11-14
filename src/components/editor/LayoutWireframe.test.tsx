import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { VisualStyle } from '@/engine/contentBlocks'
import { LayoutWireframe } from './LayoutWireframe'

const draw = (layout: Parameters<typeof LayoutWireframe>[0]['layout'], visualStyle: VisualStyle) =>
  renderToStaticMarkup(<LayoutWireframe layout={layout} visualStyle={visualStyle} />)

/** The picker promises what the slide shows, and the slide's ground follows `groundOfLayout`. */
describe('LayoutWireframe grounds', () => {
  it.each<VisualStyle>(['structured', 'expressive'])('draws the hero on a filled ground (%s)', (style) => {
    const html = draw('hero', style)
    expect(html).toContain('data-wire-ground="deep"')
    expect(html).not.toContain('data-wire-ground="tint"')
  })

  it.each<VisualStyle>(['structured', 'expressive'])('draws a quote and a stat hero on a faint tint (%s)', (style) => {
    for (const layout of ['quote', 'statHero'] as const) {
      const html = draw(layout, style)
      expect(html).toContain('data-wire-ground="tint"')
      expect(html).not.toContain('data-wire-ground="deep"')
    }
  })

  it('draws every other layout with no ground of its own', () => {
    for (const layout of ['standard', 'textFocus', 'iconGrid', 'timeline', 'comparison', 'standardSplit'] as const) {
      expect(draw(layout, 'structured')).not.toContain('data-wire-ground')
    }
  })
})

/** The list arrangements are numerals, ticks and rules: no surface panel and no bordered tile. */
describe('LayoutWireframe lists', () => {
  it.each<VisualStyle>(['structured', 'expressive'])('draws no surface or bordered tile for a list (%s)', (style) => {
    for (const layout of ['iconGrid', 'numberedList', 'checklist', 'splitList'] as const) {
      const html = draw(layout, style)
      expect(html).not.toContain('opacity="0.07"')
      expect(html).not.toContain('fill-opacity')
      // No accent disc behind a numeral: the only circle is the expressive checklist's unfilled ring.
      if (!(layout === 'checklist' && style === 'expressive')) expect(html).not.toContain('<circle')
    }
  })
})

/** The stat arrangements are figures, hairlines and space: no surface panel and no bordered tile. */
describe('LayoutWireframe stats', () => {
  it.each<VisualStyle>(['structured', 'expressive'])('draws no surface or bordered tile for a stat grid or list (%s)', (style) => {
    for (const layout of ['statGrid', 'statList'] as const) {
      const html = draw(layout, style)
      expect(html).not.toContain('opacity="0.07"')
      expect(html).not.toContain('fill-opacity')
    }
  })

  it('draws an accent hairline over each structured stat column and none over an expressive one', () => {
    const hairlines = (style: VisualStyle) => draw('statGrid', style).split('height="0.75"').length - 1
    expect(hairlines('structured')).toBe(3)
    expect(hairlines('expressive')).toBe(0)
  })

  it('draws hairlines between structured ledger rows and none between expressive ones', () => {
    const hairlines = (style: VisualStyle) => draw('statList', style).split('height="0.75"').length - 1
    expect(hairlines('structured')).toBe(2)
    expect(hairlines('expressive')).toBe(0)
  })
})

/** The timelines are one continuous track with a node per step: no surface panel, no numeral disc. */
describe('LayoutWireframe timelines', () => {
  const tracks = (html: string) => html.split('data-wire-track').length - 1

  it.each<VisualStyle>(['structured', 'expressive'])('draws no surface or bordered tile (%s)', (style) => {
    for (const layout of ['timeline', 'timelineRow'] as const) {
      const html = draw(layout, style)
      expect(html).not.toContain('opacity="0.07"')
      expect(html).not.toContain('fill-opacity')
    }
  })

  it.each<VisualStyle>(['structured', 'expressive'])('draws one track, not one per step (%s)', (style) => {
    for (const layout of ['timeline', 'timelineRow'] as const) expect(tracks(draw(layout, style))).toBe(1)
  })

  it('draws a dot per step when structured and none when expressive, which draws the numbers', () => {
    const dots = (layout: 'timeline' | 'timelineRow', style: VisualStyle) => draw(layout, style).split('<circle').length - 1
    expect(dots('timeline', 'structured')).toBe(3)
    expect(dots('timelineRow', 'structured')).toBe(4)
    expect(dots('timeline', 'expressive')).toBe(0)
    expect(dots('timelineRow', 'expressive')).toBe(0)
  })

  it('draws the expressive track thicker than the structured one', () => {
    const thickness = (layout: 'timeline' | 'timelineRow', style: VisualStyle) => {
      const tag = draw(layout, style).match(/<rect data-wire-track=""[^>]*>/)?.[0] ?? ''
      const size = (name: string) => Number(tag.match(new RegExp(name + '="([0-9.]+)"'))?.[1])
      return Math.min(size('width'), size('height'))
    }
    expect(thickness('timeline', 'expressive')).toBeGreaterThan(thickness('timeline', 'structured'))
    expect(thickness('timelineRow', 'expressive')).toBeGreaterThan(thickness('timelineRow', 'structured'))
  })
})
