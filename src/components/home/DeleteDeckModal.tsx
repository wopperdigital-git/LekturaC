import { useState } from 'react'
import type { DeckSummary } from '@/store/presentationStore'
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

  async function handleConfirm() {
    setDeleting(true)
    await onConfirm()
    // no need to reset `deleting` on success — the modal unmounts with the caller's state
  }

  return (
    <Modal title="Delete presentation" onClose={deleting ? () => {} : onCancel}>
      <p className="text-sm text-app-muted">
        Delete <span className="font-medium text-app-foreground">"{deck.title}"</span>? This can't
        be undone.
      </p>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={deleting}>
          Cancel
        </Button>
        <Button variant="danger" onClick={handleConfirm} loading={deleting}>
          {deleting ? 'Deleting…' : 'Delete'}
        </Button>
      </div>
    </Modal>
  )
}
