import type { VideoContentType } from './format'

/** Where one slide sits in the video. Lessons place quiz checkpoints with these. */
export interface VideoSlideTiming {
  cardId: string
  startSeconds: number
  durationSeconds: number
}

/** What `presentations.video` holds: a pointer to the file plus what the modal shows about it. */
export interface VideoRecord {
  path: string
  contentType: VideoContentType
  durationSeconds: number
  generatedAt: string
  /** Absent on videos made before timings were saved (and on a malformed list). */
  slides?: VideoSlideTiming[]
}

function parseSlides(raw: unknown): VideoSlideTiming[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const slides: VideoSlideTiming[] = []
  for (const item of raw) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return undefined
    const s = item as Record<string, unknown>
    if (typeof s.cardId !== 'string' || s.cardId === '') return undefined
    if (typeof s.startSeconds !== 'number' || !Number.isFinite(s.startSeconds) || s.startSeconds < 0) return undefined
    if (typeof s.durationSeconds !== 'number' || !Number.isFinite(s.durationSeconds) || s.durationSeconds <= 0) return undefined
    slides.push({ cardId: s.cardId, startSeconds: s.startSeconds, durationSeconds: s.durationSeconds })
  }
  return slides
}

/**
 * A deck's earlier videos (`presentations.video_history`), newest first. Anything that is not a list
 * is no history; an entry that does not read as a video is left out and the rest are kept.
 */
export function parseVideoHistory(raw: unknown): VideoRecord[] {
  if (!Array.isArray(raw)) return []
  return raw.map(parseVideo).filter((r): r is VideoRecord => r !== null)
}

/**
 * Reads whatever the database returned. All or nothing: a record with one bad field is no
 * video, because half a record would show a player with nothing behind it. The one exception is
 * `slides`, which only lessons use: a bad list is left out and the video is kept.
 */
export function parseVideo(raw: unknown): VideoRecord | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  if (typeof r.path !== 'string' || r.path === '') return null
  if (r.contentType !== 'video/mp4' && r.contentType !== 'video/webm') return null
  if (typeof r.durationSeconds !== 'number' || !Number.isFinite(r.durationSeconds) || r.durationSeconds <= 0) return null
  if (typeof r.generatedAt !== 'string') return null
  const slides = parseSlides(r.slides)
  return {
    path: r.path,
    contentType: r.contentType,
    durationSeconds: r.durationSeconds,
    generatedAt: r.generatedAt,
    ...(slides ? { slides } : {}),
  }
}
