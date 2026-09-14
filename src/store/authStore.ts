import { create } from 'zustand'
import type { Session, User } from '@supabase/supabase-js'
import { supabase, supabaseConfigured } from '@/lib/supabaseClient'
import type { Role } from '@/classroom/roles'
import { resolveProfile, type AccountProfile } from './profile'

export interface SignUpDetails {
  role: Role
  displayName: string
}

interface AuthState {
  user: User | null
  /** The account's type and name. `null` until it has resolved, and while signed out. */
  profile: AccountProfile | null
  status: 'loading' | 'authenticated' | 'unauthenticated'
  signUp: (
    email: string,
    password: string,
    details: SignUpDetails,
  ) => Promise<{ error: string | null; needsVerification: boolean }>
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  resetPasswordForEmail: (email: string) => Promise<void>
  updatePassword: (newPassword: string) => Promise<{ error: string | null }>
  updateRole: (role: Role) => Promise<{ error: string | null }>
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  profile: null,
  status: supabaseConfigured ? 'loading' : 'unauthenticated',

  async signUp(email, password, details) {
    if (!supabase) return { error: 'Supabase is not configured.', needsVerification: false }
    // The profiles insert trigger (migration 0009) reads these two keys.
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { role: details.role, display_name: details.displayName.trim() } },
    })
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

  async updateRole(role) {
    const user = get().user
    if (!supabase || !user) return { error: 'Log in to change your account type.' }
    const { data, error } = await supabase
      .from('profiles')
      .update({ role })
      .eq('id', user.id)
      .select('role, display_name')
      .maybeSingle()
    // The guard trigger's refusal ("Delete or hand off your classes…") is
    // already a sentence the user can act on, so it is shown as-is.
    if (error) return { error: error.message }
    if (!data) {
      return {
        error:
          "Your account profile isn't set up yet — the classroom database migration (0009) may not have been applied.",
      }
    }
    set({ profile: resolveProfile(data, null).profile })
    return { error: null }
  },
}))

// A leftover anonymous session (from before this login feature existed)
// must not count as authenticated — anonymous auth is fully removed.
function realUser(session: Session | null): User | null {
  return session && !session.user.is_anonymous ? session.user : null
}

let profileRequest = 0

/*
  Resolves a session into `user` + `profile` + `status`.

  `status` stays 'loading' until the profile arrives, so RequireAuth never
  renders a page before the account type is known. The one exception is
  load-bearing: Supabase re-emits the session on every token refresh, and
  flipping a signed-in user back to 'loading' then would unmount whatever page
  they are on — the editor included. A refresh for the same user with a profile
  already in hand only swaps the `user` object.

  `profileRequest` discards a read that a newer session has overtaken, so a
  fast sign-out/sign-in cannot apply the previous account's type.
*/
async function applySession(session: Session | null) {
  const user = realUser(session)
  if (!user || !supabase) {
    profileRequest++
    useAuthStore.setState({ user: null, profile: null, status: 'unauthenticated' })
    return
  }

  const current = useAuthStore.getState()
  if (current.user?.id === user.id && current.profile) {
    useAuthStore.setState({ user })
    return
  }

  const request = ++profileRequest
  useAuthStore.setState({ user, profile: null, status: 'loading' })
  const { data, error } = await supabase
    .from('profiles')
    .select('role, display_name')
    .eq('id', user.id)
    .maybeSingle()
  if (request !== profileRequest) return

  const { profile, degraded } = resolveProfile(data, error)
  if (degraded) {
    console.warn('[auth] No usable profile for this account; treating it as General.', error ?? data)
  }
  useAuthStore.setState({ profile, status: 'authenticated' })
}

// Runs once at module load (this store is an app-wide singleton, same as
// usePresentationStore) — hydrates the current session, then keeps state live
// for login, logout, and the session Supabase creates when a user clicks an
// email-confirmation or password-reset link.
if (supabaseConfigured && supabase) {
  void supabase.auth.getSession().then(({ data }) => applySession(data.session))
  supabase.auth.onAuthStateChange((_event, session) => {
    // Deferred: Supabase documents that awaiting another client call inside
    // this callback can deadlock the auth lock.
    setTimeout(() => void applySession(session), 0)
  })
}
