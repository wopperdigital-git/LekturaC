import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { EditorTool } from '@/engine/editorTool'
import { DEFAULT_PEN_SETTINGS } from '@/engine/penSettings'
import { DEFAULT_SHAPE_SETTINGS } from '@/engine/shapes'
import { EditorToolbar } from './EditorToolbar'

/**
 * A render smoke test, a deliberate exception to "pure logic only" like
 * `ToolsPanel.test.tsx`: the failures worth catching are in what the toolbar
 * draws — a missing button, a control enabled when it has nothing to act on.
 * Hover timing and the pan drag itself are not exercised (no jsdom).
 */

function render(
  overrides: Partial<{
    canUndo: boolean
    canRedo: boolean
    tool: EditorTool
    withSlide: boolean
    withPen: boolean
    withShapes: boolean
  }> = {},
) {
  const { canUndo = true, canRedo = true, tool = 'select', withSlide = true, withPen = true, withShapes = true } = overrides
  const noop = () => {}
  return renderToStaticMarkup(
    <EditorToolbar
      canUndo={canUndo}
      canRedo={canRedo}
      onUndo={noop}
      onRedo={noop}
      tool={tool}
      onToolChange={noop}
      onAddText={withSlide ? noop : undefined}
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
  it('offers undo, redo, the arrow tool and the text tool', () => {
    const html = render()
    for (const label of ['Undo', 'Redo', 'Text', 'Tool: Select elements']) {
      expect(() => button(html, label), label).not.toThrow()
    }
  })

  it('disables undo and redo when there is nothing to undo or redo', () => {
    expect(button(render({ canUndo: false }), 'Undo')).toContain('disabled=""')
    expect(button(render({ canRedo: false }), 'Redo')).toContain('disabled=""')
    expect(button(render(), 'Undo')).not.toContain('disabled=""')
    expect(button(render(), 'Redo')).not.toContain('disabled=""')
  })

  it('shows the active tool on the arrow button', () => {
    expect(() => button(render({ tool: 'select' }), 'Tool: Select elements')).not.toThrow()
    expect(() => button(render({ tool: 'pan' }), 'Tool: Move screen')).not.toThrow()
  })

  // Adding text appends to the selected slide, so with none selected the button
  // has nothing to act on.
  it('disables the text tool until a slide is selected', () => {
    expect(button(render({ withSlide: false }), 'Text')).toContain('disabled=""')
    expect(button(render({ withSlide: true }), 'Text')).not.toContain('disabled=""')
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
})
