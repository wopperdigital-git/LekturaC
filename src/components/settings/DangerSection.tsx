import { useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'

const CONFIRM_WORD = 'delete'

/**
 * Executive Danger Zone section for permanent account removal.
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
  }

  if (!armed) {
    return (
      <div className="rounded-app-sm border border-red-500/25 bg-red-500/5 p-4 flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <div className="grid size-8 shrink-0 place-items-center rounded-full bg-red-500/10 text-red-600 dark:text-red-400">
            <svg className="size-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
              <path d="M8 2.5l6 10.5H2L8 2.5z" />
              <path d="M8 6.5v3M8 11.5h.01" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="text-sm font-semibold text-red-600 dark:text-red-400">
              Delete Account
            </h4>
            <p className="mt-0.5 text-xs text-app-muted">
              Permanently delete your account along with all presentations, saved drafts, and associated classroom data. This action is irreversible.
            </p>
          </div>
        </div>

        <div className="flex justify-end pt-1">
          <Button
            variant="danger"
            onClick={() => setArmed(true)}
            className="text-xs"
          >
            Initiate account deletion
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-app-sm border border-red-500/40 bg-red-500/8 p-4 flex flex-col gap-4">
      <Alert tone="error">
        <span className="font-semibold">Irreversible action.</span> Deleting your account will immediately wipe your credentials, presentation library, and slide history.
        {role === 'teacher' && (
          <span className="block mt-1 font-medium">
            Classes you own will be removed, and enrolled students will lose access to associated announcements and quizzes.
          </span>
        )}
        {role === 'student' && (
          <span className="block mt-1 font-medium">
            You will be automatically removed from all classrooms you have joined.
          </span>
        )}
      </Alert>

      <Field
        label={`Type "${CONFIRM_WORD}" to confirm permanent deletion`}
        error={error}
        render={(fieldProps) => (
          <Input
            {...fieldProps}
            type="text"
            autoComplete="off"
            autoFocus
            placeholder={CONFIRM_WORD}
            value={typed}
            className="font-mono text-sm"
            onChange={(e) => {
              setTyped(e.target.value)
              if (error) setError(null)
            }}
          />
        )}
      />

      <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
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
          {deleting ? 'Deleting account…' : 'Permanently delete account'}
        </Button>
      </div>
    </div>
  )
}
