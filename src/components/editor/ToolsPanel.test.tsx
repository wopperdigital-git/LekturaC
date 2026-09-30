import { describe, expect, it } from 'vitest'
import type { ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import type { TextStyle } from '@/engine/textStyle'
import { DEFAULT_THEME } from '@/lib/theme-tokens'
import { ToolsPanel, type ToolbarLevel } from './ToolsPanel'

/**
 * A render smoke test, and a deliberate exception to "pure logic only" for the
 * same reason `everyBlockRenders.test.tsx` is one: the panel is all structure, and
 * the failures worth catching are in what it draws — a section that goes missing
 * for a selection it should serve, or a control that comes back after being
 * removed on purpose. No pure function can see that.
 */

function render(
  level: ToolbarLevel,
  textStyle: TextStyle = {},
  extra: Partial<ComponentProps<typeof ToolsPanel>> = {},
) {
  const noop = () => {}
  return renderToStaticMarkup(
    <MemoryRouter>
      <ToolsPanel
        level={level}
        scopeLabel="this slide"
        textStyle={textStyle}
        onTextStyleChange={noop}
        onFontPreview={noop}
        theme={DEFAULT_THEME}
        onThemeChange={noop}
        {...extra}
      />
    </MemoryRouter>,
  )
}

describe('ToolsPanel', () => {
  // Modelled on Figma's Design tab: what is always there, and what depends on the
  // selection. Typography and Fill write to the narrowest thing selected, so they
  // are never absent; the theme is ambient.
  it('always offers typography, fill and theme', () => {
    const html = render(1)
    for (const text of ['>Typography<', '>Fill<', 'Theme']) {
      expect(html).toContain(text)
    }
  })

  // History, zoom, Present and the tabs live in the editor's top bar now, and the
  // grid in the floating toolbar; two places for each would be two ways to do one thing.
  it('no longer carries history, zoom, Present or the tab row — the top bar does', () => {
    const html = render(1, {}, { narrationTab: <p>SLOT</p> })
    expect(html).not.toContain('aria-label="Undo"')
    expect(html).not.toContain('aria-label="Zoom (50')
    expect(html).not.toContain('Present')
    expect(html).not.toContain('role="tab"')
    expect(html).not.toContain('>Grid<')
    expect(html).not.toContain('Snap to grid')
  })

  it('offers a specific size, not only steppers', () => {
    expect(render(1)).toContain('aria-label="Font size (70–160%)"')
  })

  // Layout and adding content live in the floating toolbar; two places for each
  // would be two ways to do one thing.
  it('has no Layout or Content section — the floating toolbar has them', () => {
    const html = render(2)
    expect(html).not.toContain('>Layout<')
    expect(html).not.toContain('>Content<')
    expect(html).not.toContain('Add content')
  })

  it('orders the sections the way the panel is documented to', () => {
    const html = render(2)
    const at = (needle: string) => html.indexOf(needle)
    expect(at('>Typography<')).toBeLessThan(at('>Fill<'))
    expect(at('>Fill<')).toBeLessThan(at('Theme</h3>'))
  })

  // Figma's Fill row has a remove button only once there is a fill; with none, a
  // remove button would be a control that does nothing.
  it('offers Remove fill only when a colour is set', () => {
    expect(render(1)).not.toContain('Remove fill')
    expect(render(1, { color: '#ef4444' })).toContain('Remove fill')
  })

  // Adding an item moved onto the slide, as a plus under the list. Bringing the
  // button back to the panel would put two ways to do one thing on screen.
  it('has no Add item button — that is the plus under the list now', () => {
    expect(render(2)).not.toContain('Add item')
  })

  /* The opening tag that carries `id`, so an assertion can look at its attributes
     without depending on the order React prints them in. */
  function tagWithId(html: string, id: string): string {
    return html.match(new RegExp(`<[^>]*id="${id}"[^>]*>`))?.[0] ?? ''
  }

  it('has no narration panel when there is no narration slot', () => {
    expect(render(1)).not.toContain('tools-panel-narration')
  })

  // Unmounting the slot on a tab switch would run NarrationTab's cleanup and abort a
  // generation the user only looked away from, so it is rendered and merely hidden.
  it('keeps the narration slot mounted, but hidden, while Design is selected', () => {
    const html = render(1, {}, { narrationTab: <p>SLOT</p> })
    expect(html).toContain('SLOT')
    expect(tagWithId(html, 'tools-panel-narration')).toContain('hidden=""')
    expect(tagWithId(html, 'tools-panel-design')).not.toContain('hidden=""')
  })

  it('hides the Design sections, not unmounts them, while Narration is selected', () => {
    const html = render(1, {}, { tab: 'narration', narrationTab: <p>SLOT</p> })
    expect(tagWithId(html, 'tools-panel-narration')).not.toContain('hidden=""')
    expect(tagWithId(html, 'tools-panel-design')).toContain('hidden=""')
    expect(html).toContain('>Typography<')
  })
})
