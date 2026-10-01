import { describe, expect, it } from 'vitest'
import type { ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { EditorTool } from '@/engine/editorTool'
import { DEFAULT_PEN_SETTINGS } from '@/engine/penSettings'
import { DEFAULT_SHAPE_SETTINGS } from '@/engine/shapes'
import { layoutVarieties } from '@/engine/layoutEngine'
import { EditorToolbar } from './EditorToolbar'
import { DEFAULT_GRID, type EditorGrid } from './gridContext'

/**
 * A render smoke test, a deliberate exception to "pure logic only" like
 * `ToolsPanel.test.tsx`: the failures worth catching are in what the toolbar
 * draws — a missing button, a control enabled when it has nothing to act on.
 * Hover timing and the pan drag itself are not exercised (no jsdom).
 */

function render(
  overrides: Partial<{
    tool: EditorTool
    withPen: boolean
    withShapes: boolean
    slide: ComponentProps<typeof EditorToolbar>['slide']
    grid: EditorGrid
    canUndo: boolean
    canRedo: boolean
  }> = {},
) {
  const { tool = 'select', withPen = true, withShapes = true, slide, grid = DEFAULT_GRID, canUndo = true, canRedo = true } = overrides
  const noop = () => {}
  return renderToStaticMarkup(
    <EditorToolbar
      history={{ canUndo, canRedo, onUndo: noop, onRedo: noop }}
      tool={tool}
      slide={slide}
      onToolChange={noop}
      grid={grid}
      onGridChange={noop}
      pen={
        withPen
          ? {
              settings: DEFAULT_PEN_SETTINGS,
              onChange: noop,
              hasTemporaryHere: false,
              hasTemporary: false,
              onClearSlide: noop,
              onClearAll: noop,
              atLimit: false,
            }
          : undefined
      }
      shapes={
        withShapes
          ? {
              settings: DEFAULT_SHAPE_SETTINGS,
              onChange: noop,
              ink: { color: 'accent', keep: 'slide' },
              onInkChange: noop,
              atLimit: false,
            }
          : undefined
      }
    />,
  )
}

/** The opening tag of the button with this aria-label, so its attributes can be checked whatever their order. */
function button(html: string, label: string): string {
  const match = html.match(new RegExp(`<button[^>]*aria-label="${label}"[^>]*>`))
  if (!match) throw new Error(`no button labelled "${label}"`)
  return match[0]
}

describe('EditorToolbar', () => {
  it('offers undo, redo, select, move, pen, shapes, show grid and snap, in that order', () => {
    const html = render()
    const labels = ['Undo', 'Redo', 'Select', 'Move', 'Pen', 'Shapes', 'Show grid', 'Snap to grid']
    const at = labels.map((label) => html.indexOf(`aria-label="${label}"`))
    expect(at.every((i) => i >= 0)).toBe(true)
    expect([...at].sort((a, b) => a - b)).toEqual(at)
  })

  // Icons only: each name is in a hover tooltip, not a native title.
  it('names every button in a tooltip, and in no native title', () => {
    const html = render({
      slide: { layout: undefined, onAddContent: () => {} },
    })
    for (const label of ['Select', 'Move', 'Insert', 'Pen', 'Shapes', 'Show grid', 'Snap to grid']) {
      expect(html).toMatch(new RegExp(`role="tooltip"[^>]*>${label}<`))
      expect(button(html, label)).not.toMatch(/title="[^"]+"/)
    }
  })

  it('shows the grid and snap settings as they are', () => {
    const html = render({ grid: { show: false, snap: true } })
    expect(button(html, 'Show grid')).toContain('aria-pressed="false"')
    expect(button(html, 'Snap to grid')).toContain('aria-pressed="true"')
  })

  // History lives here, in front, where the slide counter used to be.
  it('disables undo and redo when there is nothing to undo or redo', () => {
    expect(button(render({ canUndo: false }), 'Undo')).toContain('disabled=""')
    expect(button(render({ canRedo: false }), 'Redo')).toContain('disabled=""')
    expect(button(render(), 'Undo')).not.toContain('disabled=""')
    expect(button(render(), 'Redo')).not.toContain('disabled=""')
  })

  it('has no slide counter', () => {
    expect(render({ slide: {} })).not.toMatch(/Slide \d+ of \d+/)
  })

  it('marks Select or Move as the active tool', () => {
    expect(button(render({ tool: 'select' }), 'Select')).toContain('aria-pressed="true"')
    expect(button(render({ tool: 'select' }), 'Move')).toContain('aria-pressed="false"')
    expect(button(render({ tool: 'pan' }), 'Move')).toContain('aria-pressed="true"')
    expect(button(render({ tool: 'pen' }), 'Select')).toContain('aria-pressed="false"')
  })


  it('has every menu closed until it is opened', () => {
    expect(render()).not.toContain('role="menu"')
  })

  it('offers a pen button that shows as the active tool while drawing', () => {
    expect(() => button(render(), 'Pen')).not.toThrow()
    expect(button(render({ tool: 'pen' }), 'Pen')).toContain('aria-pressed="true"')
    expect(button(render({ tool: 'select' }), 'Pen')).toContain('aria-pressed="false"')
  })

  it('has no pen button when the page gives it no pen state', () => {
    expect(() => button(render({ withPen: false }), 'Pen')).toThrow()
  })

  it('offers a shapes button that shows as the active tool while drawing a shape', () => {
    expect(() => button(render(), 'Shapes')).not.toThrow()
    expect(button(render({ tool: 'shape' }), 'Shapes')).toContain('aria-pressed="true"')
    expect(button(render({ tool: 'select' }), 'Shapes')).toContain('aria-pressed="false"')
    // Drawing a shape is not drawing with the pen.
    expect(button(render({ tool: 'shape' }), 'Pen')).toContain('aria-pressed="false"')
  })

  it('has no shapes button when the page gives it no shape state', () => {
    expect(() => button(render({ withShapes: false }), 'Shapes')).toThrow()
  })

  describe('with no element picked (the slide set)', () => {
    const layout = {
      options: layoutVarieties([{ type: 'heading', text: 'T' }, { type: 'bulletList', items: ['a', 'b'] }], 'list'),
      active: 'auto' as const,
      onChange: () => {},
      kind: 'list' as const,
    }
    const slide = { layout, onAddContent: () => {} }

    it('with a slide clicked: undo, redo, select, move, layout, insert, pen, shapes, grid, snap', () => {
      const html = render({ slide })
      const at = (needle: string) => html.indexOf(needle)
      expect(at('aria-label="Undo"')).toBeLessThan(at('aria-label="Redo"'))
      expect(at('aria-label="Redo"')).toBeLessThan(at('aria-label="Select"'))
      expect(at('aria-label="Select"')).toBeLessThan(at('aria-label="Move"'))
      expect(at('aria-label="Move"')).toBeLessThan(at('aria-label="Layout"'))
      expect(at('aria-label="Layout"')).toBeLessThan(at('aria-label="Insert"'))
      expect(at('aria-label="Insert"')).toBeLessThan(at('aria-label="Pen"'))
      expect(() => button(html, 'New slide')).toThrow()
      expect(at('aria-label="Pen"')).toBeLessThan(at('aria-label="Shapes"'))
      expect(at('aria-label="Shapes"')).toBeLessThan(at('aria-label="Show grid"'))
      expect(at('aria-label="Show grid"')).toBeLessThan(at('aria-label="Snap to grid"'))
    })

    // Headings and body text are in Insert; a separate Text button would be a
    // second way to add the same four things.
    it('has no separate Text button — Insert holds the text levels', () => {
      expect(() => button(render({ slide }), 'Text')).toThrow()
    })

    // With nothing clicked there is no slide to arrange or add to: the default set.
    it('has no Layout or Insert until a slide is clicked', () => {
      const html = render({ slide: {} })
      expect(() => button(html, 'Layout')).toThrow()
      expect(() => button(html, 'Insert')).toThrow()
    })

    // The picker offers only layouts of the slide's own type, so it names that type.
    it('names the slide type above the layout options', async () => {
      const { LayoutMenu } = await import('./LayoutPicker')
      const html = renderToStaticMarkup(<LayoutMenu layout={layout} />)
      expect(html).toContain('aria-label="Slide type: List"')
      expect(html.indexOf('>List<')).toBeLessThan(html.indexOf('<svg'))
      const title = renderToStaticMarkup(<LayoutMenu layout={{ ...layout, kind: 'title' }} />)
      expect(title).toContain('>Title<')
    })

    // Every element is a small wireframe with its name, not a text-only list.
    it('offers every kind of content as a picture, text levels first', async () => {
      const { CONTENT_OPTIONS } = await import('@/engine/newContent')
      const { ContentGrid } = await import('./ContentPicker')
      const html = renderToStaticMarkup(<ContentGrid onPick={() => {}} />)
      expect(html.match(/<svg/g)?.length).toBe(CONTENT_OPTIONS.length)
      for (const option of CONTENT_OPTIONS) expect(html).toContain(`>${option.label}<`)
      const at = (label: string) => html.indexOf(`>${label}<`)
      for (const text of ['Heading 1', 'Heading 2', 'Heading 3', 'Body text']) {
        expect(at(text)).toBeLessThan(at('Bullet list'))
      }
    })
  })

  it('shows the element set, with no layout or insert, while an element is picked', () => {
    const html = render()
    expect(() => button(html, 'Layout')).toThrow()
    expect(() => button(html, 'Insert')).toThrow()
  })
})
