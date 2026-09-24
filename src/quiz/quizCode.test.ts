import { describe, expect, it } from 'vitest'
import { JOIN_CODE_ALPHABET } from '@/classroom/joinCode'
import { QUIZ_CODE_ALPHABET, QUIZ_CODE_LENGTH, normalizeQuizCode, quizCodeProblem } from './quizCode'

describe('quiz codes', () => {
  it('uses the class-code alphabet (must match generate_quiz_code() in migration 0012)', () => {
    expect(QUIZ_CODE_ALPHABET).toBe(JOIN_CODE_ALPHABET)
    expect(QUIZ_CODE_ALPHABET).toBe('ABCDEFGHJKMNPQRSTUVWXYZ23456789')
    expect(QUIZ_CODE_LENGTH).toBe(8)
  })

  it('normalises whitespace and case', () => {
    expect(normalizeQuizCode(' ab cd 23 xy ')).toBe('ABCD23XY')
  })

  it('explains why a code cannot be right', () => {
    expect(quizCodeProblem('')).toMatch(/enter/i)
    expect(quizCodeProblem('ABC')).toMatch(/8 characters/)
    expect(quizCodeProblem('ABCD23X0')).toMatch(/lookalike/)
    expect(quizCodeProblem('ABCD23XY')).toBeNull()
  })
})
