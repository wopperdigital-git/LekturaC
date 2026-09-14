import { describe, expect, it } from 'vitest'
import { describeTrend, formatCompletion, formatPercent, matchesQuery, personLabel, plural } from './format'

describe('formatPercent', () => {
  it('shows a dash, not 0%, when there is nothing to average', () => {
    expect(formatPercent(null)).toBe('—')
  })

  it('rounds to a whole percent', () => {
    expect(formatPercent(0.826)).toBe('83%')
    expect(formatPercent(0)).toBe('0%')
    expect(formatPercent(1)).toBe('100%')
  })
})

describe('formatCompletion', () => {
  it('shows a dash when nothing was expected', () => {
    expect(formatCompletion({ expected: 0, submitted: 0 })).toBe('—')
  })

  it('shows submitted out of expected', () => {
    expect(formatCompletion({ expected: 9, submitted: 7 })).toBe('7 / 9')
  })
})

describe('personLabel', () => {
  const person = { id: 'p', displayName: '', email: '' }

  it('prefers the display name', () => {
    expect(personLabel({ ...person, displayName: ' Sam ', email: 'sam@x.test' })).toBe('Sam')
  })

  it('falls back to the email, then to a placeholder', () => {
    expect(personLabel({ ...person, email: 'sam@x.test' })).toBe('sam@x.test')
    expect(personLabel(person)).toBe('Unnamed account')
  })
})

describe('matchesQuery', () => {
  it('matches everything on a blank query', () => {
    expect(matchesQuery('  ', 'anything')).toBe(true)
  })

  it('matches any field, case-insensitively', () => {
    expect(matchesQuery('BIO', 'Chemistry', 'Biology')).toBe(true)
    expect(matchesQuery('physics', 'Chemistry', 'Biology')).toBe(false)
  })
})

describe('describeTrend', () => {
  it('says so when there are too few scores', () => {
    expect(describeTrend({ kind: 'insufficient' })).toBe('Not enough data')
  })

  it('reports direction and size in percentage points', () => {
    expect(describeTrend({ kind: 'trend', direction: 'improving', delta: 0.083 })).toBe('Improving (+8 pts)')
    expect(describeTrend({ kind: 'trend', direction: 'slipping', delta: -0.06 })).toBe('Slipping (−6 pts)')
    expect(describeTrend({ kind: 'trend', direction: 'steady', delta: 0.01 })).toBe('Steady')
  })
})

describe('plural', () => {
  it('picks the form by count', () => {
    expect(plural(1, 'student')).toBe('1 student')
    expect(plural(0, 'student')).toBe('0 students')
    expect(plural(2, 'quiz', 'quizzes')).toBe('2 quizzes')
  })
})
