import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { supabaseConfigured } from '@/lib/supabaseClient'
import { Button } from '@/components/ui/Button'
import { Input, Label } from '@/components/ui/Input'

type Mode = 'login' | 'signup' | 'forgot'

export function LoginPage() {
  const navigate = useNavigate()
  const status = useAuthStore((s) => s.status)
  const signIn = useAuthStore((s) => s.signIn)
  const signUp = useAuthStore((s) => s.signUp)
  const resetPasswordForEmail = useAuthStore((s) => s.resetPasswordForEmail)

  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [forgotEmail, setForgotEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [signupSuccess, setSignupSuccess] = useState(false)
  const [forgotSubmitted, setForgotSubmitted] = useState(false)

  useEffect(() => {
    if (status === 'authenticated') void navigate('/', { replace: true })
  }, [status, navigate])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    if (mode === 'login') {
      const { error: signInError } = await signIn(email, password)
      if (signInError) setError(signInError)
    } else {
      const { error: signUpError, needsVerification } = await signUp(email, password)
      if (signUpError) setError(signUpError)
      else if (needsVerification) setSignupSuccess(true)
    }
    setSubmitting(false)
  }

  async function handleForgotSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    await resetPasswordForEmail(forgotEmail)
    setSubmitting(false)
    setForgotSubmitted(true)
  }

  function switchMode(next: Mode) {
    setMode(next)
    setError(null)
    setSignupSuccess(false)
    setForgotSubmitted(false)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-app-canvas px-6">
      <div className="w-full max-w-sm rounded-app bg-app-background p-8 shadow-app">
        <h1 className="mb-6 text-xl font-semibold text-app-foreground">
          {mode === 'login' ? 'Log in' : mode === 'signup' ? 'Sign up' : 'Reset password'}
        </h1>

        {!supabaseConfigured ? (
          <p className="text-sm text-app-muted">
            Supabase isn't configured, so accounts aren't available — add VITE_SUPABASE_URL /
            VITE_SUPABASE_ANON_KEY to .env.
          </p>
        ) : mode === 'forgot' ? (
          forgotSubmitted ? (
            <p className="text-sm text-app-muted">
              If an account exists for that email, we've sent a reset link.
            </p>
          ) : (
            <form onSubmit={handleForgotSubmit} className="flex flex-col gap-3">
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  required
                  autoFocus
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                />
              </div>
              <Button type="submit" variant="primary" disabled={submitting}>
                Send reset link
              </Button>
            </form>
          )
        ) : signupSuccess ? (
          <p className="text-sm text-app-muted">Check your email to confirm your account, then log in.</p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div>
              <Label>Email</Label>
              <Input type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <Label>Password</Label>
              <Input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" variant="primary" disabled={submitting}>
              {mode === 'login' ? 'Log in' : 'Sign up'}
            </Button>
          </form>
        )}

        {supabaseConfigured && mode !== 'forgot' && !signupSuccess && (
          <div className="mt-4 flex flex-col gap-1.5 text-xs">
            <button
              type="button"
              onClick={() => switchMode(mode === 'login' ? 'signup' : 'login')}
              className="cursor-pointer text-left text-app-muted hover:text-app-foreground hover:underline"
            >
              {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Log in'}
            </button>
            {mode === 'login' && (
              <button
                type="button"
                onClick={() => switchMode('forgot')}
                className="cursor-pointer text-left text-app-muted hover:text-app-foreground hover:underline"
              >
                Forgot password?
              </button>
            )}
          </div>
        )}

        {supabaseConfigured && mode === 'forgot' && (
          <button
            type="button"
            onClick={() => switchMode('login')}
            className="mt-4 cursor-pointer text-xs text-app-muted hover:text-app-foreground hover:underline"
          >
            Back to log in
          </button>
        )}
      </div>
    </div>
  )
}
