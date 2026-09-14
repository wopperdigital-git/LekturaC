/*
  Must match generate_join_code() in migration 0009 exactly. The alphabet leaves
  out 0/O, 1/I and L because codes are read off a projector and typed by hand.
*/
export const JOIN_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const JOIN_CODE_LENGTH = 6

export function normalizeJoinCode(input: string): string {
  return input.replace(/\s+/g, '').toUpperCase()
}

/** Why a typed code cannot be right, checked before asking the server. `null` when it could be. */
export function joinCodeProblem(input: string): string | null {
  const code = normalizeJoinCode(input)
  if (!code) return 'Enter the code your teacher gave you.'
  if (code.length !== JOIN_CODE_LENGTH) return `Class codes are ${JOIN_CODE_LENGTH} characters.`
  if ([...code].some((ch) => !JOIN_CODE_ALPHABET.includes(ch))) {
    return "That isn't a valid class code. Codes never use 0, O, 1, I or L — check for a lookalike."
  }
  return null
}
