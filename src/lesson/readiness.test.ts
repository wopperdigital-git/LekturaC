import { describe, expect, it } from 'vitest'

import type { VideoRecord } from '@/video/videoRecord'

import { READINESS_REASON, lessonReadiness } from './readiness'

const video = (slides?: VideoRecord['slides']): VideoRecord => ({
  path: 'u/d.mp4',
  contentType: 'video/mp4',
  durationSeconds: 30,
  generatedAt: '2026-11-06T00:00:00Z',
  ...(slides ? { slides } : {}),
})

describe('lessonReadiness', () => {
  it('is no_deck without a deck, even with a video', () => {
    expect(lessonReadiness(null, video([{ cardId: 'c', startSeconds: 0, durationSeconds: 5 }]))).toBe('no_deck')
  })

  it('is no_video with a deck but no video', () => {
    expect(lessonReadiness('d', null)).toBe('no_video')
  })

  it('is no_timings when the video has no slide timings', () => {
    expect(lessonReadiness('d', video())).toBe('no_timings')
  })

  it('is no_timings when the timings list is empty', () => {
    expect(lessonReadiness('d', video([]))).toBe('no_timings')
  })

  it('is ready with a deck and a timed video', () => {
    expect(lessonReadiness('d', video([{ cardId: 'c', startSeconds: 0, durationSeconds: 5 }]))).toBe('ready')
  })
})

describe('READINESS_REASON', () => {
  it('has the exact copy for each unready state', () => {
    expect(READINESS_REASON).toEqual({
      no_deck: 'The deck for this quiz was deleted.',
      no_video: 'Make the narrated video first.',
      no_timings: 'Make the video again to use it in a lesson.',
    })
  })
})
