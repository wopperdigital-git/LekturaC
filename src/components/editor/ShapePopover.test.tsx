import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { SHAPE_KINDS } from '@/engine/overlay'
import { INK_COLORS } from '@/engine/penSettings'
import { DEFAULT_SHAPE_SETTINGS, SHAPE_LABELS, type ShapeSettings } from '@/engine/shapes'
import { ShapePopover } from './ShapePopover'

/**
 * A render smoke test, the same deliberate exception as `PenPopover.test.tsx`:
 * what the popover offers for which settings. Clicking is not exercised (no jsdom).
 */

function render(
  overrides: Partial<Parameters<typeof ShapePopover>[0]> = {},
  settings: ShapeSettings = DEFAULT_SHAPE_SETTINGS,
) {
  const noop = () => {}
  return renderToStaticMarkup(
    <ShapePopover
      settings={settings}
      onChange={noop}
      ink={{ color: 'accent', keep: 'slide' }}
      onInkChange={noop}
      atLimit={false}
      {...overrides}
    />,
  )
}

describe('ShapePopover', () => {
  it('offers exactly the six shapes, each with a name', () => {
    const html = render()
    for (const kind of SHAPE_KINDS) expect(html, kind).toContain(`aria-label="${SHAPE_LABELS[kind]}"`)
    expect(SHAPE_KINDS).toHaveLength(6)
    // Six shape choices and no seventh.
    expect(html.match(/data-shape-choice/g)).toHaveLength(6)
  })

  it('shows the current shape as pressed', () => {
    const html = render({}, { shape: 'diamond', fill: false })
    expect(html).toMatch(/aria-label="Diamond"[^>]*aria-pressed="true"|aria-pressed="true"[^>]*aria-label="Diamond"/)
    expect(html).not.toMatch(/aria-label="Ellipse"[^>]*aria-pressed="true"|aria-pressed="true"[^>]*aria-label="Ellipse"/)
  })

  it('offers Outline and Filled, with the current one pressed', () => {
    expect(render({}, { shape: 'rectangle', fill: false })).toMatch(/aria-pressed="true"[^>]*>Outline</)
    expect(render({}, { shape: 'rectangle', fill: true })).toMatch(/aria-pressed="true"[^>]*>Filled</)
  })

  it('shares the colour row and the keep row with the pen', () => {
    const html = render()
    for (const { label } of INK_COLORS) expect(html).toContain(`aria-label="${label}"`)
    expect(html).toContain('On slide')
    expect(html).toContain('Temporary')
  })

  it('says why drawing is refused when the slide is full', () => {
    expect(render()).not.toContain('full of ink')
    expect(render({ atLimit: true })).toContain('full of ink')
  })
})
