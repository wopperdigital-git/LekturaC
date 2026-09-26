import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { DEFAULT_PEN_SETTINGS, INK_COLORS, type PenSettings } from '@/engine/penSettings'
import { PenPopover } from './PenPopover'

/**
 * A render smoke test, the same deliberate exception as `ToolsPanel.test.tsx`:
 * what the popover offers for which settings. Clicking is not exercised (no jsdom).
 */

function render(
  overrides: Partial<Parameters<typeof PenPopover>[0]> = {},
  settings: PenSettings = DEFAULT_PEN_SETTINGS,
) {
  const noop = () => {}
  return renderToStaticMarkup(
    <PenPopover
      settings={settings}
      onChange={noop}
      hasTemporaryHere={false}
      hasTemporary={false}
      onClearSlide={noop}
      onClearAll={noop}
      atLimit={false}
      {...overrides}
    />,
  )
}

describe('PenPopover', () => {
  it('offers the three tools, the three sizes and where the ink is kept', () => {
    const html = render()
    for (const label of ['Pen', 'Marker', 'Eraser', 'Dot', 'Small circle', 'Big circle', 'On slide', 'Temporary']) {
      expect(html, label).toContain(label)
    }
    expect(html).toContain('aria-label="Dot"')
    expect(html).toContain('aria-label="Small circle"')
    expect(html).toContain('aria-label="Big circle"')
  })

  it('shows the current choice as pressed', () => {
    const html = render({}, { tool: 'marker', size: 'big', color: 'accent', keep: 'temporary' })
    expect(html).toMatch(/aria-pressed="true"[^>]*>Marker</)
    expect(html).toMatch(/aria-label="Big circle"[^>]*aria-pressed="true"|aria-pressed="true"[^>]*aria-label="Big circle"/)
    expect(html).toMatch(/aria-pressed="true"[^>]*>Temporary</)
  })

  it('offers a swatch for every ink colour', () => {
    const html = render()
    for (const { label } of INK_COLORS) expect(html).toContain(`aria-label="${label}"`)
  })

  // An eraser has no colour, so a colour row would be a control that does nothing.
  it('hides the colours while the eraser is chosen', () => {
    const html = render({}, { ...DEFAULT_PEN_SETTINGS, tool: 'eraser' })
    expect(html).not.toContain(`aria-label="${INK_COLORS[0].label}"`)
  })

  it('offers Clear only when there is temporary ink to clear', () => {
    expect(render()).not.toContain('Clear this slide')
    expect(render()).not.toContain('Clear all slides')
    const some = render({ hasTemporary: true, hasTemporaryHere: false })
    expect(some).toContain('Clear all slides')
    expect(some).not.toContain('Clear this slide')
    expect(render({ hasTemporary: true, hasTemporaryHere: true })).toContain('Clear this slide')
  })

  it('says why drawing is refused when the slide is full', () => {
    expect(render()).not.toContain('full of ink')
    expect(render({ atLimit: true })).toContain('full of ink')
  })
})
