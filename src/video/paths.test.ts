import { describe, expect, it } from 'vitest'
import { VIDEO_BUCKET, videoPath } from './paths'

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
