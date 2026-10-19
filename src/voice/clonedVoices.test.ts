import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS, type VoiceSettings } from './settingsRow'
import type { VoiceSummary } from './cartesia'
import {
  cloneOwnVoice,
  deleteAllOwnVoices,
  deleteOwnVoice,
  keepOwnVoice,
  ownClones,
  readOwnVoices,
  type ClonedVoicePorts,
  type OwnVoices,
} from './clonedVoices'

/*
  Every user of a deployment shares one Cartesia account, so "the account's voices" are
  everybody's. These rules are what keeps one teacher's recorded voice out of another's
  list and videos: pure, or over injected ports, so they run without Supabase or Cartesia.
*/

const voice = (id: string): VoiceSummary => ({ id, name: `Voice ${id}`, tagline: '', description: '', gender: '', language: 'en' })
const known = (...ids: string[]): OwnVoices => ({ kind: 'known', ids: new Set(ids) })

function ports(over: Partial<ClonedVoicePorts> = {}): ClonedVoicePorts {
  return {
    list: vi.fn(async () => ({ data: [{ voice_id: 'mine-1' }], error: null })),
    add: vi.fn(async () => ({ error: null })),
    forget: vi.fn(async () => ({ error: null })),
    ...over,
  }
}

describe('readOwnVoices', () => {
  it('reads the ids of the voices this user cloned', async () => {
    const own = await readOwnVoices(ports({ list: async () => ({ data: [{ voice_id: 'a' }, { voice_id: 'b' }, { nope: 1 }], error: null }) }))
    expect(own).toEqual(known('a', 'b'))
  })

  it('says when the table is missing, and when the read failed', async () => {
    expect(await readOwnVoices(ports({ list: async () => ({ data: null, error: { code: '42P01' } }) }))).toEqual({ kind: 'missing' })
    expect(await readOwnVoices(ports({ list: async () => ({ data: null, error: { code: 'PGRST205' } }) }))).toEqual({ kind: 'missing' })
    expect(await readOwnVoices(ports({ list: async () => ({ data: null, error: { code: '500' } }) }))).toEqual({ kind: 'failed' })
    expect(await readOwnVoices(ports({ list: async () => Promise.reject(new TypeError('offline')) }))).toEqual({ kind: 'failed' })
  })
})

describe('ownClones', () => {
  it("keeps only this user's voices out of the account's", () => {
    expect(ownClones([voice('a'), voice('b'), voice('c')], known('a', 'c')).map((v) => v.id)).toEqual(['a', 'c'])
  })

  // Not knowing whose a voice is must never show it: it may be someone else's.
  it('shows none while ownership is unknown', () => {
    expect(ownClones([voice('a')], { kind: 'missing' })).toEqual([])
    expect(ownClones([voice('a')], { kind: 'failed' })).toEqual([])
  })
})

describe('keepOwnVoice', () => {
  const cloned = (id: string): VoiceSettings => ({ ...DEFAULT_SETTINGS, voiceId: id, voiceName: 'X', voiceSource: 'cloned', speed: 1.2 })

  it("keeps a cloned voice that is this user's, and any premade voice", () => {
    expect(keepOwnVoice(cloned('a'), known('a'))).toEqual(cloned('a'))
    const premade: VoiceSettings = { ...DEFAULT_SETTINGS, voiceId: 'p', voiceName: 'P', voiceSource: 'premade' }
    expect(keepOwnVoice(premade, known())).toEqual(premade)
    expect(keepOwnVoice(premade, { kind: 'failed' })).toEqual(premade)
  })

  // A pick saved before voices had owners can be another teacher's: it is dropped, not used.
  it("drops a cloned voice that isn't known to be this user's, keeping the other settings", () => {
    for (const own of [known('b'), { kind: 'missing' } as const, { kind: 'failed' } as const]) {
      expect(keepOwnVoice(cloned('a'), own)).toEqual({ ...cloned('a'), voiceId: null, voiceName: null, voiceSource: null })
    }
  })
})

