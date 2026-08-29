import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabaseClient', () => ({
  supabaseConfigured: false,
  supabase: null,
  ensureSession: () => Promise.resolve(),
}))

const { describeError } = await import('./presentationStore')

/*
  The banner that reports a failed save is the only place a user learns their
  work is not reaching the server, and it spent its first outing saying
  "[object Object]" — because every error this store actually produces is a
  Supabase rejection, which is a plain object rather than an `Error`. The one
  message that names the cause was the one message being thrown away.
*/
describe('describeError', () => {
  it('reads a Supabase rejection, keeping the code worth searching for', () => {
    expect(
      describeError({
        message: "Could not find the 'adjusts' column of 'cards' in the schema cache",
        details: null,
        hint: null,
        code: 'PGRST204',
      }),
    ).toBe("Could not find the 'adjusts' column of 'cards' in the schema cache (PGRST204)")
  })

  it('keeps the hint, which is where PostgREST usually puts the fix', () => {
    expect(
      describeError({ message: 'permission denied', hint: 'Check the RLS policy', code: '42501' }),
    ).toBe('permission denied — Check the RLS policy (42501)')
  })

  it('uses an Error message as-is', () => {
    expect(describeError(new Error('Network request failed'))).toBe('Network request failed')
  })

  it('never falls back to [object Object]', () => {
    for (const value of [{}, { status: 500 }, { message: '' }, [], null, undefined, 42]) {
      expect(describeError(value)).not.toContain('[object Object]')
    }
  })

  it('shows an unreadable object rather than hiding it', () => {
    expect(describeError({ status: 500 })).toBe('{"status":500}')
  })
})
