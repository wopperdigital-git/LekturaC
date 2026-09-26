/*
  The editor's active tool, as a view setting.

  Like zoom and the grid it is not part of the deck: nothing is stored and
  nothing enters undo history. Pure and DOM-free so the rules are testable.

  `select` and `pan` are the arrow menu's two tools; `pen` and `shape` are the
  drawing tools, each reached from its own toolbar button rather than the arrow menu.
*/

export type EditorTool = 'select' | 'pan' | 'pen' | 'shape'

export const DEFAULT_TOOL: EditorTool = 'select'

/** What the *arrow menu* offers, in order (the pen and shape tools have their own buttons). */
export const EDITOR_TOOLS: readonly { id: EditorTool; label: string }[] = [
  { id: 'select', label: 'Select elements' },
  { id: 'pan', label: 'Move screen' },
]

/**
 * Whether a press on the canvas should grab and pan the view instead of doing
 * whatever it would otherwise do. A left press pans in Move screen; Ctrl+left pans
 * in every tool (the shortcut that predates the tool). Other buttons never pan.
 */
export function isPanPress(press: { button: number; ctrlKey: boolean }, tool: EditorTool): boolean {
  if (press.button !== 0) return false
  return tool === 'pan' || press.ctrlKey
}
