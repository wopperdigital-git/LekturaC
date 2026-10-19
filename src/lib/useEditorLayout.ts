import { useSyncExternalStore } from 'react'
import { editorLayout, type EditorLayout } from './editorLayout'

function subscribe(onChange: () => void): () => void {
  window.addEventListener('resize', onChange)
  return () => window.removeEventListener('resize', onChange)
}

/** The layout for the window's width, kept current as it is resized or rotated. */
export function useEditorLayout(): EditorLayout {
  // The snapshot is the layout, not the width: resizing within one band re-renders nothing.
  return useSyncExternalStore(
    subscribe,
    () => editorLayout(window.innerWidth),
    () => 'full',
  )
}
