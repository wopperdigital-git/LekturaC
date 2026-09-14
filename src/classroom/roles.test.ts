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
})
