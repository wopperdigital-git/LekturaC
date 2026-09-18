import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { canAccess, type Role } from '@/classroom/roles'

/**
 * Guards a page reserved for one account type. Always nested inside
 * `RequireAuth`, which has already waited for the profile to resolve.
 *
 * The wrong type is sent home rather than shown an error — nothing is broken,
 * the page just isn't theirs.
 */
export function RequireRole({
  role,
  children,
}: {
  role: Role | readonly Role[]
  children: ReactNode
}) {
  const current = useAuthStore((s) => s.profile?.role ?? 'general')
  if (!canAccess(current, role)) return <Navigate to="/" replace />
  return <>{children}</>
}
