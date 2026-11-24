import type { SupabaseClient } from '@supabase/supabase-js'
import { VideoError } from './errors'
import type { VideoFormat } from './format'
import { VIDEO_BUCKET, pastVideoPath, videoPath } from './paths'
import { describeStorageFailure, isMissingColumn, type PortError } from './storageErrors'
import { parseVideo, parseVideoHistory, type VideoRecord, type VideoSlideTiming } from './videoRecord'

/*
  Where a deck's video goes and how it is found again. The rules (what is written first, what is
  removed and when, what a failure leaves behind) live here against a small set of `ports`, so they
  are tested without Supabase; `supabasePorts` is the thin real implementation.

  The order is the point: upload, then write the record, then remove the previous object. A video the
  record does not point at is invisible, and the previous object is only ever removed once the new
  one is both stored and pointed at, so a failure at any step leaves the deck with the video it had.

  Earlier videos are kept, not replaced (migration 0022, `presentations.video_history`). The current
  video always sits at `videoPath`, the only name a lesson's student may read, so before a new one is
  uploaded over it, the current file is copied to `pastVideoPath` and listed first in the history,
  in the same write that points the deck at the new video. A copy that fails stops the save before
  anything is overwritten: a video is never dropped silently. A project without 0022 has no history
  to write and replaces the video as it always did.
*/

const KEEP_FAILED = 'Your previous video could not be kept, so this one was not saved. Try again.'

/** How long a playback or download link works. It is fetched when the modal opens. */
const SIGNED_URL_SECONDS = 3600

export interface StoragePorts {
  upload(path: string, blob: Blob, contentType: string): Promise<{ error: PortError | null }>
  remove(paths: string[]): Promise<{ error: PortError | null }>
  /** Copies a stored object to a new name; the original stays. */
  copy(from: string, to: string): Promise<{ error: PortError | null }>
  /** Points the deck at `record`; with `history`, also sets its earlier videos, in the same write. */
  writeRecord(presentationId: string, record: VideoRecord, history?: VideoRecord[]): Promise<{ error: PortError | null }>
  /** `data` is the deck's `video` column as stored (unparsed). */
  readRecord(presentationId: string): Promise<{ data: unknown; error: PortError | null }>
  /** `data` is the deck's `video_history` column as stored (unparsed). */
  readHistory(presentationId: string): Promise<{ data: unknown; error: PortError | null }>
  /** With `downloadName` the link makes the browser save the file rather than play it. */
  signedUrl(path: string, downloadName?: string): Promise<{ url: string | null; error: PortError | null }>
}