describe('cloneOwnVoice', () => {
  it('clones, then records the new voice as this user’s', async () => {
    const p = ports()
    const discard = vi.fn(async () => {})
    await expect(cloneOwnVoice({ clone: async () => voice('new'), ports: p, discard })).resolves.toEqual(voice('new'))
    expect(p.add).toHaveBeenCalledWith('new', 'Voice new')
    expect(discard).not.toHaveBeenCalled()
  })

  // A voice nobody owns would be in the account with no one able to see or delete it in the app.
  it("deletes the new voice again when it can't be recorded as this user's", async () => {
    const p = ports({ add: async () => ({ error: { code: '23505' } }) })
    const discard = vi.fn(async () => {})
    await expect(cloneOwnVoice({ clone: async () => voice('new'), ports: p, discard })).rejects.toThrow(/deleted again/)
    expect(discard).toHaveBeenCalledWith('new')
  })

  it('still reports the failure when deleting it again fails too', async () => {
    const p = ports({ add: async () => ({ error: { code: '500' } }) })
    const discard = vi.fn(async () => Promise.reject(new Error('down')))
    await expect(cloneOwnVoice({ clone: async () => voice('new'), ports: p, discard })).rejects.toThrow(/couldn't be saved/)
  })

  it('records nothing when the clone itself fails', async () => {
    const p = ports()
    await expect(cloneOwnVoice({ clone: async () => Promise.reject(new Error('400')), ports: p, discard: vi.fn() })).rejects.toThrow('400')
    expect(p.add).not.toHaveBeenCalled()
  })
})

describe('deleteOwnVoice', () => {
  it('deletes from Cartesia first, then forgets it', async () => {
    const order: string[] = []
    const p = ports({ forget: vi.fn(async () => (order.push('forget'), { error: null })) })
    await deleteOwnVoice('a', { remove: async () => void order.push('remove'), ports: p })
    expect(order).toEqual(['remove', 'forget'])
    expect(p.forget).toHaveBeenCalledWith('a')
  })

  // Forgetting first would leave the voice in Cartesia with nothing in the app pointing at it.
  it('keeps the record when Cartesia refuses, so it can be tried again', async () => {
    const p = ports()
    await expect(deleteOwnVoice('a', { remove: async () => Promise.reject(new Error('busy')), ports: p })).rejects.toThrow('busy')
    expect(p.forget).not.toHaveBeenCalled()
  })

  it('counts as deleted when only forgetting it fails: the voice is gone either way', async () => {
    const p = ports({ forget: async () => ({ error: { code: '500' } }) })
    await expect(deleteOwnVoice('a', { remove: async () => {}, ports: p })).resolves.toBeUndefined()
  })
})

describe('deleteAllOwnVoices', () => {
  it("deletes every one of this user's voices from Cartesia", async () => {
    const remove = vi.fn(async (_id: string) => {})
    const result = await deleteAllOwnVoices({ own: async () => known('a', 'b'), remove, configured: true })
    expect(result).toEqual({ error: null })
    expect(remove.mock.calls.map((c) => c[0])).toEqual(['a', 'b'])
  })

  // The account must not go while its voices stay: the dialog promised they go together.
  it('stops the account deletion when a voice could not be deleted, after trying them all', async () => {
    const remove = vi.fn(async (id: string) => (id === 'a' ? Promise.reject(new Error('busy')) : undefined))
    const result = await deleteAllOwnVoices({ own: async () => known('a', 'b'), remove, configured: true })
    expect(result.error).toMatch(/wasn't deleted/)
    expect(remove).toHaveBeenCalledTimes(2)
  })

  it("stops it when the voices couldn't be read", async () => {
    const result = await deleteAllOwnVoices({ own: async () => ({ kind: 'failed' }), remove: vi.fn(), configured: true })
    expect(result.error).toMatch(/wasn't deleted/)
  })

  // Before migration 0017 no voice has an owner, and without a key none can be reached.
  it('has nothing to do without the table or without a voice key', async () => {
    const remove = vi.fn()
    expect(await deleteAllOwnVoices({ own: async () => ({ kind: 'missing' }), remove, configured: true })).toEqual({ error: null })
    expect(await deleteAllOwnVoices({ own: async () => known('a'), remove, configured: false })).toEqual({ error: null })
    expect(remove).not.toHaveBeenCalled()
  })
})
