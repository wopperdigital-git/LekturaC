import { useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Field, PasswordInput } from '@/components/ui/Input'

const MIN_PASSWORD_LENGTH = 6

/**
 * Executive Password & Security section.
 * Provides password updating with interactive validation pills and visibility toggles.
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

  const hasMinLength = password.length >= MIN_PASSWORD_LENGTH
  const passwordsMatch = Boolean(password && password === confirm)

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
    <div className="flex flex-col gap-5">
      {/* Security Guidance Card */}
      <div className="flex items-start gap-3 rounded-app-sm border border-app-border bg-app-surface/30 p-4">
        <div className="grid size-8 shrink-0 place-items-center rounded-full bg-app-accent/10 text-app-accent">
          <svg className="size-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
            <path d="M8 1.5l5 2v4c0 4-3 6.5-5 7.5-2-1-5-3.5-5-7.5v-4l5-2z" />
            <path d="M6 8l1.5 1.5L10.5 6" />
          </svg>
        </div>
        <div className="min-w-0">
          <h4 className="text-sm font-semibold text-app-foreground">Credential Security</h4>
          <p className="mt-0.5 text-xs text-app-muted">
            Update your authentication credentials. Use a strong, unique password to ensure your course materials and account data remain protected.
          </p>
        </div>
      </div>

      {/* Password Form */}
      <div className="rounded-app-sm border border-app-border bg-app-background p-4 flex flex-col gap-4">
        <Field
          label="New password"
          error={passwordError}
          render={(fieldProps) => (
            <PasswordInput
              {...fieldProps}
              autoComplete="new-password"
              placeholder="Enter new password"
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
              placeholder="Confirm new password"
              value={confirm}
              onChange={(e) => {
                setConfirm(e.target.value)
                if (confirmError) setConfirmError(null)
              }}
            />
          )}
        />

        {/* Live validation feedback */}
        {(password || confirm) && (
          <div className="flex flex-wrap gap-2 text-xs">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 transition-colors ${
                hasMinLength
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium'
                  : 'bg-app-surface text-app-muted'
              }`}
            >
              <svg className="size-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                {hasMinLength ? <path d="M2.5 6.5l2.5 2.5 5-5" /> : <circle cx="6" cy="6" r="2.5" fill="currentColor" />}
              </svg>
              Min. 6 characters
            </span>

            {confirm && (
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 transition-colors ${
                  passwordsMatch
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium'
                    : 'bg-red-500/10 text-red-600 dark:text-red-400 font-medium'
                }`}
              >
                <svg className="size-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                  {passwordsMatch ? <path d="M2.5 6.5l2.5 2.5 5-5" /> : <path d="M3 3l6 6M9 3l-6 6" />}
                </svg>
                {passwordsMatch ? 'Passwords match' : 'Passwords do not match'}
              </span>
            )}
          </div>
        )}

        {formError && <Alert tone="error">{formError}</Alert>}
        {done && <Alert tone="success">Your password was updated successfully.</Alert>}

        <div className="flex justify-end pt-1">
          <Button
            variant="primary"
            onClick={() => void save()}
            loading={saving}
            disabled={saving || !password || !confirm}
          >
            {saving ? 'Updating password…' : 'Update password'}
          </Button>
        </div>
      </div>
    </div>
  )
}
