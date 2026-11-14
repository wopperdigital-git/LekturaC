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
