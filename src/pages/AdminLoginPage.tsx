import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { supabaseConfigured } from '@/lib/supabaseClient'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Field, Input, PasswordInput } from '@/components/ui/Input'

/*
  The admin login (/admin/login). Log in only: admin accounts are made in the
  Supabase SQL editor (migration 0019), never signed up for, so there is no
  sign-up, account type or reset form here. `signIn(…, 'admin')` refuses any
  account without a row in `admins`, and the ordinary /login refuses admins.
  A forgotten password goes through the ordinary reset (/login → Forgot
  password), whose link lands on /reset-password and then, through /, on /admin.
*/

export function AdminLoginPage() {
  const navigate = useNavigate()
  const status = useAuthStore((s) => s.status)
  const isAdmin = useAuthStore((s) => s.isAdmin)
  const signIn = useAuthStore((s) => s.signIn)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [emailError, setEmailError] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Already signed in: an admin goes to the page, anyone else to their own home.
  useEffect(() => {
    if (status === 'authenticated') void navigate(isAdmin ? '/admin' : '/', { replace: true })
  }, [status, isAdmin, navigate])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setFormError(null)
    const nextEmailError = email.trim() ? null : 'Enter your email address.'
    const nextPasswordError = password ? null : 'Enter your password.'
    setEmailError(nextEmailError)
    setPasswordError(nextPasswordError)
    if (nextEmailError || nextPasswordError) return

    setSubmitting(true)
    const { error } = await signIn(email.trim(), password, 'admin')
    if (error) setFormError(error)
    setSubmitting(false)
  }

  const panel = {
    panelTitle: 'Admin',
    panelBody: 'Site-wide statistics for the people who build Lektura.',
  }

  if (!supabaseConfigured) {
    return (
      <AuthLayout title="Accounts unavailable" subtitle="This app isn't connected to a backend yet." {...panel}>
        <Alert tone="info">Supabase isn't configured, so nobody can log in.</Alert>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Admin login"
      subtitle="For admin accounts only."
      {...panel}
      footer={
        <p className="text-sm text-app-muted">
          Not an admin?{' '}
          <Link
            to="/login"
            className="font-medium text-app-accent-text underline-offset-4 transition-colors hover:underline"
          >
            Go to the regular login
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="auth-fade-in flex flex-col gap-4">
        <Field
          label="Email"
          error={emailError}
          render={(fieldProps) => (
            <Input
              {...fieldProps}
              type="email"
              autoComplete="username"
              autoFocus
              placeholder="you@example.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                if (emailError) setEmailError(null)
              }}
            />
          )}
        />
        <Field
          label="Password"
          error={passwordError}
          render={(fieldProps) => (
            <PasswordInput
              {...fieldProps}
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                if (passwordError) setPasswordError(null)
              }}
            />
          )}
        />

        {formError && <Alert tone="error">{formError}</Alert>}

        <Button type="submit" variant="primary" loading={submitting} className="mt-1 w-full py-2.5">
          {submitting ? 'Logging in…' : 'Log in'}
        </Button>
      </form>
    </AuthLayout>
  )
}
