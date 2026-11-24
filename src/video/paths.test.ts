import { describe, expect, it } from 'vitest'
import { VIDEO_BUCKET, pastVideoPath, videoPath } from './paths'

describe('videoPath', () => {
  // The bucket's policy compares the first folder to the caller's user id.
  it("puts the video in the owner's folder", () => {
    expect(videoPath('u1', 'p1', 'mp4')).toBe('u1/p1.mp4')
    expect(videoPath('u1', 'p1', 'webm')).toBe('u1/p1.webm')
  })

  it('names the private bucket the migration creates', () => {
    expect(VIDEO_BUCKET).toBe('deck-videos')
  })
})

describe('pastVideoPath', () => {
  // Still in the owner's folder (the bucket's policies), but never the current video's name: a lesson's
  // student may read only `<owner>/<deck>.<ext>` (can_watch_deck_video), so earlier videos stay private.
  it("keeps an earlier video in a folder for the deck, named for when it was made", () => {
    expect(pastVideoPath('u1', 'p1', '2026-11-23T23:05:21.000Z', 'mp4')).toBe('u1/p1/2026-11-23T23-05-21-000Z.mp4')
    expect(pastVideoPath('u1', 'p1', '2026-11-23T23:05:21.000Z', 'webm')).toBe('u1/p1/2026-11-23T23-05-21-000Z.webm')
  })

  it('never makes a name outside its folder', () => {
    expect(pastVideoPath('u1', 'p1', '../x', 'mp4')).toBe('u1/p1/---x.mp4')
    expect(pastVideoPath('u1', 'p1', '', 'mp4')).toBe('u1/p1/video.mp4')
  })
})
