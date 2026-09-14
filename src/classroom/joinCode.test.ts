import { describe, expect, it } from 'vitest'
import { JOIN_CODE_ALPHABET, joinCodeProblem, normalizeJoinCode } from './joinCode'

describe('normalizeJoinCode', () => {
  it('uppercases and strips every kind of whitespace, so a pasted code just works', () => {
    expect(normalizeJoinCode(' qw ert9\n')).toBe('QWERT9')
  })
})

describe('joinCodeProblem', () => {
  it('accepts a well-formed code in any case', () => {
    expect(joinCodeProblem('qwert9')).toBeNull()
  })

  it('asks for a code when the field is empty', () => {
    expect(joinCodeProblem('   ')).toBe('Enter the code your teacher gave you.')
  })

  it('rejects the wrong length', () => {
    expect(joinCodeProblem('QWERT')).toBe('Class codes are 6 characters.')
    expect(joinCodeProblem('QWERT99')).toBe('Class codes are 6 characters.')
  })

  it('rejects the lookalike characters codes never contain', () => {
    for (const lookalike of ['0', 'O', '1', 'I', 'L']) {
      expect(JOIN_CODE_ALPHABET).not.toContain(lookalike)
      expect(joinCodeProblem(`QWER${lookalike}9`)).toMatch(/never use/)
    }
  })
})
