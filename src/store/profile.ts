import { parseRole, type Role } from '@/classroom/roles'

export interface AccountProfile {
  role: Role
  displayName: string
}

const FALLBACK_ROLE: Role = 'general'

/**
 * A `profiles` row (or the failure to read one) as the profile the app runs on.
 *
 * Anything unusable — a read error, no row, a role this build does not know —
 * resolves to General, which is exactly the app as it was before account types
 * existed. `degraded` tells the caller to log it; this stays pure so the rule
 * is testable.
 */
export function resolveProfile(
  row: { role?: unknown; display_name?: unknown } | null | undefined,
  error: unknown,
): { profile: AccountProfile; degraded: boolean } {
  if (error || !row) {
    return { profile: { role: FALLBACK_ROLE, displayName: '' }, degraded: true }
  }
  const displayName = typeof row.display_name === 'string' ? row.display_name : ''
  const role = parseRole(row.role)
  if (!role) return { profile: { role: FALLBACK_ROLE, displayName }, degraded: true }
  return { profile: { role, displayName }, degraded: false }
}
