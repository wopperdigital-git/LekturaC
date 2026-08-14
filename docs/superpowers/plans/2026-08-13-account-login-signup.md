# Account Login & Signup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace LekturaC's silent anonymous Supabase auth with a required email/password login gate, including signup with email verification, logout, and password reset.

**Architecture:** A new `authStore.ts` zustand store subscribes to Supabase's auth state once at module load and exposes `user`/`status` plus sign-up/sign-in/sign-out/reset actions. A `RequireAuth` route wrapper reads that store and redirects unauthenticated visitors to a new `/login` page (which itself handles both login and signup in one page, plus a forgot-password sub-flow) and a new `/reset-password` page (landing spot for the reset-email link). The existing anonymous-session fallback in `supabaseClient.ts` is removed once the gate is fully wired.

**Tech Stack:** React 19, react-router-dom v7, zustand v5, @supabase/supabase-js v2 (Supabase Auth: email/password with confirmation required), Tailwind v4, TypeScript (verbatimModuleSyntax + erasableSyntaxOnly), oxlint, Vitest.

## Global Constraints

- `verbatimModuleSyntax: true` — type-only imports must use `import type`.
- `erasableSyntaxOnly: true` — no TS constructor-parameter-property shorthand.
- `@/*` path alias maps to `src/*`.
- No new automated tests for this feature — per the spec's Testing section, auth flows are network/Supabase-dependent, out of scope for this repo's narrow Vitest coverage (pure-logic only). Verification is manual, in the browser.
- Reuse existing UI primitives (`Button`, `Input`, `Label` from `src/components/ui/`) and the `app-*` Tailwind token namespace for all new page chrome — these are app-level pages, not deck content, so `slide-*` tokens don't apply here.
- `supabase` (the client) can be `null` when `supabaseConfigured` is `false`; every new function touching it must handle that the same way the existing `presentationStore.ts` does (`if (!supabase) return ...`).
- Password minimum length: rely on Supabase's own default (6 characters) via the `<input minLength={6}>` HTML attribute and by surfacing Supabase's own validation error text — no custom client-side password-strength logic.

---

### Task 1: `authStore.ts` — auth state and actions

**Files:**
- Create: `src/store/authStore.ts`

**Interfaces:**
- Consumes: `supabase`, `supabaseConfigured` from `src/lib/supabaseClient.ts` (existing, unchanged in this task).
- Produces: `useAuthStore` zustand hook with shape:
  ```ts
  interface AuthState {
    user: import('@supabase/supabase-js').User | null
    status: 'loading' | 'authenticated' | 'unauthenticated'
    signUp: (email: string, password: string) => Promise<{ error: string | null; needsVerification: boolean }>
    signIn: (email: string, password: string) => Promise<{ error: string | null }>
    signOut: () => Promise<void>
    resetPasswordForEmail: (email: string) => Promise<void>
    updatePassword: (newPassword: string) => Promise<{ error: string | null }>
  }
  ```
  Later tasks (`RequireAuth`, `LoginPage`, `ResetPasswordPage`, `HomePage`) import `useAuthStore` from `@/store/authStore` and use exactly these field/method names and signatures.

- [ ] **Step 1: Write `src/store/authStore.ts`**

