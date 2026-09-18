import { describe, expect, it } from 'vitest'
import { canAccess, parseRole, ROLES } from './roles'

describe('parseRole', () => {
  it('accepts the three account types', () => {
    for (const role of ROLES) expect(parseRole(role)).toBe(role)
  })

  it('rejects anything else, including near-misses a hand-edited row might hold', () => {
    expect(parseRole('Teacher')).toBeNull()
    expect(parseRole('admin')).toBeNull()
    expect(parseRole('')).toBeNull()
    expect(parseRole(null)).toBeNull()
    expect(parseRole(3)).toBeNull()
  })
})

describe('canAccess', () => {
  it('lets only the matching account type in', () => {
    expect(canAccess('teacher', 'teacher')).toBe(true)
    expect(canAccess('student', 'student')).toBe(true)
    expect(canAccess('student', 'teacher')).toBe(false)
    expect(canAccess('general', 'teacher')).toBe(false)
    expect(canAccess('teacher', 'student')).toBe(false)
  })

  // The join page is open to General as well as Student, since joining is what
  // turns the first into the second. A teacher still has no business there.
  it('accepts a list of permitted types', () => {
    expect(canAccess('general', ['general', 'student'])).toBe(true)
    expect(canAccess('student', ['general', 'student'])).toBe(true)
    expect(canAccess('teacher', ['general', 'student'])).toBe(false)
  })

  it('admits nobody for an empty list, rather than everybody', () => {
    expect(canAccess('teacher', [])).toBe(false)
    expect(canAccess('general', [])).toBe(false)
  })
})
