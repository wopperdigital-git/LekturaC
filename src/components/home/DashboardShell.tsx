import { useState, type ReactNode } from 'react'
import { useAuthStore } from '@/store/authStore'
import { RubricRule } from '@/components/ui/Rubric'
import { AppSidebar } from './AppSidebar'

/**
 * The frame every dashboard page shares: the dark rail (an off-canvas drawer
 * below `lg`), the mobile menu button, and the title block above the page's
 * own content.
 *
 * Extracted before the classroom pages were added, because HomePage and
 * DraftsPage each assembled this by hand and six more copies would drift.
 * Search is the page's: the rail's field searches whatever the page filters.
 */
export function DashboardShell({
  title,
  subtitle,
  query,
  onQueryChange,
  children,
}: {
  title: ReactNode
  subtitle?: ReactNode
  /** Omit both on a page with nothing to filter: the rail then shows no search field. */
  query?: string
  onQueryChange?: (value: string) => void
  children: ReactNode
}) {
  const user = useAuthStore((s) => s.user)
  const signOut = useAuthStore((s) => s.signOut)
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden bg-app-canvas">
      <AppSidebar
        query={query}
        onQueryChange={onQueryChange}
        email={user?.email}
        onSignOut={() => void signOut()}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
      />

      <main className="scrollbar-subtle min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-8 lg:px-10">
          <div className="mb-6 flex items-start gap-3">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
              className="mt-1 grid size-9 shrink-0 cursor-pointer place-items-center rounded-app-sm border border-app-border bg-app-background text-app-foreground transition-colors hover:bg-app-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent lg:hidden"
            >
              <svg
                className="size-4"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M2.5 4h11M2.5 8h11M2.5 12h11" />
              </svg>
            </button>

            <div className="min-w-0 flex-1">
              <h1 className="text-[2rem] leading-tight font-semibold tracking-[-0.015em] text-app-foreground sm:text-[2.5rem]">
                {title}
              </h1>
              {subtitle && <p className="mt-1.5 text-base text-app-muted italic">{subtitle}</p>}
              <RubricRule className="mt-5" />
            </div>
          </div>

          {children}
        </div>
      </main>
    </div>
  )
}
