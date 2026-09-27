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
