import { describe, expect, it } from 'vitest'
import {
  estimateMinutes,
  pace,
  parseTargetMinutes,
  slideBudgets,
  wordCount,
} from './pacing'

describe('wordCount', () => {
  it('counts words, ignoring extra whitespace', () => {
    expect(wordCount('  two  words ')).toBe(2)
  })
  it('reads undefined and blank as zero', () => {
    expect(wordCount(undefined)).toBe(0)
    expect(wordCount('   ')).toBe(0)
  })
})

describe('slideBudgets', () => {
  it('gives a blank script the 30 second floor and scales the rest by 150 wpm', () => {
    expect(slideBudgets(['', 'x '.repeat(300)])).toEqual([30, 120])
  })
})

describe('estimateMinutes', () => {
  it('rounds the total up to whole minutes', () => {
    expect(estimateMinutes([30, 120])).toBe(3)
  })
  it('is at least one minute', () => {
    expect(estimateMinutes([])).toBe(1)
  })
  it('is at most 180 minutes', () => {
    expect(estimateMinutes([100000])).toBe(180)
  })
})

describe('parseTargetMinutes', () => {
  it('parses, rounds and clamps', () => {
    expect(parseTargetMinutes('15')).toBe(15)
    expect(parseTargetMinutes('12.6')).toBe(13)
    expect(parseTargetMinutes('0')).toBe(1)
    expect(parseTargetMinutes('999')).toBe(180)
  })
  it('refuses what is not a number', () => {
    expect(parseTargetMinutes('')).toBeNull()
    expect(parseTargetMinutes('abc')).toBeNull()
  })
})

describe('pace', () => {
  const b = [60, 60, 60]
  it('is on time at the start', () => {
    expect(pace(0, 0, b, 180, 0).status).toBe('on-time')
  })
  it('is behind when the first slide runs long', () => {
    const p = pace(150, 0, b, 180, 0)
    expect(p.status).toBe('behind')
    expect(p.minutes).toBe(2)
  })
  it('is ahead when the last slide arrives early', () => {
    const p = pace(10, 2, b, 180, 0)
    expect(p.status).toBe('ahead')
    expect(p.minutes).toBe(2)
  })
  it('reads starting mid-deck as on time', () => {
    expect(pace(0, 1, b, 180, 1).status).toBe('on-time')
  })
  it('reports at least one minute once outside the tolerance', () => {
    const p = pace(20, 1, b, 180, 0)
    expect(p.status).toBe('ahead')
    expect(p.minutes).toBe(1)
  })
  it('is on time with no slides or no target', () => {
    expect(pace(5, 0, [], 180, 0)).toEqual({
      status: 'on-time',
      minutes: 0,
      elapsedFraction: 0,
      plannedFraction: 0,
    })
    expect(pace(5, 0, b, 0, 0).status).toBe('on-time')
  })
  it('reports fractions of the target', () => {
    const p = pace(90, 1, b, 180, 0)
    expect(p.elapsedFraction).toBeCloseTo(0.5)
    expect(p.plannedFraction).toBeCloseTo(1 / 3)
    expect(pace(500, 1, b, 180, 0).elapsedFraction).toBe(1)
  })
  it('does not fail for an index past the end', () => {
    expect(pace(0, 9, b, 180, 0).status).toBeDefined()
  })
})
