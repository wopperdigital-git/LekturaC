import { parseVideo, type VideoRecord } from './videoRecord'

/*
  The Videos page's rules, kept pure so they are tested: which stored `video` columns count as a
  video, in what order they are listed, and what the search matches. A deck has at most one video
  (it is replaced each time), so an entry is a deck and its video.
*/

export interface VideoEntry<D> {
  deck: D
  record: VideoRecord
}

/**
 * Every deck whose `video` column holds a readable record, newest video first. A malformed record is
 * left out, as `parseVideo` decides for the editor's dialog too: half a record would show a player
 * with nothing behind it.
 */
export function videoLibrary<D>(rows: readonly { deck: D; video: unknown }[]): VideoEntry<D>[] {
  const entries: VideoEntry<D>[] = []
  for (const row of rows) {
    const record = parseVideo(row.video)
    if (record) entries.push({ deck: row.deck, record })
  }
  return entries.sort((a, b) => Date.parse(b.record.generatedAt) - Date.parse(a.record.generatedAt))
}

/** The rail's search, by deck title, ignoring case and surrounding spaces. */
export function filterVideos<D extends { title: string }>(entries: VideoEntry<D>[], query: string): VideoEntry<D>[] {
  const q = query.trim().toLowerCase()
  if (!q) return entries
  return entries.filter((e) => e.deck.title.toLowerCase().includes(q))
}

/** A clip length as a player shows it: "0:42", "2:05", "1:02:05". Rounded to the second, never below 0:01. */
export function videoLength(seconds: number): string {
  const total = Math.max(1, Math.round(seconds))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = String(total % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}
