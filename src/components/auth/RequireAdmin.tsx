import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'

/**
 * Guards /admin. Always nested inside `RequireAuth`, which has already read
 * the admin flag with the profile. A non-admin is sent home, like
 * `RequireRole`. The page's data is protected by `admin_overview()` refusing
 * non-admins, not by this guard.
 */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const isAdmin = useAuthStore((s) => s.isAdmin)
  if (!isAdmin) return <Navigate to="/" replace />
  return <>{children}</>
}