export interface SaveVideoInput {
  uid: string
  presentationId: string
  blob: Blob
  format: VideoFormat
  durationSeconds: number
  /** Where each slide sits in the video; stored so lessons can place checkpoints. */
  slides?: VideoSlideTiming[]
  /** The deck's video before this run, if it has one. Used only when the stored one cannot be read. */
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

/** The deck's video as stored now; the caller's copy when it cannot be read. */
async function readCurrent(ports: StoragePorts, input: SaveVideoInput): Promise<VideoRecord | null> {
  try {
    const { data, error } = await ports.readRecord(input.presentationId)
    return error ? input.previous : parseVideo(data)
  } catch {
    return input.previous
  }
}

/** The deck's earlier videos, or `'none'` for a project without migration 0022. Throws on any other failure. */
async function readHistoryForSave(ports: StoragePorts, presentationId: string): Promise<VideoRecord[] | 'none'> {
  let result: { data: unknown; error: PortError | null }
  try {
    result = await ports.readHistory(presentationId)
  } catch (err) {
    console.warn('[video] could not read the earlier videos:', err)
    throw new VideoError('uploading', 'The video could not be saved. Try again.')
  }
  if (result.error && isMissingColumn(result.error)) return 'none'
  if (result.error) {
    // Writing a history without the one stored would drop the earlier videos from the deck.
    console.warn('[video] could not read the earlier videos:', result.error)
    throw new VideoError('uploading', describeStorageFailure(result.error))
  }
  return parseVideoHistory(result.data)
}

export async function saveVideo(ports: StoragePorts, input: SaveVideoInput): Promise<VideoRecord> {
  const path = videoPath(input.uid, input.presentationId, input.format.ext)
  const current = await readCurrent(ports, input)
  const history = await readHistoryForSave(ports, input.presentationId)

  // 1. Keep the current video under its own name before anything can overwrite it.
  let kept: VideoRecord | null = null
  if (history !== 'none' && current) {
    const ext = current.contentType === 'video/webm' ? 'webm' : 'mp4'
    kept = { ...current, path: pastVideoPath(input.uid, input.presentationId, current.generatedAt, ext) }
    const copied = await ports.copy(current.path, kept.path)
    if (copied.error) {
      console.warn('[video] could not keep the previous video:', copied.error)
      throw new VideoError('uploading', KEEP_FAILED)
    }
  }

  // 2. The new video.
  const uploaded = await ports.upload(path, input.blob, input.format.contentType)
  if (uploaded.error) {
    console.warn('[video] upload failed:', uploaded.error)
    if (kept) await bestEffortRemove(ports, [kept.path])
    throw new VideoError('uploading', describeStorageFailure(uploaded.error))
  }

  // 3. Point the deck at it, with the kept one first in its history.
  const record: VideoRecord = {
    path,
    contentType: input.format.contentType,
    durationSeconds: input.durationSeconds,
    generatedAt: (input.now?.() ?? new Date()).toISOString(),
    ...(input.slides ? { slides: input.slides } : {}),
  }
  const nextHistory =
    history === 'none'
      ? undefined
      : [...(kept ? [kept] : []), ...history.filter((h) => h.path !== kept?.path && h.path !== path)]
  const wrote = await ports.writeRecord(input.presentationId, record, nextHistory)
  if (wrote.error) {
    console.warn('[video] could not record the video:', wrote.error)
    // Nothing points at the copy, or at a new object under a new name: both are removed again. At the
    // same path the file was already overwritten in place: it cannot be restored, and removing it
    // would lose the deck's video.
    const orphans = [...(kept ? [kept.path] : []), ...(current?.path !== path ? [path] : [])]
    if (orphans.length > 0) await bestEffortRemove(ports, orphans)
    throw new VideoError('uploading', describeStorageFailure(wrote.error))
  }

  // 4. A current video under another name (another container) is now kept as a copy, or, without
  //    0022, replaced as before.
  if (current && current.path !== path) await bestEffortRemove(ports, [current.path])
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
 * Playback and download links for a stored video. Never throws: a link that cannot be made is
 * `null` and the record is still shown. `baseName` (the deck title) names the downloaded file.
 */
export async function signVideo(ports: StoragePorts, record: VideoRecord, baseName: string): Promise<VideoView> {
  // The extension comes from the stored file, not from what this browser would make today.
  const downloadName = `${downloadBaseName(baseName)}.${record.contentType === 'video/webm' ? 'webm' : 'mp4'}`
  try {
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
    return { record, url: null, downloadUrl: null }
  }
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
    return await signVideo(ports, record, baseName)
  } catch {
    return null
  }
}

/**
 * The deck's earlier videos, newest first, each ready to play. Never throws: no history (or a read
 * that failed, a project without migration 0022) is an empty list.
 */
export async function loadVideoHistory(
  ports: StoragePorts,
  presentationId: string,
  baseName: string,
): Promise<VideoView[]> {
  try {
    const { data, error } = await ports.readHistory(presentationId)
    if (error) return []
    return await Promise.all(parseVideoHistory(data).map((record) => signVideo(ports, record, baseName)))
  } catch {
    return []
  }
}

/**
 * Deletes a deck (`deleteRow`) and then its video file (SQL cannot safely delete Storage objects).
 *
 * The record is read first, since the row is what says where the file is, but the file is removed
 * only once the row is gone: a delete that fails leaves the deck with the video it had, and the
 * failure is passed on. Reading or removing the video is best effort: a deck delete is never blocked
 * by its video, and a file left behind costs space, not correctness.
 */
export async function deleteDeckWithVideo(
  ports: StoragePorts,
  presentationId: string,
  deleteRow: () => Promise<void>,
): Promise<void> {
  const paths: string[] = []
  try {
    const { data, error } = await ports.readRecord(presentationId)
    const record = error ? null : parseVideo(data)
    if (record) paths.push(record.path)
  } catch {
    // Unreadable: the deck still goes, and its file (if any) is orphaned.
  }
  try {
    const { data, error } = await ports.readHistory(presentationId)
    if (!error) paths.push(...parseVideoHistory(data).map((r) => r.path))
  } catch {
    // Likewise its earlier videos.
  }
  await deleteRow()
  if (paths.length > 0) await bestEffortRemove(ports, paths)
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
    async copy(from, to) {
      const { error } = await bucket().copy(from, to)
      return { error }
    },
    async writeRecord(presentationId, record, history) {
      // Its own update, never the card upsert: a project without migration 0015 must still save decks.
      const values = history ? { video: record, video_history: history } : { video: record }
      const { error } = await client.from('presentations').update(values).eq('id', presentationId)
      return { error }
    },
    async readHistory(presentationId) {
      const { data, error } = await client.from('presentations').select('video_history').eq('id', presentationId).maybeSingle()
      return { data: data?.video_history ?? null, error }
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
