import { create } from 'zustand'
import type { Session, User } from '@supabase/supabase-js'
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

// A leftover anonymous session (from before this login feature existed)
// must not count as authenticated — anonymous auth is fully removed.
function resolveAuthState(session: Session | null) {
  const isRealUser = !!session && !session.user.is_anonymous
  return {
    user: isRealUser ? session.user : null,
    status: isRealUser ? ('authenticated' as const) : ('unauthenticated' as const),
  }
}

// Runs once at module load (this store is an app-wide singleton, same as
// usePresentationStore) — hydrates the current session, then keeps `user`/
// `status` live for login, logout, and the session Supabase creates
// automatically when a user clicks an email-confirmation or
// password-reset link.
if (supabaseConfigured && supabase) {
  void supabase.auth.getSession().then(({ data }) => {
    useAuthStore.setState(resolveAuthState(data.session))
  })
  supabase.auth.onAuthStateChange((_event, session) => {
    useAuthStore.setState(resolveAuthState(session))
  })
}
