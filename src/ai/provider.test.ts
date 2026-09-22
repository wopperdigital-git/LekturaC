import { describe, expect, it } from 'vitest'
import { kindForStatus } from './provider'

describe('kindForStatus', () => {
  it.each([429, 503])('classifies %i as capacity', (status) => {
    expect(kindForStatus(status)).toBe('capacity')
  })

  // 413 ("payload too large") is a capacity failure on the size axis rather
  // than the rate axis: the request overflowed this provider's window, which
  // is exactly the kind of failure a different provider can plausibly serve —
  // so it must fail over the same way 429/503 do.
  it('classifies 413 as capacity', () => {
    expect(kindForStatus(413)).toBe('capacity')
  })

  // 529 ("overloaded") is Anthropic's own capacity signal, added alongside
  // AnthropicProvider — same failover reasoning as 429/503/413.
  it('classifies 529 as capacity', () => {
    expect(kindForStatus(529)).toBe('capacity')
  })

  it.each([401, 403])('classifies %i as auth', (status) => {
    expect(kindForStatus(status)).toBe('auth')
  })

  it.each([400, 404, 422])('classifies other 4xx as request', (status) => {
    expect(kindForStatus(status)).toBe('request')
  })

  it.each([500, 502])('classifies 5xx other than 503 as unknown', (status) => {
    expect(kindForStatus(status)).toBe('unknown')
  })
})
