/**
 * The three account types.
 *
 * Every type keeps the deck tools; the type only decides which extra area the
 * rail offers — Classroom for a teacher, My classes for a student. Chosen at
 * sign-up, with no verification that a teacher is one, and **permanent**
 * afterwards: the database pins the column (migration 0010). The single
 * exception is General → Student, which happens when a General account joins
 * a class, and only inside `join_class`.
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

/**
 * Whether an account of `role` may open a page reserved for `required` — one
 * type, or any of a list. The list form exists for the join page, which is
 * open to General as well as Student because joining is what promotes the one
 * into the other.
 */
export function canAccess(role: Role, required: Role | readonly Role[]): boolean {
  return Array.isArray(required) ? required.includes(role) : role === required
}
