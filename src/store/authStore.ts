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
