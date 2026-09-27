import type { VideoContentType } from './format'

/** What `presentations.video` holds: a pointer to the file plus what the modal shows about it. */
export interface VideoRecord {
  path: string
  contentType: VideoContentType
  durationSeconds: number
  generatedAt: string
}

/**
 * Reads whatever the database returned. All or nothing: a record with one bad field is no
 * video, because half a record would show a player with nothing behind it.
 */
export function parseVideo(raw: unknown): VideoRecord | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  if (typeof r.path !== 'string' || r.path === '') return null
  if (r.contentType !== 'video/mp4' && r.contentType !== 'video/webm') return null
  if (typeof r.durationSeconds !== 'number' || !Number.isFinite(r.durationSeconds) || r.durationSeconds <= 0) return null
  if (typeof r.generatedAt !== 'string') return null
  return {
    path: r.path,
    contentType: r.contentType,
    durationSeconds: r.durationSeconds,
    generatedAt: r.generatedAt,
  }
}
