import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from './settingsRow'

/*
  Supabase and the auth store are mocked: what is checked is which calls are made, what
  a missing table or a failed write becomes, and that one account's voice never survives
  into the next.
*/

let selectResult: { data: unknown; error: { code?: string; message?: string } | null } = { data: null, error: null }
let upsertResult: { error: { code?: string; message?: string } | null } = { error: null }
const upserts: unknown[] = []
let userId: string | null = 'user-1'
// An array, not a `let ... | null`: TypeScript narrows a closure-assigned `let` to `null` at the use site.
const authListeners: Array<(state: { user: { id: string } | null }) => void> = []
const switchUserTo = (id: string) => authListeners.forEach((fn) => fn({ user: { id } }))
let holdSelect: Promise<void> | null = null

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (holdSelect) await holdSelect
            return selectResult
          },
        }),
      }),
      upsert: async (row: unknown) => {
        upserts.push(row)
        return upsertResult
      },
    }),
  },
}))

vi.mock('@/store/authStore', () => ({
  useAuthStore: {
    getState: () => ({ user: userId ? { id: userId } : null }),
    subscribe: (fn: (state: { user: { id: string } | null }) => void) => {
      authListeners.push(fn)
      return () => {}
    },
  },
}))

const { useVoiceStore } = await import('./voiceStore')

const row = { voice_id: 'v1', voice_name: 'Skylar', voice_source: 'premade', language: 'fr', speed: 1.2, volume: 1, emotion: null }

beforeEach(() => {
  selectResult = { data: null, error: null }
  upsertResult = { error: null }
  upserts.length = 0
  userId = 'user-1'
  holdSelect = null
  useVoiceStore.getState().reset()
})

describe('load', () => {
  it('reads the saved voice', async () => {
    selectResult = { data: row, error: null }
    await useVoiceStore.getState().load()
    const s = useVoiceStore.getState()
    expect(s.settings).toMatchObject({ voiceId: 'v1', voiceName: 'Skylar', language: 'fr', speed: 1.2 })
    expect(s.loaded).toBe(true)
    expect(s.warning).toBeNull()
  })

  it('uses the defaults for a user who has not saved one', async () => {
    await useVoiceStore.getState().load()
    expect(useVoiceStore.getState().settings).toEqual(DEFAULT_SETTINGS)
    expect(useVoiceStore.getState().loaded).toBe(true)
  })

  // 42P01 = undefined_table; PGRST205 = PostgREST's "table not in the schema cache".
  it.each(['42P01', 'PGRST205'])('says to run migration 0014 when the table is missing (%s)', async (code) => {
    selectResult = { data: null, error: { code, message: 'no table' } }
    await useVoiceStore.getState().load()
    expect(useVoiceStore.getState().warning).toContain('0014')
    expect(useVoiceStore.getState().loaded).toBe(true)
  })

  it('warns, and stays unloaded so the next open retries, on any other failure', async () => {
    selectResult = { data: null, error: { code: '500', message: 'boom' } }
    await useVoiceStore.getState().load()
    expect(useVoiceStore.getState().warning).toContain('Could not load')
    expect(useVoiceStore.getState().loaded).toBe(false)
  })
})

describe('save', () => {
  const next = { ...DEFAULT_SETTINGS, voiceId: 'v9', voiceName: 'Me', voiceSource: 'cloned' as const, speed: 1.1 }

  it('upserts the row for the signed-in user and keeps the result', async () => {
    expect(await useVoiceStore.getState().save(next)).toBe(true)
    expect(upserts[0]).toMatchObject({ user_id: 'user-1', voice_id: 'v9', voice_source: 'cloned', speed: 1.1 })
    expect(useVoiceStore.getState().settings.voiceId).toBe('v9')
    expect(useVoiceStore.getState().status).toBe('idle')
  })

  it('keeps the voice for the session, with a warning, when the table is missing', async () => {
    upsertResult = { error: { code: '42P01', message: 'no table' } }
    expect(await useVoiceStore.getState().save(next)).toBe(true)
    expect(useVoiceStore.getState().settings.voiceId).toBe('v9')
    expect(useVoiceStore.getState().warning).toContain('0014')
  })

  it('reports another failure and keeps the old settings', async () => {
    upsertResult = { error: { code: '500', message: 'boom' } }
    expect(await useVoiceStore.getState().save(next)).toBe(false)
    expect(useVoiceStore.getState().error).toContain('could not be saved')
    expect(useVoiceStore.getState().settings.voiceId).toBeNull()
  })

  it('refuses when nobody is signed in', async () => {
    userId = null
    expect(await useVoiceStore.getState().save(next)).toBe(false)
    expect(upserts).toHaveLength(0)
  })
})

describe('when the signed-in user changes', () => {
  // One account's voice must never show for the next on a shared browser.
  it("drops the previous user's voice", async () => {
    selectResult = { data: row, error: null }
    await useVoiceStore.getState().load()
    expect(useVoiceStore.getState().settings.voiceId).toBe('v1')

    switchUserTo('user-2')

    expect(useVoiceStore.getState().settings).toEqual(DEFAULT_SETTINGS)
    expect(useVoiceStore.getState().loaded).toBe(false)
  })

  it('discards a load that finishes after the switch', async () => {
    selectResult = { data: row, error: null }
    let release: () => void = () => {}
    holdSelect = new Promise<void>((resolve) => {
      release = resolve
    })
    const pending = useVoiceStore.getState().load()

    switchUserTo('user-3')
    release()
    await pending

    expect(useVoiceStore.getState().settings).toEqual(DEFAULT_SETTINGS)
    expect(useVoiceStore.getState().loaded).toBe(false)
  })
})
