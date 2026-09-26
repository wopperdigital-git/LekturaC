import { describe, expect, it } from 'vitest'
import { DEFAULT_TOOL, EDITOR_TOOLS, isPanPress } from './editorTool'

describe('isPanPress', () => {
  it('pans on a plain left press only in Move screen', () => {
    expect(isPanPress({ button: 0, ctrlKey: false }, 'pan')).toBe(true)
    expect(isPanPress({ button: 0, ctrlKey: false }, 'select')).toBe(false)
  })

  it('keeps Ctrl+drag as a pan in both tools', () => {
    expect(isPanPress({ button: 0, ctrlKey: true }, 'select')).toBe(true)
    expect(isPanPress({ button: 0, ctrlKey: true }, 'pan')).toBe(true)
  })

  // Drawing owns the plain drag; only Ctrl+drag pans, as it does everywhere else.
  it('does not pan on a plain press while drawing, but Ctrl+drag still does', () => {
    for (const tool of ['pen', 'shape'] as const) {
      expect(isPanPress({ button: 0, ctrlKey: false }, tool)).toBe(false)
      expect(isPanPress({ button: 0, ctrlKey: true }, tool)).toBe(true)
    }
  })

  it('never pans on a right or middle press, whatever the tool', () => {
    for (const button of [1, 2]) {
      for (const tool of [...EDITOR_TOOLS.map((t) => t.id), 'pen' as const, 'shape' as const]) {
        expect(isPanPress({ button, ctrlKey: false }, tool)).toBe(false)
        expect(isPanPress({ button, ctrlKey: true }, tool)).toBe(false)
      }
    }
  })
})

describe('EDITOR_TOOLS', () => {
  it('starts on Select elements, so the editor behaves as it always has', () => {
    expect(DEFAULT_TOOL).toBe('select')
  })

  it('lists Select elements then Move screen, each with a label', () => {
    expect(EDITOR_TOOLS.map((tool) => tool.id)).toEqual(['select', 'pan'])
    expect(EDITOR_TOOLS.map((tool) => tool.label)).toEqual(['Select elements', 'Move screen'])
  })
})