```ts
import { create } from 'zustand'
import type { User } from '@supabase/supabase-js'
import { supabase, supabaseConfigured } from '@/lib/supabaseClient'

interface AuthState {
  user: User | null
  status: 'loading' | 'authenticated' | 'unauthenticated'
  signUp: (email: string, password: string) => Promise<{ error: string | null; needsVerification: boolean }>
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  resetPasswordForEmail: (email: string) => Promise<void>
  updatePassword: (newPassword: string) => Promise<{ error: string | null }>
}

export const useAuthStore = create<AuthState>(() => ({
  user: null,
  status: supabaseConfigured ? 'loading' : 'unauthenticated',

  async signUp(email, password) {
    if (!supabase) return { error: 'Supabase is not configured.', needsVerification: false }
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) return { error: error.message, needsVerification: false }
    return { error: null, needsVerification: !data.session }
  },

  async signIn(email, password) {
    if (!supabase) return { error: 'Supabase is not configured.' }
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error ? error.message : null }
  },

  async signOut() {
    if (!supabase) return
    await supabase.auth.signOut()
  },

  async resetPasswordForEmail(email) {
    if (!supabase) return
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
  },

  async updatePassword(newPassword) {
    if (!supabase) return { error: 'Supabase is not configured.' }
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    return { error: error ? error.message : null }
  },
}))

// Runs once at module load (this store is an app-wide singleton, same as
// usePresentationStore) — hydrates the current session, then keeps `user`/
// `status` live for login, logout, and the session Supabase creates
// automatically when a user clicks an email-confirmation or
// password-reset link.
if (supabaseConfigured && supabase) {
  supabase.auth.getSession().then(({ data }) => {
    useAuthStore.setState({
      user: data.session?.user ?? null,
      status: data.session ? 'authenticated' : 'unauthenticated',
    })
  })
  supabase.auth.onAuthStateChange((_event, session) => {
    useAuthStore.setState({
      user: session?.user ?? null,
      status: session ? 'authenticated' : 'unauthenticated',
    })
  })
}
```

- [ ] **Step 2: Verify it builds and lints clean**

Run: `npm run lint` and `npm run build`
Expected: both exit 0 with no errors. (This file isn't imported anywhere yet, but `tsc -b` type-checks every file under `src/`, so this alone confirms the store compiles correctly.)

- [ ] **Step 3: Commit**

```bash
git add src/store/authStore.ts
git commit -m "$(cat <<'EOF'
Add authStore for Supabase email/password auth state

Not wired into routing yet — later tasks add the login UI and the
route guard that consume it.
EOF
)"
```

---

### Task 2: `RequireAuth` route guard

**Files:**
- Create: `src/components/auth/RequireAuth.tsx`

**Interfaces:**
- Consumes: `useAuthStore` (from Task 1) — reads `status`.
- Produces: `RequireAuth` component, `{ children: ReactNode }` props, used by `App.tsx` (Task 5) to wrap each protected route's element.

- [ ] **Step 1: Write `src/components/auth/RequireAuth.tsx`**

```tsx
import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'

export function RequireAuth({ children }: { children: ReactNode }) {
  const status = useAuthStore((s) => s.status)

  if (status === 'loading') {
    return <div className="p-8 text-app-muted">Loading…</div>
  }
  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace />
  }
  return <>{children}</>
}
```

- [ ] **Step 2: Verify it builds and lints clean**

Run: `npm run lint` and `npm run build`
Expected: both exit 0 with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/auth/RequireAuth.tsx
git commit -m "Add RequireAuth route guard"
```

---

### Task 3: `LoginPage` — login, signup, and forgot-password in one page

**Files:**
- Create: `src/pages/LoginPage.tsx`

**Interfaces:**
- Consumes: `useAuthStore` (Task 1) — `status`, `signIn`, `signUp`, `resetPasswordForEmail`; `supabaseConfigured` from `src/lib/supabaseClient.ts`; `Button`, `Input`, `Label` from `src/components/ui/`.
- Produces: `LoginPage` component (no props), used at route `/login` in `App.tsx` (Task 5).

- [ ] **Step 1: Write `src/pages/LoginPage.tsx`**

```tsx
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
    if (status === 'authenticated') navigate('/', { replace: true })
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
```

- [ ] **Step 2: Verify it builds and lints clean**

Run: `npm run lint` and `npm run build`
Expected: both exit 0 with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/LoginPage.tsx
git commit -m "Add LoginPage (login, signup, forgot-password)"
```

---

### Task 4: `ResetPasswordPage`

**Files:**
- Create: `src/pages/ResetPasswordPage.tsx`

**Interfaces:**
- Consumes: `useAuthStore` (Task 1) — `updatePassword`; `Button`, `Input`, `Label` from `src/components/ui/`.
- Produces: `ResetPasswordPage` component (no props), used at route `/reset-password` in `App.tsx` (Task 5).

- [ ] **Step 1: Write `src/pages/ResetPasswordPage.tsx`**

```tsx
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
```

- [ ] **Step 2: Verify it builds and lints clean**

Run: `npm run lint` and `npm run build`
Expected: both exit 0 with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/ResetPasswordPage.tsx
git commit -m "Add ResetPasswordPage"
```

---

### Task 5: Wire the auth gate — routes + remove anonymous sign-in

This is the "flip the switch" task: after this commit, the app requires a real login and anonymous sessions are no longer created. Both changes land together so there's no intermediate commit where the app is half-gated.

**Files:**
- Modify: `src/App.tsx` (full file — add `/login`, `/reset-password` routes; wrap the four existing routes in `RequireAuth`)
- Modify: `src/lib/supabaseClient.ts:19-31` (`ensureSession` — drop the `signInAnonymously()` fallback)

**Interfaces:**
- Consumes: `RequireAuth` (Task 2), `LoginPage` (Task 3), `ResetPasswordPage` (Task 4).
- Produces: no new exports; this is the integration point.

- [ ] **Step 1: Rewrite `src/App.tsx`**

```tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { HomePage } from '@/pages/HomePage'
import { CreatePage } from '@/pages/CreatePage'
import { EditorPage } from '@/pages/EditorPage'
import { PresentPage } from '@/pages/PresentPage'
import { LoginPage } from '@/pages/LoginPage'
import { ResetPasswordPage } from '@/pages/ResetPasswordPage'
import { RequireAuth } from '@/components/auth/RequireAuth'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <HomePage />
            </RequireAuth>
          }
        />
        <Route
          path="/new"
          element={
            <RequireAuth>
              <CreatePage />
            </RequireAuth>
          }
        />
        <Route
          path="/deck/:id"
          element={
            <RequireAuth>
              <EditorPage />
            </RequireAuth>
          }
        />
        <Route
          path="/deck/:id/present"
          element={
            <RequireAuth>
              <PresentPage />
            </RequireAuth>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}

