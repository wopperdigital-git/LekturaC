import type { SupabaseClient } from '@supabase/supabase-js'
import { VideoError } from './errors'
import type { VideoFormat } from './format'
import { VIDEO_BUCKET, videoPath } from './paths'
import { describeStorageFailure, type PortError } from './storageErrors'
import { parseVideo, type VideoRecord } from './videoRecord'

/*
  Where a deck's video goes and how it is found again. The rules (what is written first, what is
  removed and when, what a failure leaves behind) live here against a small set of `ports`, so they
  are tested without Supabase; `supabasePorts` is the thin real implementation.

  The order is the point: upload, then write the record, then remove the previous object. A video the
  record does not point at is invisible, and the previous object is only ever removed once the new
  one is both stored and pointed at, so a failure at any step leaves the deck with the video it had.
*/

/** How long a playback or download link works. It is fetched when the modal opens. */
const SIGNED_URL_SECONDS = 3600

export interface StoragePorts {
  upload(path: string, blob: Blob, contentType: string): Promise<{ error: PortError | null }>
  remove(paths: string[]): Promise<{ error: PortError | null }>
  writeRecord(presentationId: string, record: VideoRecord): Promise<{ error: PortError | null }>
  /** `data` is the deck's `video` column as stored (unparsed). */
  readRecord(presentationId: string): Promise<{ data: unknown; error: PortError | null }>
  /** With `downloadName` the link makes the browser save the file rather than play it. */
  signedUrl(path: string, downloadName?: string): Promise<{ url: string | null; error: PortError | null }>
}

export interface SaveVideoInput {
  uid: string
  presentationId: string
  blob: Blob
  format: VideoFormat
  durationSeconds: number
  /** The deck's video before this run, if it has one. */
  previous: VideoRecord | null
  now?: () => Date
}

/** Clean-up must never turn a result into a failure, or hide the failure that caused it. */
async function bestEffortRemove(ports: StoragePorts, paths: string[]): Promise<void> {
  try {
    await ports.remove(paths)
  } catch {
    // Nothing to do: an orphaned file costs space, not correctness.
  }
}

export async function saveVideo(ports: StoragePorts, input: SaveVideoInput): Promise<VideoRecord> {
  const path = videoPath(input.uid, input.presentationId, input.format.ext)

  const uploaded = await ports.upload(path, input.blob, input.format.contentType)
  if (uploaded.error) {
    console.warn('[video] upload failed:', uploaded.error)
    throw new VideoError('uploading', describeStorageFailure(uploaded.error))
  }

  const record: VideoRecord = {
    path,
    contentType: input.format.contentType,
    durationSeconds: input.durationSeconds,
    generatedAt: (input.now?.() ?? new Date()).toISOString(),
  }
  const wrote = await ports.writeRecord(input.presentationId, record)
  if (wrote.error) {
    console.warn('[video] could not record the video:', wrote.error)
    // A new object nothing points at is removed again. At the same path the file was already
    // overwritten in place: it cannot be restored, and removing it would lose the deck's video.
    if (input.previous?.path !== path) await bestEffortRemove(ports, [path])
    throw new VideoError('uploading', describeStorageFailure(wrote.error))
  }

  if (input.previous && input.previous.path !== path) await bestEffortRemove(ports, [input.previous.path])
  return record
}

export interface VideoView {
  record: VideoRecord
  /** For the player. `null` when signing failed: the record is still shown. */
  url: string | null
  /** For the Download link. */
  downloadUrl: string | null
}

/**
 * The deck title as a file name. It ends up in a signed URL's `download` query, which storage-js encodes
 * twice, so anything special in a URL or illegal in a file name (`\ / : * ? " < > | & % #`, control
 * characters) becomes `_`, a run at a time. Letters of any script stay. Nothing left but `_` and
 * spaces (an empty or all-forbidden title) falls back to "presentation".
 */
function downloadBaseName(title: string): string {
  let out = ''
  let inRun = false
  for (const ch of title) {
    const forbidden = ch.charCodeAt(0) < 0x20 || '\\/:*?"<>|&%#'.includes(ch)
    if (forbidden) {
      if (!inRun) out += '_'
    } else {
      out += ch
    }
    inRun = forbidden
  }
  const trimmed = out.trim()
  return /^[_\s]*$/.test(trimmed) ? 'presentation' : trimmed
}

/**
 * The deck's existing video, ready to show. Never throws: no video (or a read that failed, a project
 * without migration 0015) is simply nothing to show; the migration message appears when generating.
 */
export async function loadVideo(
  ports: StoragePorts,
  presentationId: string,
  baseName: string,
): Promise<VideoView | null> {
  try {
    const { data, error } = await ports.readRecord(presentationId)
    if (error) return null
    const record = parseVideo(data)
    if (!record) return null
    // The extension comes from the stored file, not from what this browser would make today.
    const downloadName = `${downloadBaseName(baseName)}.${record.contentType === 'video/webm' ? 'webm' : 'mp4'}`
    const [play, download] = await Promise.all([
      ports.signedUrl(record.path),
      ports.signedUrl(record.path, downloadName),
    ])
    return {
      record,
      url: play.error ? null : play.url,
      downloadUrl: download.error ? null : download.url,
    }
  } catch {
    return null
  }
}

/**
 * Removes a deck's video file before the deck row goes (SQL cannot safely delete Storage objects).
 * Best effort and never throws: deleting a deck must not be blocked by its video.
 */
export async function removeDeckVideo(ports: StoragePorts, presentationId: string): Promise<void> {
  try {
    const { data, error } = await ports.readRecord(presentationId)
    if (error) return
    const record = parseVideo(data)
    if (record) await bestEffortRemove(ports, [record.path])
  } catch {
    // Same reason as above.
  }
}

/** The real ports, over the app's Supabase client. */
export function supabasePorts(client: SupabaseClient): StoragePorts {
  const bucket = () => client.storage.from(VIDEO_BUCKET)
  return {
    async upload(path, blob, contentType) {
      // `cacheControl: '0'`: the same path is overwritten on every regeneration, and a cached copy
      // would keep playing the old video. (The storage client's `upload` takes no AbortSignal, which
      // is why the upload is the pipeline's point of no return.)
      const { error } = await bucket().upload(path, blob, { contentType, upsert: true, cacheControl: '0' })
      return { error }
    },
    async remove(paths) {
      const { error } = await bucket().remove(paths)
      return { error }
    },
    async writeRecord(presentationId, record) {
      // Its own update, never the card upsert: a project without migration 0015 must still save decks.
      const { error } = await client.from('presentations').update({ video: record }).eq('id', presentationId)
      return { error }
    },
    async readRecord(presentationId) {
      const { data, error } = await client.from('presentations').select('video').eq('id', presentationId).maybeSingle()
      return { data: data?.video ?? null, error }
    },
    async signedUrl(path, downloadName) {
      const { data, error } = await bucket().createSignedUrl(
        path,
        SIGNED_URL_SECONDS,
        downloadName ? { download: downloadName } : undefined,
      )
      return { url: data?.signedUrl ?? null, error }
    },
  }
}
