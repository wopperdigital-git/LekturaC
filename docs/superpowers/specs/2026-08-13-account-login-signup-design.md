# Account login & signup — design

## Problem

Every browser currently gets a persistent anonymous Supabase session created silently on first use (`ensureSession()` in `supabaseClient.ts` calls `signInAnonymously()`), with no login screen at all. Decks are scoped to that anonymous `auth.uid()` via RLS. There is no way for a user to access their decks from a second device/browser, and no real identity behind the data.

## Goal

Replace anonymous auth entirely with a required email/password login gate: nobody can reach the app's pages without a real account. Add signup (with required email verification), login, logout, and password reset.

## Auth model

- Anonymous sign-in is removed. `ensureSession()` in `src/lib/supabaseClient.ts` no longer calls `supabase.auth.signInAnonymously()`; it becomes a thin "wait for the Supabase client to finish hydrating any existing session from storage" check (still `await supabase.auth.getSession()`, just without the fallback anonymous sign-in). Its 8 existing call sites in `src/store/presentationStore.ts` are unchanged — by the time those run, the route guard below has already guaranteed a real session exists.
- RLS is untouched (`owner_id = auth.uid()`) — it works identically for real users as it did for anonymous ones.
- Existing decks created under today's anonymous test sessions are left as orphaned rows in Supabase (invisible to any real account under RLS, harmless to leave, can be deleted later from the Supabase dashboard if desired). No migration code.

## New state: `authStore.ts`

New zustand store at `src/store/authStore.ts`, not persisted client-side (Supabase's own client already persists the session in `localStorage`):

```ts
interface AuthState {
  user: User | null // from @supabase/supabase-js
  status: 'loading' | 'authenticated' | 'unauthenticated'
  signUp: (email: string, password: string) => Promise<{ error: string | null; needsVerification: boolean }>
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  resetPasswordForEmail: (email: string) => Promise<void>
  updatePassword: (newPassword: string) => Promise<{ error: string | null }>
}
```

- Initializes by calling `supabase.auth.getSession()` once, then subscribes to `supabase.auth.onAuthStateChange` for the lifetime of the app, keeping `user`/`status` in sync (covers login, logout, and the session Supabase creates automatically when a user clicks the email-confirmation or password-reset link).
- `signUp` calls `supabase.auth.signUp({ email, password })`. Because email confirmation is required, a successful call returns a user but no session — the store reports `needsVerification: true` so the UI can show a "check your email" message instead of navigating anywhere.
- `resetPasswordForEmail` calls `supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` })`. The UI always shows a generic success message regardless of the result, to avoid leaking which emails have accounts.

## Routing & route guard

- `src/components/auth/RequireAuth.tsx`: reads `authStore`. Renders a loading state while `status === 'loading'`, redirects to `/login` (preserving the attempted path is not needed — post-login always lands on `/`) when `'unauthenticated'`, renders `children` when `'authenticated'`.
- `App.tsx`: `/login` and `/reset-password` become the only public routes. `/`, `/new`, `/deck/:id`, and `/deck/:id/present` are each wrapped in `<RequireAuth>`.
- `LoginPage` itself redirects to `/` if `authStore.status === 'authenticated'` on mount (covers a logged-in user manually navigating back to `/login`). `ResetPasswordPage` doesn't need this check — landing there without a valid recovery link just means `updatePassword` will fail with Supabase's own "session missing" error, which is surfaced inline like any other error.

## Pages

**`src/pages/LoginPage.tsx`** (route `/login`)
- Single page, local state toggles between `'login'` and `'signup'` modes via a text link ("Don't have an account? Sign up" / "Already have an account? Log in"), matching the lightweight single-page feel of `CreatePage`.
- Visual style: centered white card on `bg-app-canvas`, reusing existing `Input`, `Label`, `Button` primitives — same pattern as `SettingsModal`/`CreatePage`.
- Login mode: email + password fields, submit calls `authStore.signIn`. On success, `RequireAuth`'s redirect naturally takes over once `authStore.status` flips to `'authenticated'`. On error, show Supabase's own error message inline (e.g. "Invalid login credentials", "Email not confirmed").
- Signup mode: email + password fields, submit calls `authStore.signUp`. On `needsVerification: true`, replace the form with a "Check your email to confirm your account, then log in" message. On error, show Supabase's own error message inline (e.g. duplicate email). No client-side password-strength validation beyond what Supabase enforces (6-char minimum) — avoids duplicating/drifting from Supabase's own rules.
- A "Forgot password?" link (visible in login mode) reveals an email-only sub-form; submitting calls `authStore.resetPasswordForEmail` and always shows "If an account exists for that email, we've sent a reset link."

**`src/pages/ResetPasswordPage.tsx`** (route `/reset-password`)
- Landing page for the link in the reset email. Supabase's client auto-detects the recovery session from the URL (`detectSessionInUrl`, on by default).
- Form: new password + confirm, calls `authStore.updatePassword`, then navigates to `/` on success. Shows Supabase's error message inline on failure.

## Logout

A small account chip (the user's email + a "Log out" button, calling `authStore.signOut`) is added to `HomePage.tsx`'s header, next to "+ New presentation" — `HomePage` is the natural hub since the editor's `TopBar` already links back Home. No changes to `TopBar.tsx`.

## Error handling summary

- All Supabase auth errors are surfaced verbatim inline on the relevant form (no custom error-message mapping/translation layer).
- Password reset always shows a generic success message regardless of whether the email is registered (anti-enumeration).
- If `supabaseConfigured` is `false` (no `.env` Supabase keys), `/login` shows an explanatory message ("Supabase isn't configured, so accounts aren't available — add VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY to .env") instead of a broken form. There is no anonymous/local-only fallback anymore, since the whole point of this feature is a required real-account gate.

## Testing

No new automated tests. Matches this repo's existing convention (`CLAUDE.md`): Vitest coverage is intentionally narrow, limited to pure, high-value logic (the layout classifier, theme-token helpers). Auth flows here are entirely network/Supabase-dependent, not pure functions, so they're out of scope for unit testing and will be verified manually in the browser.

## Manual setup required in the Supabase dashboard (outside this codebase)

1. Auth → Providers → Email → confirm "Confirm email" is enabled (required for the email-verification step this design relies on).
2. Auth → URL Configuration → add `http://localhost:5173/reset-password` (and the production URL, once one exists) to the allowed redirect URLs list — required for `resetPasswordForEmail`'s `redirectTo` to work.
