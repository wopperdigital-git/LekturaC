import { useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'

const CONFIRM_WORD = 'delete'

/**
 * Deletes the account for good.
 *
 * Two-step, and the second step is typed rather than clicked: nothing here is
 * recoverable — there is no trash table and no server copy of a deck — so the
 * cost of an accidental click is the user's entire library. The consequences
 * are spelled out before the field appears, including the ones that reach
 * other people: deleting a teacher takes their classes with it, which removes
 * every student's access to the announcements and quizzes posted in them.
 */
export function DangerSection() {
  const role = useAuthStore((s) => s.profile?.role ?? 'general')
  const deleteAccount = useAuthStore((s) => s.deleteAccount)

  const [armed, setArmed] = useState(false)
  const [typed, setTyped] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirm() {
    setDeleting(true)
    setError(null)
    const result = await deleteAccount()
    if (result.error) {
      setError(result.error)
      setDeleting(false)
      return
    }
    // On success the sign-out inside deleteAccount flips auth state, and
    // RequireAuth takes it from here — this component is about to unmount, so
    // `deleting` is deliberately left set rather than flickering back.
  }

  if (!armed) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-app-muted">
          Deleting your account removes it permanently, along with every deck and slide you've made.
          This cannot be undone.
        </p>
        <div className="flex justify-start">
          <Button variant="secondary" onClick={() => setArmed(true)}>
            Delete account
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Alert tone="error">
        <span className="font-medium">This is permanent.</span> Your account, every deck and every
        slide will be deleted and cannot be recovered.
        {role === 'teacher' && ' The classes you own will also be deleted, along with their announcements and quizzes, and your students will lose access to them.'}
        {role === 'student' && ' You will be removed from the classes you joined.'}
      </Alert>

      <Field
        label={`Type "${CONFIRM_WORD}" to confirm`}
        error={error}
        render={(fieldProps) => (
          <Input
            {...fieldProps}
            type="text"
            autoComplete="off"
            autoFocus
            placeholder={CONFIRM_WORD}
            value={typed}
            onChange={(e) => {
              setTyped(e.target.value)
              if (error) setError(null)
            }}
          />
        )}
      />

      <div className="flex flex-wrap justify-end gap-2">
        <Button
          variant="ghost"
          onClick={() => {
            setArmed(false)
            setTyped('')
            setError(null)
          }}
          disabled={deleting}
        >
          Cancel
        </Button>
        <Button
          variant="danger"
          onClick={() => void confirm()}
          loading={deleting}
          disabled={deleting || typed.trim().toLowerCase() !== CONFIRM_WORD}
        >
          {deleting ? 'Deleting…' : 'Delete my account'}
        </Button>
      </div>
    </div>
  )
}
