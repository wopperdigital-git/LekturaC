import { create } from 'zustand'
import { supabase } from '@/lib/supabaseClient'
import { useAuthStore } from '@/store/authStore'
import { DEFAULT_SETTINGS, rowFromSettings, settingsFromRow, type VoiceSettings } from './settingsRow'

/*
  The signed-in user's chosen voice, kept in `voice_settings` (migration 0014).

  Loaded when the Clone voice modal opens, not at startup: nothing else needs it. A
  project without the migration still works: the voice lasts for the session and the
  modal says how to make it stick.

  Cleared whenever the signed-in user changes, so one account's voice is never shown to
  the next on a shared browser (the same reason `briefDrafts` namespaces its key). A load
  still in flight when the user changes is discarded by the `request` counter.
*/

/** 42P01: Postgres "undefined_table". PGRST205: PostgREST "table not in the schema cache". */
function isMissingTable(error: { code?: string } | null): boolean {
  return error?.code === '42P01' || error?.code === 'PGRST205'
}

const MIGRATION_WARNING = 'Run migration 0014 in Supabase to save your voice. It will work for this session only.'

interface VoiceState {
  settings: VoiceSettings
  loaded: boolean
  status: 'idle' | 'loading' | 'saving'
  /** A problem that does not stop the modal working (missing migration, failed read). */
  warning: string | null
  /** A failed save. */
  error: string | null
  /** Always resolves; failures land in `warning`. */
  load: () => Promise<void>
  /** Resolves true when the voice is in effect (saved, or kept for the session). */
  save: (next: VoiceSettings) => Promise<boolean>
  reset: () => void
}

let request = 0

const EMPTY = {
  settings: { ...DEFAULT_SETTINGS },
  loaded: false,
  status: 'idle' as const,
  warning: null,
  error: null,
}

export const useVoiceStore = create<VoiceState>((set) => ({
  ...EMPTY,

  async load() {
    const uid = useAuthStore.getState().user?.id
    if (!supabase || !uid) return
    const mine = ++request
    set({ status: 'loading', warning: null })

    const { data, error } = await supabase.from('voice_settings').select('*').eq('user_id', uid).maybeSingle()
    // The user changed (or reset ran) while this was in flight: it is not theirs any more.
    if (mine !== request) return

    if (error) {
      if (isMissingTable(error)) set({ status: 'idle', loaded: true, warning: MIGRATION_WARNING })
      else set({ status: 'idle', warning: 'Could not load your saved voice.' })
      return
    }
    set({ status: 'idle', loaded: true, settings: settingsFromRow(data) })
  },

  async save(next) {
    const uid = useAuthStore.getState().user?.id
    if (!supabase || !uid) {
      set({ error: 'Sign in to save your voice.' })
      return false
    }
    const mine = request
    set({ status: 'saving', error: null })

    const { error } = await supabase
      .from('voice_settings')
      .upsert({ user_id: uid, ...rowFromSettings(next), updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    if (mine !== request) return false

    if (error && !isMissingTable(error)) {
      set({ status: 'idle', error: 'Your voice could not be saved. Try again.' })
      return false
    }
    // Saved, or the table is missing and the choice is kept for this session.
    set({ status: 'idle', settings: next, warning: error ? MIGRATION_WARNING : null })
    return true
  },

  reset() {
    request++
    set({ ...EMPTY, settings: { ...DEFAULT_SETTINGS } })
  },
}))

let lastUserId = useAuthStore.getState().user?.id ?? null
useAuthStore.subscribe((state) => {
  const uid = state.user?.id ?? null
  if (uid === lastUserId) return
  lastUserId = uid
  useVoiceStore.getState().reset()
})
