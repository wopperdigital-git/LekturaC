import { describe, expect, it } from 'vitest'
import { formatDuration, speakingSeconds, wordCount } from './speakingTime'

describe('wordCount', () => {
  it('counts plain words', () => {
    expect(wordCount('one two three')).toBe(3)
  })

  it('is zero for blank and whitespace-only text', () => {
    expect(wordCount('')).toBe(0)
    expect(wordCount('   \n  ')).toBe(0)
  })

  it('collapses runs of whitespace rather than counting empty strings', () => {
    expect(wordCount('  one   two \n three  ')).toBe(3)
  })

  it('counts a hyphenated or punctuated word once', () => {
    expect(wordCount('well-known, yes: it is.')).toBe(4)
  })
})

describe('speakingSeconds', () => {
  it('is zero for an empty script', () => {
    expect(speakingSeconds('')).toBe(0)
  })

  /* 150 words per minute, so 150 words is a minute exactly. */
  it('reads 150 words in 60 seconds', () => {
    expect(speakingSeconds(Array(150).fill('word').join(' '))).toBe(60)
  })

  it('reads 75 words in 30 seconds', () => {
    expect(speakingSeconds(Array(75).fill('word').join(' '))).toBe(30)
  })
})

describe('formatDuration', () => {
  it('shows seconds alone under a minute', () => {
    expect(formatDuration(38)).toBe('38s')
  })

  it('shows minutes and zero-padded seconds at or over a minute', () => {
    expect(formatDuration(60)).toBe('1m 00s')
    expect(formatDuration(95)).toBe('1m 35s')
  })
})
