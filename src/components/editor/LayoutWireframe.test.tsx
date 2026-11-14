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

/** The photo layouts draw their photo reaching the tile's top, bottom and outer edge, as the slide does. */
describe('LayoutWireframe bled photos', () => {
  const photoRect = (html: string) => {
    const tag = html.match(/<rect data-wire-photo=""[^>]*>/)?.[0] ?? ''
    const num = (name: string) => Number(tag.match(new RegExp(` ${name}="([0-9.]+)"`))?.[1])
    return { tag, x: num('x'), y: num('y'), width: num('width'), height: num('height') }
  }

  it.each<VisualStyle>(['structured', 'expressive'])('reaches the top and bottom, and the outer edge on its side (%s)', (style) => {
    for (const [layout, side] of [['imageFocus', 'left'], ['standardSplit', 'right']] as const) {
      const rect = photoRect(draw(layout, style))
      expect(rect.tag, layout).not.toBe('')
      expect(rect.y, layout).toBe(0)
      expect(rect.height, layout).toBe(90)
      if (side === 'left') expect(rect.x, layout).toBe(0)
      else expect(rect.x + rect.width, layout).toBe(160)
    }
  })

  it.each<VisualStyle>(['structured', 'expressive'])('draws no frame or rounded corners on the photo (%s)', (style) => {
    for (const layout of ['imageFocus', 'standardSplit'] as const) {
      const html = draw(layout, style)
      expect(photoRect(html).tag).not.toContain('rx=')
      expect(html).not.toContain('stroke')
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

/** The comparisons are toned panels and rules: one tint panel for the featured group, no bordered, accent-tinted card. */
describe('LayoutWireframe comparisons', () => {
  const panels = (html: string) => html.split('opacity="0.07"').length - 1

  it.each<VisualStyle>(['structured', 'expressive'])('draws no bordered or accent-tinted card (%s)', (style) => {
    for (const layout of ['comparison', 'comparisonTable'] as const) {
      const html = draw(layout, style)
      expect(html).not.toContain('fill-opacity')
      expect(html).not.toContain('stroke')
      expect(html).not.toContain('<circle')
    }
  })

  it('draws one tint panel for the columns in both treatments and one for the table only when expressive', () => {
    expect(panels(draw('comparison', 'structured'))).toBe(1)
    expect(panels(draw('comparison', 'expressive'))).toBe(1)
    expect(panels(draw('comparisonTable', 'structured'))).toBe(0)
    expect(panels(draw('comparisonTable', 'expressive'))).toBe(1)
  })

  it('draws a hairline above each structured column item and a square marker before each expressive one', () => {
    const rules = (style: VisualStyle) => draw('comparison', style).split('height="0.75"').length - 1
    expect(rules('structured')).toBe(6)
    expect(rules('expressive')).toBe(0)
    const squares = (style: VisualStyle) => draw('comparison', style).split('width="2.4"').length - 1
    expect(squares('structured')).toBe(0)
    expect(squares('expressive')).toBe(6)
  })

  it.each<VisualStyle>(['structured', 'expressive'])('draws an accent rule under each table heading and a hairline under each cell (%s)', (style) => {
    const html = draw('comparisonTable', style)
    expect(html.split('height="1.5"').length - 1).toBe(2)
    expect(html.split('height="0.75"').length - 1).toBe(6)
  })
})

/** The hero sits at the foot of the slide; only the expressive one draws the circle. The quote is left-aligned. */
describe('LayoutWireframe hero and quote', () => {
  it.each<VisualStyle>(['structured', 'expressive'])('draws the hero title in the lower half and the subtitle under it (%s)', (style) => {
    const html = draw('hero', style)
    const ys = [...html.matchAll(/<rect x="16" y="([\d.]+)"/g)].map((m) => Number(m[1]))
    // The rule, the title and the subtitle, top to bottom, all below the middle of the 90-high drawing.
    expect(ys.length).toBe(3)
    for (const y of ys) expect(y).toBeGreaterThanOrEqual(45)
    expect([...ys].sort((a, b) => a - b)).toEqual(ys)
  })

  it('draws one 30% accent circle on the expressive hero only', () => {
    expect(draw('hero', 'structured')).not.toContain('<circle')
    const html = draw('hero', 'expressive')
    expect(html.split('<circle').length - 1).toBe(1)
    expect(html).toContain('opacity="0.3"')
  })

  it.each<VisualStyle>(['structured', 'expressive'])('draws the quote left-aligned: a mark at the left, no centring (%s)', (style) => {
    const html = draw('quote', style)
    expect(html).not.toContain('text-anchor')
    expect(html).toMatch(/<text x="14"/)
    expect(html).toContain('data-wire-ground="tint"')
    // Quote lines and the attribution start on the left edge, never centred.
    expect(html).not.toMatch(/<rect x="(30|38|50|66)"/)
  })
})
