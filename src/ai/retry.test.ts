import { afterEach, describe, expect, it, vi } from 'vitest'
import { BASE_DELAY_MS, MAX_DELAY_MS, backoffDelayMs, sleep } from './retry'

describe('backoffDelayMs', () => {
  // Two cases below pin the clock to test the HTTP-date form; without this the
  // fake timers leak into everything that runs after them.
  afterEach(() => {
    vi.useRealTimers()
  })

  it('doubles each attempt when no Retry-After is sent', () => {
    expect(backoffDelayMs(0, null)).toBe(BASE_DELAY_MS)
    expect(backoffDelayMs(1, null)).toBe(BASE_DELAY_MS * 2)
    expect(backoffDelayMs(2, null)).toBe(BASE_DELAY_MS * 4)
  })

  it('treats a missing header the same as an absent one', () => {
    expect(backoffDelayMs(1)).toBe(BASE_DELAY_MS * 2)
    expect(backoffDelayMs(1, '')).toBe(BASE_DELAY_MS * 2)
    expect(backoffDelayMs(1, '   ')).toBe(BASE_DELAY_MS * 2)
  })

  it('honours a Retry-After in seconds when it asks for longer', () => {
    // attempt 0 would back off 1s on its own; the server wants 5s
    expect(backoffDelayMs(0, '5')).toBe(5000)
  })

  it('never lets Retry-After shorten the exponential wait', () => {
    // attempt 2 backs off 4s; a server asking for 1s must not undercut it
    expect(backoffDelayMs(2, '1')).toBe(BASE_DELAY_MS * 4)
  })

  it('clamps a long Retry-After rather than obeying it', () => {
    // Groq can ask for the remainder of its 60s TPM window; a minute of dead
    // air under a spinner reads as a hang, so the wait is capped instead.
    expect(backoffDelayMs(0, '60')).toBe(MAX_DELAY_MS)
  })

  it('parses the HTTP-date form of Retry-After', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    expect(backoffDelayMs(0, new Date('2026-01-01T00:00:08Z').toUTCString())).toBe(8000)
  })

  it('does not produce a negative wait from a date already past', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:30Z'))
    // date is in the past -> 0, so the exponential step wins
    expect(backoffDelayMs(1, new Date('2026-01-01T00:00:00Z').toUTCString())).toBe(BASE_DELAY_MS * 2)
  })

  it('falls back to exponential on an unparseable header', () => {
    expect(backoffDelayMs(1, 'soon')).toBe(BASE_DELAY_MS * 2)
    expect(backoffDelayMs(1, '-5')).toBe(BASE_DELAY_MS * 2)
  })
})

describe('sleep', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('rejects immediately when the signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(sleep(1000, controller.signal)).rejects.toThrow(/abort/i)
  })

  // The whole point of the abortable delay: Cancel takes effect mid-backoff
  // rather than waiting the timer out.
  it('rejects when aborted partway through the wait', async () => {
    const controller = new AbortController()
    const pending = sleep(10_000, controller.signal)
    const assertion = expect(pending).rejects.toThrow(/abort/i)
    controller.abort()
    await assertion
  })

  it('resolves normally when never aborted', async () => {
    vi.useFakeTimers()
    const pending = sleep(1000)
    vi.advanceTimersByTime(1000)
    await expect(pending).resolves.toBeUndefined()
  })
})
