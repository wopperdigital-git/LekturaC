import { useState } from 'react'
import type { DeckSummary } from '@/store/presentationStore'
import { useJobsStore } from '@/jobs/jobsStore'
import { Alert } from '@/components/ui/Alert'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'

export function DeleteDeckModal({
  deck,
  onCancel,
  onConfirm,
}: {
  deck: DeckSummary
  onCancel: () => void
  onConfirm: () => Promise<void>
}) {
  const [deleting, setDeleting] = useState(false)
  const [failed, setFailed] = useState(false)
  // Deleting stops these (`abortForDeck`), so the dialog says so before the press, not after.
  const quizRunning = useJobsStore((s) => s.jobs.quiz?.status === 'running' && s.jobs.quiz.deckId === deck.id)
  const videoRunning = useJobsStore((s) => s.jobs.video?.status === 'running' && s.jobs.video.deckId === deck.id)
  const scriptsRunning = useJobsStore((s) => s.jobs.narration?.status === 'running' && s.jobs.narration.deckId === deck.id)
  // What deleting stops, in words: "a quiz", "a quiz and a video", "a quiz, a video and narration scripts".
  const running = [quizRunning && 'a quiz', videoRunning && 'a video', scriptsRunning && 'narration scripts'].filter(
    (x): x is string => typeof x === 'string',
  )

  async function handleConfirm() {
    setDeleting(true)
    setFailed(false)
    try {
      await onConfirm()
      // no need to reset `deleting` on success — the modal unmounts with the caller's state
    } catch (err) {
      // The row is deleted before its video, so a failure here has removed nothing.
      console.warn('[deck] delete failed:', err)
      setDeleting(false)
      setFailed(true)
    }
  }

  return (
    <Modal title="Delete presentation" onClose={deleting ? () => {} : onCancel}>
      <p className="text-sm text-app-muted">
        Delete <span className="font-medium text-app-foreground">"{deck.title}"</span>? This can't
        be undone.
      </p>
      {running.length > 0 && (
        <p className="mt-2 text-sm text-app-muted">
          {`${running.length > 1 ? `${running.slice(0, -1).join(', ')} and ${running[running.length - 1]}` : running[0]}`.replace(/^./, (c) => c.toUpperCase())}{' '}
          {running.length > 1 || scriptsRunning ? 'are' : 'is'} being made for this deck. Deleting stops{' '}
          {running.length > 1 || scriptsRunning ? 'them' : 'it'}.
        </p>
      )}
      {failed && (
        <div className="mt-4">
          <Alert tone="error">
            Couldn't delete "{deck.title}". Nothing was removed. Check your connection and try again.
          </Alert>
        </div>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={deleting}>
          Cancel
        </Button>
        <Button variant="danger" onClick={() => void handleConfirm()} loading={deleting}>
          {deleting ? 'Deleting…' : failed ? 'Try again' : 'Delete'}
        </Button>
      </div>
    </Modal>
  )
}
