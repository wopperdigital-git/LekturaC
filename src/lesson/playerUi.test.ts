import { describe, expect, it } from 'vitest'
import type { TakeLesson } from './rows'
import {
  backTarget,
  checkpointContext,
  formatClock,
  hasUsableVideo,
  isWatchRefusal,
  noVideoNeedsReload,
  progressFraction,
  seekFromFraction,
} from './playerUi'

const video = {
  path: 'u/d.mp4',
  contentType: 'video/mp4' as const,
  durationSeconds: 18,
  generatedAt: '',
  slides: [{ cardId: 'c1', startSeconds: 0, durationSeconds: 18 }],
}

describe('hasUsableVideo', () => {
  it('needs a record with slide timings and a link', () => {
    expect(hasUsableVideo(video, 'https://x/v.mp4')).toBe(true)
    expect(hasUsableVideo(null, 'https://x/v.mp4')).toBe(false)
    expect(hasUsableVideo({ ...video, slides: undefined }, 'https://x/v.mp4')).toBe(false)
    expect(hasUsableVideo({ ...video, slides: [] }, 'https://x/v.mp4')).toBe(false)
    expect(hasUsableVideo(video, null)).toBe(false)
  })
})

describe('isWatchRefusal', () => {
  it('matches only the two sentences that mean "go back and watch"', () => {
    expect(isWatchRefusal('Watch up to this question first.')).toBe(true)
    expect(isWatchRefusal('Answer the questions in order.')).toBe(true)
    expect(isWatchRefusal("Couldn't reach the server.")).toBe(false)
    expect(isWatchRefusal('')).toBe(false)
  })
})

describe('noVideoNeedsReload', () => {
  it('asks to reload after a refusal, until the student has pressed Try again for it', () => {
    expect(noVideoNeedsReload(0, 0)).toBe(false)
    expect(noVideoNeedsReload(1, 0)).toBe(true)
    expect(noVideoNeedsReload(1, 1)).toBe(false)
    expect(noVideoNeedsReload(2, 1)).toBe(true)
  })
})

describe('seeking', () => {
  it('never lands past what the server has counted', () => {
    expect(seekFromFraction(0.5, 100, 80)).toBe(50)
    expect(seekFromFraction(0.9, 100, 80)).toBe(80)
    expect(seekFromFraction(-1, 100, 80)).toBe(0)
  })
  it('goes back 10 seconds, not below zero', () => {
    expect(backTarget(25, 30)).toBe(15)
    expect(backTarget(4, 30)).toBe(0)
  })
  it('reads progress as a fraction in [0, 1]', () => {
    expect(progressFraction(5, 20)).toBe(0.25)
    expect(progressFraction(30, 20)).toBe(1)
    expect(progressFraction(5, 0)).toBe(0)
  })
})

describe('formatClock', () => {
  it('writes m:ss', () => {
    expect(formatClock(0)).toBe('0:00')
    expect(formatClock(65.9)).toBe('1:05')
    expect(formatClock(-3)).toBe('0:00')
    expect(formatClock(Number.NaN)).toBe('0:00')
  })
})

describe('checkpointContext', () => {
  const lesson = {
    sections: [
      { title: 'A', instructions: '', config: { type: 'multiple_choice', choiceCount: 4 } },
      { title: 'B', instructions: '', config: { type: 'fill_blank', wordBox: true } },
    ],
    questions: [
      { id: 'q1', sectionIndex: 0 },
      { id: 'q2', sectionIndex: 1 },
      { id: 'q3', sectionIndex: 1 },
    ],
    wordBoxes: { 1: ['atom', 'cell'] },
  } as unknown as TakeLesson

  it('numbers within the question\'s own test and brings that test\'s config and words', () => {
    const c = checkpointContext(lesson, 'q3')!
    expect(c.index).toBe(1)
    expect(c.config).toEqual({ type: 'fill_blank', wordBox: true })
    expect(c.words).toEqual(['atom', 'cell'])
    expect(checkpointContext(lesson, 'q1')!.words).toBeUndefined()
  })
  it('is null for an unknown question', () => {
    expect(checkpointContext(lesson, 'nope')).toBeNull()
  })
})
