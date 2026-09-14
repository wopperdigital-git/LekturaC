import { useState, type ReactNode } from 'react'
import { describeError } from '@/store/presentationStore'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'

/**
 * A yes/no for a write that cannot be taken back. Stays open and shows the
 * error if `onConfirm` throws; on success the caller unmounts it.
 */
export function ConfirmModal({
  title,
  children,
  confirmLabel,
  pendingLabel,
  danger = true,
  onCancel,
  onConfirm,
}: {
  title: string
  children: ReactNode
  confirmLabel: string
  pendingLabel: string
  danger?: boolean
  onCancel: () => void
  onConfirm: () => Promise<void>
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirm() {
    setPending(true)
    setError(null)
    try {
      await onConfirm()
    } catch (err) {
      setError(describeError(err))
      setPending(false)
    }
  }

  return (
    <Modal title={title} onClose={pending ? () => {} : onCancel}>
      <div className="text-sm text-app-muted">{children}</div>
      {error && (
        <div className="mt-4">
          <Alert tone="error">{error}</Alert>
        </div>
      )}
      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button variant={danger ? 'danger' : 'primary'} onClick={() => void confirm()} loading={pending}>
          {pending ? pendingLabel : confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}
