import { describe, expect, it } from 'vitest'
import {
  elapsedMs,
  formatClock,
  pauseStopwatch,
  resumeStopwatch,
  startStopwatch,
} from './timer'

describe('stopwatch', () => {
  it('counts only while running', () => {
    let sw = startStopwatch(1000)
    sw = pauseStopwatch(sw, 4000)
    expect(elapsedMs(sw, 9000)).toBe(3000)
    sw = resumeStopwatch(sw, 10000)
    expect(elapsedMs(sw, 12000)).toBe(5000)
  })
  it('ignores a pause when already paused and a resume when running', () => {
    const paused = pauseStopwatch(startStopwatch(0), 1000)
    expect(pauseStopwatch(paused, 5000)).toEqual(paused)
    const running = startStopwatch(0)
    expect(resumeStopwatch(running, 5000)).toEqual(running)
  })
  it('never reads negative', () => {
    expect(elapsedMs(startStopwatch(1000), 500)).toBe(0)
  })
})

describe('formatClock', () => {
  it('formats minutes and seconds, and hours past an hour', () => {
    expect(formatClock(372000)).toBe('06:12')
    expect(formatClock(3723000)).toBe('1:02:03')
    expect(formatClock(0)).toBe('00:00')
    expect(formatClock(-5)).toBe('00:00')
  })
})
