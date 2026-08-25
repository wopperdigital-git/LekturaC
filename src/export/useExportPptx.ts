import { useCallback, useRef, useState } from 'react'
import { fetchDeck } from '@/store/presentationStore'
import { exportDeckToPptx, type ExportableDeck } from './pptx'

export type ExportStatus = 'idle' | 'working' | 'error'

/**
 * Export state for one trigger.
 *
 * Both entry points — the editor's TopBar and the dashboard's deck menu — share
 * this so the spinner, the disabled state and the error message are written
 * once. `exportDeck` takes a deck already in hand (the editor, which exports
 * unsaved edits too); `exportDeckById` reads one first (the dashboard).
 */
export function useExportPptx() {
  const [status, setStatus] = useState<ExportStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  // Guards a double click: a second export while the first is still writing
  // would download two files and race the two spinners.
  const running = useRef(false)

  const run = useCallback(async (load: () => Promise<ExportableDeck | null>) => {
    if (running.current) return
    running.current = true
    setStatus('working')
    setError(null)
    try {
      const deck = await load()
      if (!deck) throw new Error('This deck could not be read')
      await exportDeckToPptx(deck)
      setStatus('idle')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStatus('error')
    } finally {
      running.current = false
    }
  }, [])

  const exportDeck = useCallback(
    (deck: ExportableDeck) => run(async () => deck),
    [run],
  )

  const exportDeckById = useCallback(
    (id: string) =>
      run(async () => {
        const deck = await fetchDeck(id)
        // The dashboard holds only a DeckSummary, so it cannot disable the menu
        // item for an empty deck the way the editor disables its button. Saying
        // so beats handing the user a .pptx with no slides in it.
        if (deck && deck.cards.length === 0) throw new Error('This deck has no slides yet')
        return deck
      }),
    [run],
  )

  return { status, error, exportDeck, exportDeckById }
}
