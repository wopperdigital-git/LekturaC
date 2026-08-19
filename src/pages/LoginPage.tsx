import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { supabaseConfigured } from '@/lib/supabaseClient'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Field, Input, PasswordInput } from '@/components/ui/Input'

type Mode = 'login' | 'signup' | 'forgot'

const MIN_PASSWORD_LENGTH = 6

const COPY: Record<Mode, { title: string; subtitle: string }> = {
  login: { title: 'Welcome back', subtitle: 'Log in to pick up where you left off.' },
  signup: { title: 'Create your account', subtitle: 'Turn a single brief into a finished deck.' },
  forgot: { title: 'Reset your password', subtitle: "We'll email you a link to set a new one." },
}

function validateEmail(value: string): string | null {
  if (!value.trim()) return 'Enter your email address.'
  // deliberately loose — the real check is the confirmation email landing
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'Enter a valid email address.'
  return null
}

function validatePassword(value: string, mode: Mode): string | null {
  if (!value) return 'Enter your password.'
  if (mode === 'signup' && value.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`
  }
  return null
}

export function LoginPage() {
  const navigate = useNavigate()
  const status = useAuthStore((s) => s.status)
  const signIn = useAuthStore((s) => s.signIn)
  const signUp = useAuthStore((s) => s.signUp)
  const resetPasswordForEmail = useAuthStore((s) => s.resetPasswordForEmail)

  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [emailError, setEmailError] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [signupSuccess, setSignupSuccess] = useState(false)
  const [forgotSubmitted, setForgotSubmitted] = useState(false)

  useEffect(() => {
    if (status === 'authenticated') void navigate('/', { replace: true })
  }, [status, navigate])

  function switchMode(next: Mode) {
    setMode(next)
    setEmailError(null)
    setPasswordError(null)
    setFormError(null)
    setSignupSuccess(false)
    setForgotSubmitted(false)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setFormError(null)

    const nextEmailError = validateEmail(email)
    setEmailError(nextEmailError)

    if (mode === 'forgot') {
      if (nextEmailError) return
      setSubmitting(true)
      await resetPasswordForEmail(email)
      setSubmitting(false)
      setForgotSubmitted(true)
      return
    }

    const nextPasswordError = validatePassword(password, mode)
    setPasswordError(nextPasswordError)
    if (nextEmailError || nextPasswordError) return

    setSubmitting(true)
    if (mode === 'login') {
      const { error } = await signIn(email, password)
      if (error) setFormError(error)
    } else {
      const { error, needsVerification } = await signUp(email, password)
      if (error) setFormError(error)
      else if (needsVerification) setSignupSuccess(true)
    }
    setSubmitting(false)
  }

  if (!supabaseConfigured) {
    return (
      <AuthLayout title="Accounts unavailable" subtitle="This app isn't connected to a backend yet.">
        <Alert tone="info">
          Supabase isn't configured, so accounts aren't available — add <code>VITE_SUPABASE_URL</code>{' '}
          and <code>VITE_SUPABASE_ANON_KEY</code> to <code>.env</code>.
        </Alert>
      </AuthLayout>
    )
  }

  // terminal states: the form is replaced by a confirmation message
  if (signupSuccess || forgotSubmitted) {
    return (
      <AuthLayout
        title={signupSuccess ? 'Check your inbox' : 'Check your inbox'}
        subtitle={signupSuccess ? 'One more step to finish signing up.' : 'A reset link is on its way.'}
      >
        <div className="auth-fade-in flex flex-col gap-4">
          <Alert tone="success">
            {signupSuccess
              ? `We sent a confirmation link to ${email}. Confirm your address, then log in.`
              : `If an account exists for ${email}, we've sent a link to reset its password.`}
          </Alert>
          <Button type="button" variant="secondary" onClick={() => switchMode('login')}>
            Back to log in
          </Button>
        </div>
      </AuthLayout>
    )
  }

  const submitLabel = mode === 'login' ? 'Log in' : mode === 'signup' ? 'Create account' : 'Send reset link'
  const pendingLabel =
    mode === 'login' ? 'Logging in…' : mode === 'signup' ? 'Creating account…' : 'Sending…'

  return (
    <AuthLayout
      title={COPY[mode].title}
      subtitle={COPY[mode].subtitle}
      footer={
        <div className="flex flex-col gap-2 text-sm">
          {mode === 'forgot' ? (
            <button
              type="button"
              onClick={() => switchMode('login')}
              className="cursor-pointer text-left text-app-muted transition-colors hover:text-app-foreground"
            >
              ← Back to log in
            </button>
          ) : (
            <p className="text-app-muted">
              {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
              <button
                type="button"
                onClick={() => switchMode(mode === 'login' ? 'signup' : 'login')}
                className="cursor-pointer font-medium text-app-accent-text underline-offset-4 transition-colors hover:underline"
              >
                {mode === 'login' ? 'Sign up' : 'Log in'}
              </button>
            </p>
          )}
        </div>
      }
    >
      <form key={mode} onSubmit={handleSubmit} noValidate className="auth-fade-in flex flex-col gap-4">
        <Field
          label="Email"
          error={emailError}
          render={(fieldProps) => (
            <Input
              {...fieldProps}
              type="email"
              autoComplete="email"
              autoFocus
              placeholder="you@example.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                if (emailError) setEmailError(null)
              }}
              onBlur={() => email && setEmailError(validateEmail(email))}
            />
          )}
        />

        {mode !== 'forgot' && (
          <Field
            label="Password"
            error={passwordError}
            hint={mode === 'signup' ? `At least ${MIN_PASSWORD_LENGTH} characters.` : undefined}
            render={(fieldProps) => (
              <PasswordInput
                {...fieldProps}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  if (passwordError) setPasswordError(null)
                }}
                onBlur={() => password && setPasswordError(validatePassword(password, mode))}
              />
            )}
          />
        )}

        {mode === 'login' && (
          <button
            type="button"
            onClick={() => switchMode('forgot')}
            className="-mt-1 cursor-pointer self-end text-xs text-app-muted transition-colors hover:text-app-accent-text"
          >
            Forgot password?
          </button>
        )}

        {formError && <Alert tone="error">{formError}</Alert>}

        <Button type="submit" variant="primary" loading={submitting} className="mt-1 w-full py-2.5">
          {submitting ? pendingLabel : submitLabel}
        </Button>
      </form>
    </AuthLayout>
  )
}