export default App
```

- [ ] **Step 2: Update `ensureSession` in `src/lib/supabaseClient.ts`**

Replace lines 12-31 (the `ensureSessionPromise` variable and `ensureSession` function) with:

```ts
let ensureSessionPromise: Promise<void> | null = null

/**
 * Waits for the Supabase client to finish hydrating any existing session
 * from storage. Callers (in presentationStore.ts) always run after
 * RequireAuth has already confirmed a real session exists, so this never
 * creates a session itself — it's just a hydration-ordering guard.
 */
export function ensureSession(): Promise<void> {
  if (!supabase) return Promise.resolve()
  if (!ensureSessionPromise) {
    ensureSessionPromise = supabase.auth.getSession().then(() => undefined)
  }
  return ensureSessionPromise
}
```

The rest of the file (the `url`/`anonKey`/`supabaseConfigured`/`supabase` exports above it) is unchanged.

- [ ] **Step 3: Verify it builds and lints clean**

Run: `npm run lint` and `npm run build`
Expected: both exit 0 with no errors.

- [ ] **Step 4: Manual verification — the gate itself**

Run: `npm run dev`, then in a browser:
1. Clear site data for `localhost` (Application tab → Clear site data), so no old anonymous session lingers.
2. Visit `http://localhost:5173/`. Expected: redirected to `/login`.
3. Click "Don't have an account? Sign up", enter a real email you can check and a password of 6+ characters, submit. Expected: "Check your email to confirm your account, then log in."
4. Open the confirmation email, click the link. Expected: it opens the app already logged in (lands on `/`, "Your presentations" with no decks).
5. If step 4 instead shows an error about the redirect URL not being allowed, go to the Supabase dashboard → Auth → URL Configuration and add `http://localhost:5173/*` to the allowed redirect URLs, then retry signup.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/lib/supabaseClient.ts
git commit -m "$(cat <<'EOF'
Wire the auth gate: require login, drop anonymous sessions

