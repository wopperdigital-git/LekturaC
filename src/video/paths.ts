import type { VideoExt } from './format'

/** The private bucket migration 0015 creates. */
export const VIDEO_BUCKET = 'deck-videos'

/**
 * Where a deck's video lives. The first folder is the owner's user id: the bucket's policies
 * compare it to `auth.uid()`, so this is what keeps one account's videos from another's.
 */
export function videoPath(uid: string, presentationId: string, ext: VideoExt): string {
  return `${uid}/${presentationId}.${ext}`
}

/**
 * Where a deck's earlier video is kept once a new one takes its place: a folder named for the deck,
 * one file per video, named for when it was made. The deck's current video stays at `videoPath`,
 * the one name a lesson's student may read (`can_watch_deck_video`), so earlier ones are owner-only.
 */
export function pastVideoPath(uid: string, presentationId: string, generatedAt: string, ext: VideoExt): string {
  const stamp = generatedAt.replace(/[^0-9A-Za-z-]/g, '-') || 'video'
  return `${uid}/${presentationId}/${stamp}.${ext}`
}
