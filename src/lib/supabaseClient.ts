import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabaseConfigured = Boolean(url && anonKey)

export const supabase = supabaseConfigured
  ? createClient(url, anonKey)
  : null

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