All routes except /login and /reset-password now redirect
unauthenticated visitors to /login via RequireAuth. ensureSession()
no longer calls signInAnonymously() — anonymous access is gone.
EOF
)"
```

---

### Task 6: Logout chip on `HomePage`

**Files:**
- Modify: `src/pages/HomePage.tsx:1-33` (imports and the header block)

**Interfaces:**
- Consumes: `useAuthStore` (Task 1) — `user`, `signOut`.

- [ ] **Step 1: Add the `useAuthStore` import**

In `src/pages/HomePage.tsx`, change:

```tsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePresentationStore, type DeckSummary } from '@/store/presentationStore'
import { supabaseConfigured } from '@/lib/supabaseClient'
import { Button } from '@/components/ui/Button'
```

to:

```tsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePresentationStore, type DeckSummary } from '@/store/presentationStore'
import { useAuthStore } from '@/store/authStore'
import { supabaseConfigured } from '@/lib/supabaseClient'
import { Button } from '@/components/ui/Button'
```

- [ ] **Step 2: Read `user`/`signOut` and add the chip to the header**

Change:

```tsx
export function HomePage() {
  const navigate = useNavigate()
  const { listDecks, deleteDeck } = usePresentationStore()
  const [decks, setDecks] = useState<DeckSummary[]>([])
  const [loading, setLoading] = useState(true)
```

to:

```tsx
export function HomePage() {
  const navigate = useNavigate()
  const { listDecks, deleteDeck } = usePresentationStore()
  const user = useAuthStore((s) => s.user)
  const signOut = useAuthStore((s) => s.signOut)
  const [decks, setDecks] = useState<DeckSummary[]>([])
  const [loading, setLoading] = useState(true)
```

Change the header block:

```tsx
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-3xl font-semibold text-app-foreground">Your presentations</h1>
          <Button variant="primary" onClick={() => navigate('/new')}>
            + New presentation
          </Button>
        </div>
```

to:

```tsx
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-3xl font-semibold text-app-foreground">Your presentations</h1>
          <div className="flex items-center gap-3">
            {user && (
              <div className="flex items-center gap-2 text-xs text-app-muted">
                <span>{user.email}</span>
                <button
                  onClick={() => void signOut()}
                  className="cursor-pointer hover:text-app-foreground hover:underline"
                >
                  Log out
                </button>
              </div>
            )}
            <Button variant="primary" onClick={() => navigate('/new')}>
              + New presentation
            </Button>
          </div>
        </div>
```

- [ ] **Step 3: Verify it builds and lints clean**

Run: `npm run lint` and `npm run build`
Expected: both exit 0 with no errors.

- [ ] **Step 4: Manual verification**

With `npm run dev` running and logged in from Task 5's verification:
1. Visit `/`. Expected: your email and a "Log out" link appear next to "+ New presentation".
2. Click "Log out". Expected: redirected to `/login`.
3. Try visiting `/` directly again. Expected: still redirected to `/login` (session is really gone).

- [ ] **Step 5: Commit**

```bash
git add src/pages/HomePage.tsx
git commit -m "Add logout to HomePage"
```

---

### Task 7: Update `CLAUDE.md`

**Files:**
- Modify: `CLAUDE.md:21` (Environment bullet about anonymous sign-in)
- Modify: `CLAUDE.md:60-63` (Persistence section — add an Auth subsection)

**Interfaces:** None — documentation only.

- [ ] **Step 1: Replace the anonymous-sign-in bullet**

Find this line under `### Environment`:

```markdown
- Supabase anonymous sign-in must be enabled on the Supabase project (Auth → Sign In / Providers) for persistence to work — `ensureSession()` in `supabaseClient.ts` calls `signInAnonymously()` on first use so every browser gets a persistent `auth.uid()` with no login screen.
```

Replace it with:

```markdown
- Accounts are required: every route except `/login` and `/reset-password` is wrapped in `<RequireAuth>` (`src/components/auth/RequireAuth.tsx`), which redirects unauthenticated visitors to `/login`. There is no anonymous/guest mode. Auth state lives in `src/store/authStore.ts` (email/password via Supabase Auth, email confirmation required — toggle at Auth → Providers → Email → "Confirm email" in the Supabase dashboard). `ensureSession()` in `supabaseClient.ts` only waits for the client's session to finish hydrating from storage; it no longer creates a session itself.
```

- [ ] **Step 2: Add an Auth subsection after Persistence**

Find this section:

```markdown
### Persistence (Supabase)

`supabase/migrations/0001_init.sql` defines `presentations`, `cards`, and `themes` (the `themes` table is legacy/unused now that custom themes were removed — harmless to leave, not read from). `0002_add_visual_style.sql` adds `cards.visual_style` (`not null default 'structured'`) — run it against any project created before this field existed. RLS on every table is scoped to `owner_id = auth.uid()`, with `cards` checked via a join back to its parent `presentations` row. `store/presentationStore.ts` debounces text/theme field saves (`scheduleSave`, 500ms) but persists structural changes (card delete/reorder) immediately.

### Path alias
```

Replace it with:

```markdown
### Persistence (Supabase)

`supabase/migrations/0001_init.sql` defines `presentations`, `cards`, and `themes` (the `themes` table is legacy/unused now that custom themes were removed — harmless to leave, not read from). `0002_add_visual_style.sql` adds `cards.visual_style` (`not null default 'structured'`) — run it against any project created before this field existed. RLS on every table is scoped to `owner_id = auth.uid()`, with `cards` checked via a join back to its parent `presentations` row. `store/presentationStore.ts` debounces text/theme field saves (`scheduleSave`, 500ms) but persists structural changes (card delete/reorder) immediately.

### Auth

`src/store/authStore.ts` is a zustand store, initialized once at module load (subscribing to `supabase.auth.onAuthStateChange`), exposing `user`/`status` plus `signUp`/`signIn`/`signOut`/`resetPasswordForEmail`/`updatePassword`. `LoginPage.tsx` (route `/login`) handles login, signup, and forgot-password as one page via local mode state, rather than three separate routes. `ResetPasswordPage.tsx` (route `/reset-password`) is the landing page for the password-reset email link — Supabase's client auto-detects the recovery session from the URL. Decks created under the old anonymous-auth model (before this feature) are orphaned rows in Supabase, invisible to any real account under RLS — harmless to leave, or delete manually from the Supabase dashboard.

### Path alias
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "Document the account login/signup auth model in CLAUDE.md"
```

---

### Task 8: End-to-end manual verification

No new files — this task is a final walkthrough confirming every piece of the spec works together, including the parts (forgot password, login-after-logout) that couldn't be exercised until Tasks 5-6 landed.

- [ ] **Step 1: Confirm Supabase dashboard settings**

In the Supabase dashboard for this project:
1. Auth → Providers → Email → "Confirm email" is enabled.
2. Auth → URL Configuration → allowed redirect URLs includes `http://localhost:5173/*` (or specifically `http://localhost:5173/reset-password`).

- [ ] **Step 2: Full signup → confirm → login walkthrough**

With `npm run dev` running and a cleared browser session (Application tab → Clear site data):
1. Visit `/` → redirected to `/login`.
2. Switch to "Sign up", use a real email + a password ≥ 6 characters → see "Check your email to confirm your account, then log in."
3. Click the confirmation link in that email → app opens already logged in, lands on `/`.
4. Create a presentation (via `/new`, either AI-generated or "skip and start blank") → confirm it saves and appears back on `/`.

- [ ] **Step 3: Logout and log back in**

1. Click "Log out" on `/` → redirected to `/login`.
2. Switch to "Log in" mode (if not already), enter the same email/password → land back on `/` with the deck from Step 2 still listed (proves the account, not a new session, owns that deck).

- [ ] **Step 4: Forgot password walkthrough**

1. From `/login`, click "Forgot password?", enter the account's email, submit → see "If an account exists for that email, we've sent a reset link."
2. Open the reset email, click the link → lands on `/reset-password`.
3. Enter a new password (≥ 6 chars) in both fields, submit → redirected to `/`, still logged in.
4. Log out, then log back in using the *new* password to confirm it actually took effect.

- [ ] **Step 5: Confirm the gate holds for every protected route**

While logged out, try navigating directly to `/new`, `/deck/<any-id>`, and `/deck/<any-id>/present` (any id is fine — it'll redirect before ever reading it). Expected: every one redirects to `/login`.

No commit for this task — it's verification only. If any step fails, fix the relevant earlier task's code and re-run this checklist from the point of failure.
