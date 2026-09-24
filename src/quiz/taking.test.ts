import { describe, expect, it } from 'vitest'
import { allAnswered, buildAnswers, defaultClassId, isAnswered } from './taking'

describe('isAnswered', () => {
  it('treats index 0 and false as answers', () => {
    expect(isAnswered(0)).toBe(true)
    expect(isAnswered(false)).toBe(true)
    expect(isAnswered(true)).toBe(true)
  })
  it('treats missing, empty and whitespace-only text as unanswered', () => {
    expect(isAnswered(undefined)).toBe(false)
    expect(isAnswered('')).toBe(false)
    expect(isAnswered('   \n')).toBe(false)
    expect(isAnswered(' atom ')).toBe(true)
  })
})

describe('allAnswered', () => {
  const qs = [{ id: 'a' }, { id: 'b' }]
  it('needs every question answered', () => {
    expect(allAnswered(qs, { a: 0 })).toBe(false)
    expect(allAnswered(qs, { a: 0, b: '  ' })).toBe(false)
    expect(allAnswered(qs, { a: 0, b: 'x' })).toBe(true)
  })
  it('is false for a quiz with no questions', () => {
    expect(allAnswered([], {})).toBe(false)
  })
})

describe('buildAnswers', () => {
  it('keeps only known question ids', () => {
    expect(buildAnswers([{ id: 'a' }], { a: false, stale: 3 })).toEqual({ a: false })
  })
})

describe('defaultClassId', () => {
  it('prefers the first class not yet attempted', () => {
    expect(
      defaultClassId([
        { id: '1', attempted: true },
        { id: '2', attempted: false },
        { id: '3', attempted: false },
      ]),
    ).toBe('2')
  })
  it('falls back to the first class, or null', () => {
    expect(defaultClassId([{ id: '1', attempted: true }, { id: '2', attempted: true }])).toBe('1')
    expect(defaultClassId([])).toBeNull()
  })
})
