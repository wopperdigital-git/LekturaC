/**
 * The three account types.
 *
 * Every type keeps the deck tools; the type only decides which extra area the
 * rail offers — Classroom for a teacher, My classes for a student. Chosen at
 * sign-up and changeable later, with no verification that a teacher is one.
 */
export type Role = 'general' | 'teacher' | 'student'

export const ROLES: readonly Role[] = ['general', 'teacher', 'student']

export const ROLE_LABEL: Record<Role, string> = {
  general: 'General',
  teacher: 'Teacher',
  student: 'Student',
}

export const ROLE_HINT: Record<Role, string> = {
  general: 'Create and present decks.',
  teacher: 'Decks, plus classes, students and quizzes.',
  student: "Decks, plus joining your teachers' classes.",
}

export function parseRole(value: unknown): Role | null {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value)
    ? (value as Role)
    : null
}

/** Whether an account of `role` may open a page reserved for `required`. */
export function canAccess(role: Role, required: Role): boolean {
  return role === required
}
