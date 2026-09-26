import { createContext, useContext } from 'react'

/**
 * The editor's graph-paper grid, as a view setting.
 *
 * Provided by `CardCanvas` (and so only by the editor: the presenter, the
 * narration viewer and the thumbnails never see it) and read by `SlideBody`, which
 * draws it, and `SelectionLayer`, which snaps to it. Like zoom it is not part of
 * the deck — nothing is stored and nothing enters undo history.
 */
export interface EditorGrid {
  show: boolean
  /** Independent of `show`: the grid still governs where dragged elements land while its lines are hidden. */
  snap: boolean
}

/** Snapping is on from the start; the lines are opt-in. */
export const DEFAULT_GRID: EditorGrid = { show: false, snap: true }

export const EditorGridContext = createContext<EditorGrid>(DEFAULT_GRID)

export function useEditorGrid(): EditorGrid {
  return useContext(EditorGridContext)
}
