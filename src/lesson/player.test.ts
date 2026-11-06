import { describe, expect, it } from 'vitest'

import { placeCheckpoints } from './checkpoints'
import { LESSON_FIXTURE } from './fixtures'
import { clampSeek, dueStop, firstUnanswered, lessonStatus, resumeTime } from './player'

const stops = placeCheckpoints(LESSON_FIXTURE.questions, LESSON_FIXTURE.slides)
const { slides } = LESSON_FIXTURE
const set = (...ids: string[]) => new Set(ids)

describe('clampSeek', () => {
  it('never goes past what has been watched or before the start', () => {
    expect(clampSeek(40, 12)).toBe(12)
    expect(clampSeek(-3, 12)).toBe(0)
    expect(clampSeek(7, 12)).toBe(7)
  })
})

describe('firstUnanswered', () => {
  it('is the first stop in asking order that is not answered', () => {
    expect(firstUnanswered(stops, set())?.questionId).toBe('q2')
    expect(firstUnanswered(stops, set('q2', 'q4'))?.questionId).toBe('q1')
  })
  it('is null when everything is answered', () => {
    expect(firstUnanswered(stops, set('q1', 'q2', 'q3', 'q4', 'q5', 'q6'))).toBeNull()
  })
})

describe('dueStop', () => {
  it('returns the earliest unanswered stop even when playback overshot past it', () => {
    expect(dueStop(15.1, false, stops, set())?.questionId).toBe('q2')
  })
  it('is due within the epsilon before the stop', () => {
    expect(dueStop(14.8, false, stops, set('q2'))?.questionId).toBe('q1')
  })
  it('is not due earlier than the epsilon', () => {
    expect(dueStop(14.7, false, stops, set('q2'))).toBeNull()
  })
  it('returns the next unanswered stop when the video ended early', () => {
    expect(dueStop(3, true, stops, set('q2', 'q1', 'q4'))?.questionId).toBe('q6')
  })
  it('is null when everything is answered, ended or not', () => {
    const all = set('q1', 'q2', 'q3', 'q4', 'q5', 'q6')
    expect(dueStop(99, false, stops, all)).toBeNull()
    expect(dueStop(99, true, stops, all)).toBeNull()
  })
})

describe('resumeTime', () => {
  it('starts at 0 when nothing is answered', () => {
    expect(resumeTime(stops, set(), slides)).toBe(0)
  })
  it('starts at the slide after the latest answered stop', () => {
    expect(resumeTime(stops, set('q2'), slides)).toBe(5)
    expect(resumeTime(stops, set('q2', 'q1'), slides)).toBe(15)
  })
  it('uses stop order, not answer order, to find the latest', () => {
    expect(resumeTime(stops, set('q1', 'q2'), slides)).toBe(15)
  })
  it('is the end of the video when the latest answered stop is on the last slide', () => {
    expect(resumeTime(stops, set('q2', 'q1', 'q4', 'q6'), slides)).toBe(18)
  })
  it('is the end of the video when the latest answered stop is unplaced', () => {
    expect(resumeTime(stops, set('q3'), slides)).toBe(18)
    expect(resumeTime(stops, set('q1', 'q2', 'q3', 'q4', 'q5', 'q6'), slides)).toBe(18)
  })
})

describe('lessonStatus', () => {
  it('labels the three states', () => {
    expect(lessonStatus(0, false)).toBe('not_started')
    expect(lessonStatus(2, false)).toBe('in_progress')
    expect(lessonStatus(0, true)).toBe('finished')
    expect(lessonStatus(5, true)).toBe('finished')
  })
})
