import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/Button'
import { Input, Label } from '@/components/ui/Input'

export function ResetPasswordPage() {
  const navigate = useNavigate()
  const updatePassword = useAuthStore((s) => s.updatePassword)

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setSubmitting(true)
    const { error: updateError } = await updatePassword(password)
    setSubmitting(false)
    if (updateError) setError(updateError)
    else void navigate('/', { replace: true })
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-app-canvas px-6">
      <div className="w-full max-w-sm rounded-app bg-app-background p-8 shadow-app">
        <h1 className="mb-6 text-xl font-semibold text-app-foreground">Set a new password</h1>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <Label>New password</Label>
            <Input
              type="password"
              required
              minLength={6}
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div>
            <Label>Confirm password</Label>
            <Input
              type="password"
              required
              minLength={6}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" variant="primary" disabled={submitting}>
            Update password
          </Button>
        </form>
      </div>
    </div>
  )
}
