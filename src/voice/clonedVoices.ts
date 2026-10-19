import type { SupabaseClient } from '@supabase/supabase-js'
import type { VoiceSummary } from './cartesia'
import type { VoiceSettings } from './settingsRow'

/*
  Whose cloned voice is whose (migration 0017, `cloned_voices`, owner-only).

  Every user of a deployment shares one Cartesia account (the key is the site's), so
  Cartesia's "your voices" are everybody's: without this, a teacher's recorded voice was
  listed to every other user, who could narrate a video with it. The app now records the
  owner when a voice is cloned and shows each user only their own.

  The rules fail closed: a voice whose owner is unknown (no table, a failed read, a voice
  cloned before 0017) is shown to nobody and used by nobody. The key in the bundle still
  lets someone technical list every voice straight from Cartesia; only a server in between
  closes that. Pure, or over injected ports, so it is tested without Supabase or Cartesia.
*/

type DbError = { code?: string } | null

export interface ClonedVoicePorts {
  /** The `voice_id`s of this user's rows (RLS limits the read to them). */
  list: () => Promise<{ data: unknown; error: DbError }>
  add: (voiceId: string, name: string) => Promise<{ error: DbError }>
  forget: (voiceId: string) => Promise<{ error: DbError }>
}

export type OwnVoices = { kind: 'known'; ids: ReadonlySet<string> } | { kind: 'missing' } | { kind: 'failed' }

/** 42P01: Postgres "undefined_table". PGRST205: PostgREST "table not in the schema cache". */
function isMissingTable(error: DbError): boolean {
  return error?.code === '42P01' || error?.code === 'PGRST205'
}

export const CLONES_MIGRATION_MESSAGE = 'Run migration 0017 in Supabase to record your own voice.'

export async function readOwnVoices(ports: ClonedVoicePorts): Promise<OwnVoices> {
  try {
    const { data, error } = await ports.list()
    if (error) return isMissingTable(error) ? { kind: 'missing' } : { kind: 'failed' }
    const rows = Array.isArray(data) ? (data as unknown[]) : []
    const ids = rows.flatMap((r) => {
      const id = typeof r === 'object' && r !== null ? (r as { voice_id?: unknown }).voice_id : undefined
      return typeof id === 'string' && id !== '' ? [id] : []
    })
    return { kind: 'known', ids: new Set(ids) }
  } catch {
    return { kind: 'failed' }
  }
}

/** The account's cloned voices that are this user's; none while that is unknown. */
export function ownClones(voices: VoiceSummary[], own: OwnVoices): VoiceSummary[] {
  return own.kind === 'known' ? voices.filter((v) => own.ids.has(v.id)) : []
}

/** The settings with a cloned voice dropped unless it is known to be this user's. */
export function keepOwnVoice(settings: VoiceSettings, own: OwnVoices): VoiceSettings {
  if (settings.voiceSource !== 'cloned' || settings.voiceId === null) return settings
  if (own.kind === 'known' && own.ids.has(settings.voiceId)) return settings
  return { ...settings, voiceId: null, voiceName: null, voiceSource: null }
}

export class CloneNotKeptError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CloneNotKeptError'
  }
}

/**
 * Clones a voice and records it as this user's. A voice that cannot be recorded is deleted
 * from Cartesia again: left there, nobody could see or delete it in the app. Callers must
 * not abandon this between the clone and the record (a closed dialog included), or the
 * voice is left unowned.
 */
export async function cloneOwnVoice(deps: {
  clone: () => Promise<VoiceSummary>
  ports: ClonedVoicePorts
  discard: (voiceId: string) => Promise<void>
}): Promise<VoiceSummary> {
  const voice = await deps.clone()
  const { error } = await deps.ports.add(voice.id, voice.name)
  if (!error) return voice
  try {
    await deps.discard(voice.id)
  } catch (err) {
    console.warn('[voice] clone not recorded, and deleting it again failed; it is left unowned in Cartesia:', err)
    throw new CloneNotKeptError("Your voice couldn't be saved to your account. Try again.")
  }
  throw new CloneNotKeptError(
    isMissingTable(error) ? CLONES_MIGRATION_MESSAGE : "Your voice couldn't be saved to your account, so it was deleted again. Try again.",
  )
}

/** Deletes a voice from Cartesia, then the record of it. A Cartesia failure keeps the record, to try again. */
export async function deleteOwnVoice(
  voiceId: string,
  deps: { remove: (voiceId: string) => Promise<void>; ports: ClonedVoicePorts },
): Promise<void> {
  await deps.remove(voiceId)
  const { error } = await deps.ports.forget(voiceId)
  // The voice is gone from Cartesia, so a stale row lists nothing: nothing to report.
  if (error) console.warn('[voice] deleted from Cartesia, but its record stayed:', error)
}

/**
 * Before an account is deleted: deletes all of this user's voices from Cartesia. Any
 * failure stops the account deletion, since the dialog promised the voices go with it.
 * Nothing to do before 0017 (no voice has an owner) or without a voice key (none can be reached).
 */
export async function deleteAllOwnVoices(deps: {
  own: () => Promise<OwnVoices>
  remove: (voiceId: string) => Promise<void>
  configured: boolean
}): Promise<{ error: string | null }> {
  if (!deps.configured) return { error: null }
  const own = await deps.own()
  if (own.kind === 'missing') return { error: null }
  if (own.kind === 'failed') {
    return { error: "Couldn't check your recorded voices, so your account wasn't deleted. Try again." }
  }
  let failed = 0
  for (const id of own.ids) {
    try {
      await deps.remove(id)
    } catch (err) {
      console.warn('[voice] could not delete a voice before deleting the account:', err)
      failed++
    }
  }
  return failed > 0
    ? { error: "Couldn't delete your recorded voices from Cartesia, so your account wasn't deleted. Try again." }
    : { error: null }
}

/** The real ports, over the app's Supabase client. */
export function supabaseClonePorts(client: SupabaseClient): ClonedVoicePorts {
  return {
    list: async () => await client.from('cloned_voices').select('voice_id'),
    add: async (voiceId, name) => await client.from('cloned_voices').insert({ voice_id: voiceId, name }),
    forget: async (voiceId) => await client.from('cloned_voices').delete().eq('voice_id', voiceId),
  }
}
