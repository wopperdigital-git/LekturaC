import { describe, expect, it } from 'vitest'
import { resolveProfile } from './profile'

/*
  The fallback is the point: an account whose profile cannot be read must land
  on exactly today's app (General), never on a locked screen. An un-migrated
  database is the common way to get here.
*/
describe('resolveProfile', () => {
  it('reads a well-formed row', () => {
    expect(resolveProfile({ role: 'teacher', display_name: 'Tess' }, null)).toEqual({
      profile: { role: 'teacher', displayName: 'Tess' },
      degraded: false,
    })
  })

  it('falls back to general when the read failed', () => {
    expect(resolveProfile(null, { message: 'relation "profiles" does not exist' })).toEqual({
      profile: { role: 'general', displayName: '' },
      degraded: true,
    })
  })

  it('falls back to general when the account has no row', () => {
    expect(resolveProfile(null, null)).toEqual({
      profile: { role: 'general', displayName: '' },
      degraded: true,
    })
  })

  it('falls back to general on an unknown role but keeps the name', () => {
    expect(resolveProfile({ role: 'admin', display_name: 'Ada' }, null)).toEqual({
      profile: { role: 'general', displayName: 'Ada' },
      degraded: true,
    })
  })

  it('treats a non-string name as empty', () => {
    expect(resolveProfile({ role: 'student', display_name: null }, null).profile.displayName).toBe('')
  })
})
