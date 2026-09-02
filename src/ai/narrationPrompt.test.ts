import { describe, expect, it } from 'vitest'
import { narrationMaxTokens } from './narrationPrompt'

describe('narrationMaxTokens', () => {
  /*
    `gpt-oss-120b` reasons before it answers — 3400 reasoning tokens were
    measured on an 8-slide deck. A budget under that returns an empty
    completion and a json_validate_failed 400, not a shorter script.
  */
  it('always clears the measured reasoning overhead, even for one slide', () => {
    expect(narrationMaxTokens(1)).toBeGreaterThan(3400)
  })

  it('gives a small deck room for reasoning plus its scripts', () => {
    expect(narrationMaxTokens(8)).toBeGreaterThanOrEqual(4600)
  })

  /*
    Groq's free tier advertises x-ratelimit-limit-tokens: 8000 per minute and
    counts requested output against it, so a request for more than the window
    is refused before the model runs.
  */
  it('never asks for more than Groq’s free-tier per-minute window', () => {
    expect(narrationMaxTokens(30)).toBeLessThanOrEqual(7000)
    expect(narrationMaxTokens(1000)).toBeLessThanOrEqual(7000)
  })

  it('grows with slide count between the bounds', () => {
    expect(narrationMaxTokens(20)).toBeGreaterThan(narrationMaxTokens(8))
  })
})
