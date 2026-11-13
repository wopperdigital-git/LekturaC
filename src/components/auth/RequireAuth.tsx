import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'

/**
 * `signedOutTo` is where a signed-out visitor goes: /login by default; the
 * root route sends them to the public landing page instead.
 *
 * An admin account is for admin work only, so every signed-in page except the
 * one marked `adminPage` sends it to /admin (decks, drafts, videos, classroom,
 * quizzes and lessons included).
 */
export function RequireAuth({
  children,
  signedOutTo = '/login',
  adminPage = false,
}: {
  children: ReactNode
  signedOutTo?: string
  adminPage?: boolean
}) {
  const status = useAuthStore((s) => s.status)
  const isAdmin = useAuthStore((s) => s.isAdmin)

  if (status === 'loading') {
    return <div className="p-8 text-app-muted">Loading…</div>
  }
  if (status === 'unauthenticated') {
    return <Navigate to={signedOutTo} replace />
  }
  if (isAdmin && !adminPage) {
    return <Navigate to="/admin" replace />
  }
  return <>{children}</>
}
