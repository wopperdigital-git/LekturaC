import { JOIN_CODE_ALPHABET } from '@/classroom/joinCode'

/*
  Must match generate_quiz_code() in migration 0012. Same alphabet as class
  join codes (no 0/O, 1/I, L) because codes are read off a projector and typed
  by hand; longer (8) because a quiz code, unlike a class code, is not
  re-issued and is worth being harder to guess.
*/
export const QUIZ_CODE_ALPHABET = JOIN_CODE_ALPHABET
export const QUIZ_CODE_LENGTH = 8

export function normalizeQuizCode(input: string): string {
  return input.replace(/\s+/g, '').toUpperCase()
}

/** Why a typed code cannot be right, checked before asking the server. `null` when it could be. */
export function quizCodeProblem(input: string): string | null {
  const code = normalizeQuizCode(input)
  if (!code) return 'Enter the quiz code your teacher gave you.'
  if (code.length !== QUIZ_CODE_LENGTH) return `Quiz codes are ${QUIZ_CODE_LENGTH} characters.`
  if (code.split('').some((ch) => !QUIZ_CODE_ALPHABET.includes(ch))) {
    return "That isn't a valid quiz code. Codes never use 0, O, 1, I or L — check for a lookalike."
  }
  return null
}
