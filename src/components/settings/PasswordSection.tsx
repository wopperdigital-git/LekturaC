import { useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Field, PasswordInput } from '@/components/ui/Input'

const MIN_PASSWORD_LENGTH = 6

/**
 * Sets a new password for the signed-in account. Confirmed twice, like sign-up
 * and the reset page: a typo in a field nobody can read costs a reset email to
 * undo. The current password isn't asked for — Supabase's `updateUser` accepts
 * the session as the proof, which is the same thing the reset link relies on.
 */
export function PasswordSection() {
  const updatePassword = useAuthStore((s) => s.updatePassword)

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [confirmError, setConfirmError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  async function save() {
    setFormError(null)

    const nextPasswordError =
      password.length < MIN_PASSWORD_LENGTH ? `Use at least ${MIN_PASSWORD_LENGTH} characters.` : null
    const nextConfirmError = password === confirm ? null : 'Passwords do not match.'
    setPasswordError(nextPasswordError)
    setConfirmError(nextConfirmError)
    if (nextPasswordError || nextConfirmError) return

    setSaving(true)
    const result = await updatePassword(password)
    setSaving(false)
    if (result.error) {
      setFormError(result.error)
      return
    }
    setPassword('')
    setConfirm('')
    setDone(true)
  }

  return (
    <div className="flex flex-col gap-4">
      <Field
        label="New password"
        error={passwordError}
        hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
        render={(fieldProps) => (
          <PasswordInput
            {...fieldProps}
            autoComplete="new-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              if (passwordError) setPasswordError(null)
              if (confirmError) setConfirmError(null)
              if (done) setDone(false)
            }}
          />
        )}
      />

      <Field
        label="Confirm new password"
        error={confirmError}
        render={(fieldProps) => (
          <PasswordInput
            {...fieldProps}
            autoComplete="new-password"
            placeholder="••••••••"
            value={confirm}
            onChange={(e) => {
              setConfirm(e.target.value)
              if (confirmError) setConfirmError(null)
            }}
          />
        )}
      />

      {formError && <Alert tone="error">{formError}</Alert>}
      {done && <Alert tone="success">Password updated.</Alert>}

      <div className="flex justify-end">
        <Button
          variant="primary"
          onClick={() => void save()}
          loading={saving}
          disabled={saving || (!password && !confirm)}
        >
          {saving ? 'Updating…' : 'Update password'}
        </Button>
      </div>
    </div>
  )
}
