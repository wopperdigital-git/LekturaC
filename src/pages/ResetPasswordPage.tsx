import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Field, PasswordInput } from '@/components/ui/Input'

const MIN_PASSWORD_LENGTH = 6

export function ResetPasswordPage() {
  const navigate = useNavigate()
  const updatePassword = useAuthStore((s) => s.updatePassword)

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [confirmError, setConfirmError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setFormError(null)

    const nextPasswordError =
      password.length < MIN_PASSWORD_LENGTH
        ? `Use at least ${MIN_PASSWORD_LENGTH} characters.`
        : null
    const nextConfirmError = password !== confirm ? 'Passwords do not match.' : null
    setPasswordError(nextPasswordError)
    setConfirmError(nextConfirmError)
    if (nextPasswordError || nextConfirmError) return

    setSubmitting(true)
    const { error } = await updatePassword(password)
    setSubmitting(false)
    if (error) setFormError(error)
    else void navigate('/', { replace: true })
  }

  return (
    <AuthLayout title="Set a new password" subtitle="Choose a password to finish resetting your account.">
      <form onSubmit={handleSubmit} noValidate className="auth-fade-in flex flex-col gap-4">
        <Field
          label="New password"
          error={passwordError}
          hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
          render={(fieldProps) => (
            <PasswordInput
              {...fieldProps}
              autoComplete="new-password"
              autoFocus
              placeholder="••••••••"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                if (passwordError) setPasswordError(null)
              }}
            />
          )}
        />

        <Field
          label="Confirm password"
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

        <Button type="submit" variant="primary" loading={submitting} className="mt-1 w-full py-2.5">
          {submitting ? 'Updating…' : 'Update password'}
        </Button>
      </form>
    </AuthLayout>
  )
}
