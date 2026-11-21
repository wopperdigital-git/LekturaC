import type { SupabaseClient } from '@supabase/supabase-js'
import type { PortError } from '@/video/storageErrors'

/*
  The user's one face photo, kept in a private bucket at `<uid>/face.<ext>` (migration 0021). The rules
  live here against small `ports`, so they are tested without Supabase; `supabaseFacePorts` is the thin
  real implementation. Same shape as `video/storage.ts`.
*/

export const FACE_BUCKET = 'face-photos'
export const FACE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export const MAX_FACE_BYTES = 10 * 1024 * 1024

/** How long a preview link works. It is fetched when the panel opens. */
const SIGNED_URL_SECONDS = 3600

const EXT_BY_TYPE: Record<(typeof FACE_TYPES)[number], string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

function isFaceType(type: string): type is (typeof FACE_TYPES)[number] {
  return (FACE_TYPES as readonly string[]).includes(type)
}

export function facePath(uid: string, contentType: string): string {
  if (!isFaceType(contentType)) throw new Error(`Unsupported face photo type: ${contentType}`)
  return `${uid}/face.${EXT_BY_TYPE[contentType]}`
}

export function faceUploadProblem(file: { type: string; size: number }, consented: boolean): string | null {
  if (!consented) return 'Tick the box to confirm this is your face, or that you have permission.'
  if (!isFaceType(file.type)) return 'Use a JPG, PNG or WebP photo.'
  if (file.size > MAX_FACE_BYTES) return 'Use a photo under 10 MB.'
  return null
}

export interface FacePorts {
  /** The object names directly under the user's folder (not full paths). */
  list(uid: string): Promise<{ names: string[]; error: PortError | null }>
  upload(path: string, blob: Blob, contentType: string): Promise<{ error: PortError | null }>
  remove(paths: string[]): Promise<{ error: PortError | null }>
  signedUrl(path: string): Promise<{ url: string | null; error: PortError | null }>
}

export interface FacePhoto {
  path: string
  url: string
}

const isFaceName = (name: string) => /^face\./.test(name)

/** The stored photo, ready to show. Never throws: any failure is "no photo". */
export async function readFacePhoto(ports: FacePorts, uid: string): Promise<FacePhoto | null> {
  try {
    const listed = await ports.list(uid)
    if (listed.error) return null
    const name = listed.names.find(isFaceName)
    if (!name) return null
    const path = `${uid}/${name}`
    const signed = await ports.signedUrl(path)
    if (signed.error || !signed.url) return null
    return { path, url: signed.url }
  } catch {
    return null
  }
}

function describeSaveFailure(err: PortError | null | undefined): string {
  if (/bucket not found/i.test(err?.message ?? '')) return 'Run migration 0021 in Supabase.'
  return 'The photo could not be saved. Try again.'
}

/**
 * Stores the photo (replacing one at the same path) and removes a photo left under another extension,
 * so there is only ever one. Removing leftovers is best effort: a stale file costs space, and
 * `readFacePhoto` would still find a face either way.
 */
export async function saveFacePhoto(
  ports: FacePorts,
  uid: string,
  file: Blob & { type: string; size: number },
  consented: boolean,
): Promise<FacePhoto> {
  const problem = faceUploadProblem(file, consented)
  if (problem) throw new Error(problem)

  const path = facePath(uid, file.type)
  const uploaded = await ports.upload(path, file, file.type)
  if (uploaded.error) {
    console.warn('[avatar] face photo upload failed:', uploaded.error)
    throw new Error(describeSaveFailure(uploaded.error))
  }

  try {
    const listed = await ports.list(uid)
    if (!listed.error) {
      const stale = listed.names.filter(isFaceName).map((n) => `${uid}/${n}`).filter((p) => p !== path)
      if (stale.length > 0) await ports.remove(stale)
    }
  } catch {
    // Ignored on purpose, see above.
  }

  const signed = await ports.signedUrl(path)
  if (signed.error || !signed.url) {
    console.warn('[avatar] could not sign the face photo:', signed.error)
    throw new Error('The photo was saved but could not be shown. Try again.')
  }
  return { path, url: signed.url }
}

/**
 * Removes every stored face photo (account deletion). A listing that errors counts as "nothing to
 * delete": before migration 0021 the bucket does not exist, and that must not block deleting an
 * account that never had a photo. Only a failed removal of photos that were listed is an error.
 */
export async function deleteFacePhoto(ports: FacePorts, uid: string): Promise<{ error: string | null }> {
  const failed = { error: 'Your face photo could not be deleted, so the account was not deleted. Try again.' }
  try {
    const listed = await ports.list(uid)
    if (listed.error) {
      console.warn('[avatar] could not list face photos, treating as none:', listed.error)
      return { error: null }
    }
    const paths = listed.names.filter(isFaceName).map((n) => `${uid}/${n}`)
    if (paths.length === 0) return { error: null }
    const removed = await ports.remove(paths)
    if (removed.error) {
      console.warn('[avatar] face photo removal failed:', removed.error)
      return failed
    }
    return { error: null }
  } catch (e) {
    console.warn('[avatar] face photo removal failed:', e)
    return failed
  }
}

/** The real ports, over the app's Supabase client. */
export function supabaseFacePorts(client: SupabaseClient): FacePorts {
  const bucket = () => client.storage.from(FACE_BUCKET)
  return {
    async list(uid) {
      const { data, error } = await bucket().list(uid)
      return { names: (data ?? []).map((o) => o.name), error }
    },
    async upload(path, blob, contentType) {
      // `cacheControl: '0'`: replacing the photo at the same path must not keep showing the old one.
      const { error } = await bucket().upload(path, blob, { contentType, upsert: true, cacheControl: '0' })
      return { error }
    },
    async remove(paths) {
      const { error } = await bucket().remove(paths)
      return { error }
    },
    async signedUrl(path) {
      const { data, error } = await bucket().createSignedUrl(path, SIGNED_URL_SECONDS)
      return { url: data?.signedUrl ?? null, error }
    },
  }
}
