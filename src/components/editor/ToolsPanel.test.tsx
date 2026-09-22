import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import type { Card } from '@/engine/contentBlocks'
import type { TextStyle } from '@/engine/textStyle'
import { layoutVarieties } from '@/engine/layoutEngine'
import { DEFAULT_THEME } from '@/lib/theme-tokens'
import { ToolsPanel, type ToolbarLevel } from './ToolsPanel'

/**
 * A render smoke test, and a deliberate exception to "pure logic only" for the
 * same reason `everyBlockRenders.test.tsx` is one: the panel is all structure, and
 * the failures worth catching are in what it draws — a section that goes missing
 * for a selection it should serve, or a control that comes back after being
 * removed on purpose. No pure function can see that.
 */

const card: Card = {
  id: 'a',
  orderIndex: 0,
  blocks: [
    { type: 'heading', text: 'Title' },
    { type: 'bulletList', items: ['One', 'Two', 'Three'] },
  ],
  layout: 'auto',
  visualStyle: 'structured',
}

function render(level: ToolbarLevel, withCard: boolean, textStyle: TextStyle = {}) {
  const noop = () => {}
  return renderToStaticMarkup(
    <MemoryRouter>
      <ToolsPanel
        level={level}
        scopeLabel="this slide"
        canUndo
        canRedo={false}
        onUndo={noop}
        onRedo={noop}
        presentHref="/deck/x/present"
        textStyle={textStyle}
        onTextStyleChange={noop}
        onFontPreview={noop}
        layout={
          withCard
            ? {
                options: layoutVarieties(card.blocks, 'list'),
                active: 'auto',
                onChange: noop,
                kind: 'list',
                card,
                isFirstCard: false,
              }
            : undefined
        }
        onAddContent={withCard ? noop : undefined}
        theme={DEFAULT_THEME}
        deckTextStyle={{}}
        onThemeChange={noop}
        zoom={1}
        onZoomChange={noop}
      />
    </MemoryRouter>,
  )
}

describe('ToolsPanel', () => {
  // Modelled on Figma's Design tab: what is always there, and what depends on the
  // selection. Typography and Fill write to the narrowest thing selected, so they
  // are never absent; the theme is ambient.
  it('always offers history, typography, fill and theme', () => {
    const html = render(1, false)
    for (const text of ['Undo', 'Redo', 'Present', '>Design<', '>Typography<', '>Fill<', 'Theme']) {
      expect(html).toContain(text)
    }
  })

  it('offers a specific size and a specific zoom, not only steppers', () => {
    const html = render(1, false)
    expect(html).toContain('aria-label="Font size (70–160%)"')
    expect(html).toContain('aria-label="Zoom (50–200%)"')
  })

  // The zoom lives in the header beside the tab, where Figma keeps it, so it is
  // reachable whatever is selected and never scrolls away with the sections.
  it('keeps the zoom in the header, before any section', () => {
    const html = render(1, false)
    expect(html.indexOf('aria-label="Zoom (50')).toBeLessThan(html.indexOf('>Typography<'))
  })

  it('shows layout and content only while a slide is selected', () => {
    const none = render(1, false)
    expect(none).not.toContain('Add content')
    expect(none).not.toContain('>Layout<')
    const slide = render(2, true)
    expect(slide).toContain('aria-label="Add content"')
    expect(slide).toContain('>Layout<')
    expect(slide).toContain('>Content<')
  })

  it('orders the sections the way the panel is documented to', () => {
    const html = render(2, true)
    const at = (needle: string) => html.indexOf(needle)
    expect(at('>Layout<')).toBeLessThan(at('>Content<'))
    expect(at('>Content<')).toBeLessThan(at('>Typography<'))
    expect(at('>Typography<')).toBeLessThan(at('>Fill<'))
    expect(at('>Fill<')).toBeLessThan(at('Theme</h3>'))
  })

  it('draws a picture of every layout the card can wear, plus Automatic', () => {
    const options = layoutVarieties(card.blocks, 'list')
    const html = render(2, true)
    expect(html).toContain('title="Automatic"')
    expect(options.length).toBeGreaterThan(1)
    expect(html.match(/ · \d/g)?.length).toBeGreaterThanOrEqual(options.length)
  })

  // Figma's Fill row has a remove button only once there is a fill; with none, a
  // remove button would be a control that does nothing.
  it('offers Remove fill only when a colour is set', () => {
    expect(render(1, false)).not.toContain('Remove fill')
    expect(render(1, false, { color: '#ef4444' })).toContain('Remove fill')
  })

  // Adding an item moved onto the slide, as a plus under the list. Bringing the
  // button back to the panel would put two ways to do one thing on screen.
  it('has no Add item button — that is the plus under the list now', () => {
    expect(render(2, true)).not.toContain('Add item')
  })
})
