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
  /**
   * `true` when `profile` is the General fallback because the real profile
   * couldn't be read (see `resolveProfile`), rather than because the account
   * genuinely is General. Distinguishing the two matters: a teacher hitting a
   * transient read failure must not silently lose the Classroom rail, or be
   * shown "General" as the permanent account type in the settings modal.
   */
  profileDegraded: boolean
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
  updateDisplayName: (displayName: string) => Promise<{ error: string | null }>
  /**
   * Re-reads the profile without touching `status`, so the caller's page is not
   * unmounted. Needed because the database can change the account type behind
   * the client's back: `join_class` promotes a General account to Student, and
   * until this runs the rail still offers the General one.
   */
  refreshProfile: () => Promise<void>
  /** Irreversible. Deletes the account, its decks and (for a teacher) its classes. */
  deleteAccount: () => Promise<{ error: string | null }>
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  profile: null,
  profileDegraded: false,
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
    set({ profileDegraded: false })
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

  async updateDisplayName(displayName) {
    const user = get().user
    if (!supabase || !user) return { error: 'Log in to change your name.' }
    // `role` is pinned by the guard trigger (migration 0010) and `email` by
    // 0009, so this is the only column of a profile the account can move.
    const { data, error } = await supabase
      .from('profiles')
      .update({ display_name: displayName.trim() })
      .eq('id', user.id)
      .select('role, display_name')
      .maybeSingle()
    if (error) return { error: error.message }
    if (!data) {
      return {
        error:
          "Your account profile isn't set up yet — the classroom database migration (0009) may not have been applied.",
      }
    }
    set({ profile: resolveProfile(data, null).profile, profileDegraded: false })
    return { error: null }
  },

  async refreshProfile() {
    const user = get().user
    if (!supabase || !user) return
    const { profile, degraded } = await readProfile(user.id)
    // A failed re-read must not downgrade a known-good profile to the General
    // fallback: nothing here is a reason to take the Classroom rail away.
    if (degraded) return
    set({ profile, profileDegraded: false })
  },

  async deleteAccount() {
    if (!supabase) return { error: 'Supabase is not configured.' }
    // Server-side by necessity: the anon key cannot delete an auth.users row.
    // The RPC takes no argument and reads auth.uid(), so it can only ever
    // delete the caller's own account.
    const { error } = await supabase.rpc('delete_own_account')
    if (error) return { error: error.message }
    // The user row is gone, but this tab still holds its tokens; without an
    // explicit sign-out the app stays on a dead session until a request fails.
    await supabase.auth.signOut()
    return { error: null }
  },
}))

// A leftover anonymous session (from before this login feature existed)
// must not count as authenticated — anonymous auth is fully removed.
function realUser(session: Session | null): User | null {
  return session && !session.user.is_anonymous ? session.user : null
}

let profileRequest = 0

async function readProfile(userId: string) {
  // supabase is narrowed by both call sites before this runs.
  const { data, error } = await supabase!
    .from('profiles')
    .select('role, display_name')
    .eq('id', userId)
    .maybeSingle()
  return resolveProfile(data, error)
}

/*
  Resolves a session into `user` + `profile` + `status`.

  `status` stays 'loading' until the profile arrives, so RequireAuth never
  renders a page before the account type is known. The one exception is
  load-bearing: Supabase re-emits the session on every token refresh, and
  flipping a signed-in user back to 'loading' then would unmount whatever page
  they are on — the editor included. A refresh for the same user with a
  profile already in hand only swaps the `user` object — *unless* that profile
  is the General fallback from a failed read (`profileDegraded`), in which
  case a transient error at load would otherwise stick as General for the rest
  of the session (a teacher losing the Classroom rail, or the settings modal
  reporting General as their permanent account type). That
  case still swaps `user` immediately — a token refresh is not itself a reason
  to block the page — but also kicks off a background re-read that does NOT
  touch `status`, so it can't unmount the page it's trying to fix. If that
  re-read comes back clean it replaces the fallback profile and clears
  `profileDegraded`; if it's still unreadable, state is left alone and nothing
  is logged again, since this retry runs on every token refresh and would
  otherwise spam the console for the lifetime of the session.

  `profileRequest` discards a read that a newer session has overtaken, so a
  fast sign-out/sign-in — or an in-flight background retry outlived by a real
  reload — cannot apply a stale profile.
*/
async function applySession(session: Session | null) {
  const user = realUser(session)
  if (!user || !supabase) {
    profileRequest++
    useAuthStore.setState({ user: null, profile: null, profileDegraded: false, status: 'unauthenticated' })
    return
  }

  const current = useAuthStore.getState()
  if (current.user?.id === user.id && current.profile) {
    useAuthStore.setState({ user })
    if (current.profileDegraded) {
      const request = ++profileRequest
      const { profile, degraded } = await readProfile(user.id)
      if (request !== profileRequest) return
      if (!degraded) useAuthStore.setState({ profile, profileDegraded: false })
      // Still degraded: leave status/profile as they are and stay quiet.
    }
    return
  }

  const request = ++profileRequest
  useAuthStore.setState({ user, profile: null, status: 'loading' })
  const { profile, degraded } = await readProfile(user.id)
  if (request !== profileRequest) return

  if (degraded) {
    console.warn('[auth] No usable profile for this account; treating it as General.')
  }
  useAuthStore.setState({ profile, profileDegraded: degraded, status: 'authenticated' })
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
