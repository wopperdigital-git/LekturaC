import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabaseConfigured = Boolean(url && anonKey)

export const supabase = supabaseConfigured
  ? createClient(url, anonKey)
  : null

let ensureSessionPromise: Promise<void> | null = null

/**
 * Every browser gets a persistent anonymous auth.uid() so decks are scoped
 * per-user via RLS with no login screen. Anonymous sign-ins must be enabled
 * in the Supabase project's Auth settings.
 */
export function ensureSession(): Promise<void> {
  if (!supabase) return Promise.resolve()
  if (!ensureSessionPromise) {
    ensureSessionPromise = (async () => {
      const { data } = await supabase.auth.getSession()
      if (!data.session) {
        const { error } = await supabase.auth.signInAnonymously()
        if (error) throw error
      }
    })()
  }
  return ensureSessionPromise
}
