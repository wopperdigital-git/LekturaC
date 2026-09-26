import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { SHAPE_KINDS, type OverlayItem, type Shape, type Stroke } from '@/engine/overlay'
import { OverlayLayer } from './OverlayLayer'

/**
 * A render smoke test, a deliberate exception to "pure logic only" like
 * `ToolsPanel.test.tsx`: the failure worth catching is in what is drawn — a
 * stroke that silently isn't, or a layer that draws when there is no ink.
 */

const stroke = (id: string, extra: Partial<Stroke> = {}): Stroke => ({
  id,
  kind: 'stroke',
  tool: 'pen',
  color: 'accent',
  width: 0.01,
  points: [[0.1, 0.1], [0.5, 0.5]],
  ...extra,
})

const shape = (id: string, extra: Partial<Shape> = {}): Shape => ({
  id,
  kind: 'shape',
  shape: 'rectangle',
  color: 'accent',
  width: 0.005,
  fill: false,
  x: 0.1,
  y: 0.2,
  w: 0.4,
  h: 0.2,
  ...extra,
})

const render = (items: OverlayItem[] | undefined, extra: Partial<Parameters<typeof OverlayLayer>[0]> = {}) =>
  renderToStaticMarkup(<OverlayLayer items={items} width={1000} {...extra} />)

describe('OverlayLayer', () => {
  it('draws nothing when there is no ink, so a plain card gains no extra node', () => {
    expect(render(undefined)).toBe('')
    expect(render([])).toBe('')
  })

  it('draws one path per stroke, in pixels of the content width', () => {
    const html = render([stroke('a'), stroke('b', { points: [[0.2, 0.2], [0.3, 0.3]] })])
    expect(html.match(/<path /g)).toHaveLength(2)
    expect(html).toContain('d="M100 100 L500 500"')
    expect(html).toContain('stroke-width="10"')
  })

  it('draws a one-point stroke as a dot (a zero-length segment with a round cap)', () => {
    const html = render([stroke('dot', { points: [[0.5, 0.5]] })])
    expect(html).toContain('d="M500 500 L500 500"')
    expect(html).toContain('stroke-linecap="round"')
  })

  it('follows the theme for theme colours and keeps a fixed colour as is', () => {
    expect(render([stroke('a', { color: 'accent' })])).toContain('stroke="var(--slide-accent)"')
    expect(render([stroke('a', { color: 'foreground' })])).toContain('stroke="var(--slide-foreground)"')
    expect(render([stroke('a', { color: '#ef4444' })])).toContain('stroke="#ef4444"')
  })

  it('draws a marker see-through and a pen solid', () => {
    expect(render([stroke('m', { tool: 'marker' })])).toContain('stroke-opacity="0.4"')
    expect(render([stroke('p', { tool: 'pen' })])).not.toContain('stroke-opacity="0.4"')
  })

  it('fades strokes the eraser is about to remove', () => {
    const html = render([stroke('a'), stroke('b')], { fading: new Set(['b']) })
    expect(html.match(/opacity="0.2"/g)).toHaveLength(1)
  })

  it('never takes a press, so text underneath stays editable', () => {
    expect(render([stroke('a')])).toContain('pointer-events:none')
  })

  it('marks temporary ink, so it can be told apart from ink that is part of the slide', () => {
    expect(render([stroke('a')], { temporary: true })).toContain('data-temporary')
    expect(render([stroke('a')])).not.toContain('data-temporary')
  })

  describe('shapes', () => {
    it('draws every one of the six kinds, in pixels of the content width', () => {
      for (const kind of SHAPE_KINDS) {
        const html = render([shape('a', { shape: kind })])
        expect(html, kind).toContain(`data-shape="${kind}"`)
      }
      const rect = render([shape('a')])
      expect(rect).toContain('x="100"')
      expect(rect).toContain('y="200"')
      expect(rect).toContain('width="400"')
      expect(rect).toContain('height="200"')
      expect(rect).toContain('stroke-width="5"')
    })

    it('draws a rounded rectangle with rounded corners and an ellipse from its centre', () => {
      expect(render([shape('a', { shape: 'rounded' })])).toMatch(/rx="40"/)
      const ellipse = render([shape('a', { shape: 'ellipse' })])
      expect(ellipse).toContain('cx="300"')
      expect(ellipse).toContain('rx="200"')
    })

    it('draws a filled shape tinted and an outline shape empty', () => {
      expect(render([shape('a', { fill: true })])).toContain('fill-opacity="0.35"')
      const outline = render([shape('a', { fill: false })])
      expect(outline).toContain('fill="none"')
      expect(outline).not.toContain('fill-opacity')
    })

    it('draws strokes and shapes together', () => {
      const html = render([stroke('s'), shape('r')])
      expect(html.match(/<path /g)).toHaveLength(1)
      expect(html).toContain('data-shape="rectangle"')
    })

    // A shape that took presses by default would block the text it sits over on
    // the presenter and in every thumbnail.
    it('lets presses through unless the editor asks for them', () => {
      expect(render([shape('a')])).not.toContain('visiblePainted')
      expect(render([shape('a')], { onPressItem: () => {} })).toContain('pointer-events:visiblePainted')
    })

    it('fades a shape the eraser is over', () => {
      expect(render([shape('a')], { fading: new Set(['a']) })).toContain('opacity="0.2"')
    })
  })
})
