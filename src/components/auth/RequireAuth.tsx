import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'

/**
 * `signedOutTo` is where a signed-out visitor goes: /login by default; the
 * root route sends them to the public landing page instead.
 */
export function RequireAuth({ children, signedOutTo = '/login' }: { children: ReactNode; signedOutTo?: string }) {
  const status = useAuthStore((s) => s.status)

  if (status === 'loading') {
    return <div className="p-8 text-app-muted">Loading…</div>
  }
  if (status === 'unauthenticated') {
    return <Navigate to={signedOutTo} replace />
  }
  return <>{children}</>
}
