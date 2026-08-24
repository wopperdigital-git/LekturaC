import { createContext, useContext } from 'react'
import type { Mark, TextRange } from '@/engine/marks'
import type { TextStyle } from '@/engine/textStyle'

/**
 * What a rendered text run needs to know to become editable.
 *
 * Passed by context rather than by props because the twelve layout components
 * sit between the canvas and the text, and threading five props through every
 * one of them — for a feature only the editor uses — would make the presenter
 * view and the outline thumbnails carry editing plumbing they never exercise.
 *
 * `null` is the normal case: the presenter, the thumbnails and the theme
 * previews all render with no provider, and `EditableText` then emits plain
 * styled text with no listeners and no contentEditable.
 */
export interface TextEditing {
  /** Ref of the run currently being edited, or null when none is. */
  activeRef: string | null
  /** Marks and element style already stored for this card, keyed by text ref. */
  inline: Record<string, { marks?: Mark[]; style?: TextStyle }> | undefined
  onSelectText: (ref: string) => void
  onChangeText: (ref: string, nextText: string) => void
  /** Reports the caret/selection inside the active run so the toolbar can target it. */
  onSelectionChange: (ref: string, range: TextRange | null) => void
}

export const TextEditingContext = createContext<TextEditing | null>(null)

export function useTextEditing(): TextEditing | null {
  return useContext(TextEditingContext)
}
