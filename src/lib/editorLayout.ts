/*
  Which editor the window has room for. Measured by the window, not by the device: a
  narrow desktop window and an iPad in portrait get the same compact editor.

  - `phone` (under 768px): no room for a slide beside any panel, so the editor shows a
    deck view instead (slides, scripts, Present, Create & export) and no editing.
  - `compact` (768px to 1099px, an iPad in portrait): the editor, with the outline and
    tools panel starting closed and opening over the canvas instead of beside it.
  - `full`: the editor as it was.
*/

export type EditorLayout = 'phone' | 'compact' | 'full'

export const COMPACT_MIN_WIDTH_PX = 768
export const FULL_MIN_WIDTH_PX = 1100

export function editorLayout(windowWidth: number): EditorLayout {
  // Unknown (0 in a test or before layout, NaN): the full editor, never the phone view on a laptop.
  if (!(windowWidth > 0)) return 'full'
  if (windowWidth < COMPACT_MIN_WIDTH_PX) return 'phone'
  if (windowWidth < FULL_MIN_WIDTH_PX) return 'compact'
  return 'full'
}
