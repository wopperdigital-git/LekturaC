import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { CLONE_CONSENT_POINTS, CLONE_CONSENT_STATEMENT } from '@/voice/cloneConsent'

/*
  Asked once, the first time someone presses Record: where their recording goes, who can see the
  copy, and their agreement that it is their own voice. "I agree" is the consent; the caller then
  remembers it for this user on this device (`voice/cloneConsent.ts`) and does not ask again.
  Nothing is focused by default, so a stray Enter never agrees for them.
*/
export function CloneConsentModal({ onAgree, onCancel }: { onAgree: () => void; onCancel: () => void }) {
  return (
    <Modal title="Before you record" onClose={onCancel} maxWidth="max-w-md">
      <div className="flex flex-col gap-4">
        <ul className="flex list-disc flex-col gap-2 pl-5 text-sm text-app-muted">
          {CLONE_CONSENT_POINTS.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
        <p className="rounded-app-sm bg-app-surface px-3 py-2.5 text-sm font-semibold text-app-foreground">
          {CLONE_CONSENT_STATEMENT}
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onAgree}>
            I agree
          </Button>
        </div>
      </div>
    </Modal>
  )
}
