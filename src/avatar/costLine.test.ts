import { describe, expect, it } from 'vitest'
import { clipSeconds, faceCostLine } from './costLine'

// 150 words per minute: 25 words is 10 s, 5 words is 2 s (billed as the 3 s minimum).
const words = (n: number) => Array.from({ length: n }, () => 'word').join(' ')

describe('faceCostLine', () => {
  it('prices both clips and waits for the longer one', () => {
    // 10 s and 5 s: $0.30 + $0.15 = $0.45; wait for the 10 s clip, 10 to 30 s per second = 2 to 5 min.
    expect(faceCostLine(words(25), words(12))).toBe(
      'Adds about 2–5 min and $0.45 (WaveSpeed). It still bills if you cancel.',
    )
  })

  it('counts only the box that has words', () => {
    // 25 words is 10 s: $0.30.
    expect(faceCostLine(words(25), '')).toContain('$0.30')
    expect(faceCostLine('   ', words(25))).toContain('$0.30')
  })

  it('bills the 3 s minimum for a very short clip', () => {
    // One word rounds to 0 s of speech, but a clip still exists and costs $0.09.
    expect(faceCostLine('Hi', '')).toContain('$0.09')
  })

  it('has nothing to say when both boxes are empty', () => {
    expect(faceCostLine('', '  ')).toBeNull()
  })
})

describe('clipSeconds', () => {
  it('is at least a second for a box with words, and nothing for a blank one', () => {
    expect(clipSeconds('Hi')).toBe(1)
    expect(clipSeconds('  ')).toBe(0)
    expect(clipSeconds('')).toBe(0)
    expect(clipSeconds(words(25))).toBe(10)
  })
})
