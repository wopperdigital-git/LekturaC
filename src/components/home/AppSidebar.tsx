import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { LogoSlot } from '@/components/ui/LogoSlot'
import { ThemeToggle } from '@/components/ui/ThemeToggle'

/**
 * The dashboard's dark rail.
 *
 * Like `AuthVisualPanel`, this is deliberately **always dark** and does not
 * follow the app light/dark toggle: the whole layout is built around a dark
 * rail sitting against light content, and flipping it in light mode would
 * collapse that contrast. The `app-*` tokens are therefore not used inside
 * here — white-alpha values are, so the rail reads the same in both modes.
 *
 * Below `lg` it becomes an off-canvas drawer driven by `open`/`onClose`
 * rather than a second, duplicated mobile header.
 */
const SIDEBAR_BG = '#0c0c0e'

const isMac =
  typeof navigator !== 'undefined' && /mac/i.test(navigator.platform || navigator.userAgent)

function OverviewIcon() {
  return (
    <svg
      className="size-4"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="2" width="5" height="5" rx="1.2" />
      <rect x="9" y="2" width="5" height="5" rx="1.2" />
      <rect x="2" y="9" width="5" height="5" rx="1.2" />
      <rect x="9" y="9" width="5" height="5" rx="1.2" />
    </svg>
  )
}

function PlaceholderIcon() {
  return (
    <svg
      className="size-4"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 4.5A1.5 1.5 0 013.5 3h2.2l1.2 1.6h5.6A1.5 1.5 0 0114 6.1v6.4a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 12.5z" />
    </svg>
  )
}

/**
 * Section heading for a group of nav links. Exported ready-to-use so the nav
 * slot below can be filled in without re-deriving the styling.
 */
export function SidebarSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mt-7 first:mt-0">
      <div className="px-3 pb-2 text-[11px] font-medium tracking-[0.14em] text-white/35 uppercase">
        {label}
      </div>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  )
}

/** A single nav row — icon, label, optional count badge, optional active state. */
export function SidebarLink({
  icon,
  label,
  badge,
  active = false,
  onClick,
}: {
  icon?: ReactNode
  label: string
  badge?: ReactNode
  active?: boolean
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`flex w-full cursor-pointer items-center gap-3 rounded-app-sm px-3 py-2 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/50 ${
        active
          ? 'bg-app-accent font-medium text-app-accent-foreground'
          : 'text-white/70 hover:bg-white/6 hover:text-white'
      }`}
    >
      {icon && <span className="grid size-4 shrink-0 place-items-center">{icon}</span>}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {badge !== undefined && (
        <span className="grid min-w-5 shrink-0 place-items-center rounded bg-white/10 px-1 text-[11px] text-white/60">
          {badge}
        </span>
      )}
    </button>
  )
}

export function AppSidebar({
  query,
  onQueryChange,
  email,
  onSignOut,
  open,
  onClose,
}: {
  query: string
  onQueryChange: (value: string) => void
  email?: string
  onSignOut: () => void
  open: boolean
  onClose: () => void
}) {
  const searchRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const { pathname } = useLocation()

  // the ⌘F / Ctrl+F chip in the field has to actually do something, so take over
  // the browser's find shortcut while the dashboard is open
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key.toLowerCase() === 'f' && (isMac ? e.metaKey : e.ctrlKey)) {
        e.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <>
      {/* drawer backdrop — mobile only, since the rail is static from lg up */}
      {open && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={onClose}
          className="fixed inset-0 z-30 cursor-default bg-black/50 lg:hidden"
        />
      )}

      <aside
        style={{ background: SIDEBAR_BG }}
        className={`fixed inset-y-0 left-0 z-40 flex w-[264px] shrink-0 flex-col border-r border-white/8 transition-transform duration-200 lg:static lg:translate-x-0 ${
          // `invisible` while closed so the offscreen rail can't take tab focus
          open ? 'translate-x-0' : 'invisible -translate-x-full lg:visible'
        }`}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-4">
          <LogoSlot onDark />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="grid size-8 cursor-pointer place-items-center rounded-app-sm text-white/50 transition-colors hover:bg-white/8 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/50 lg:hidden"
          >
            <svg
              className="size-4"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>

        <div className="px-4">
          <div className="relative">
            <svg
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-white/40"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <circle cx="7.2" cy="7.2" r="4.6" />
              <path d="M10.6 10.6L14 14" />
            </svg>
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="Search"
              aria-label="Search presentations"
              className="w-full rounded-app-sm border border-white/10 bg-white/5 py-2.5 pr-14 pl-9 text-sm text-white outline-none transition-colors duration-150 placeholder:text-white/35 focus:border-white/25 focus:bg-white/8 [&::-webkit-search-cancel-button]:hidden"
            />
            <kbd
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 rounded border border-white/12 bg-white/5 px-1.5 py-0.5 font-app text-[10px] font-medium text-white/40"
            >
              {isMac ? '⌘F' : 'Ctrl F'}
            </kbd>
          </div>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto px-4 py-6">
          <SidebarSection label="Workspace">
            <SidebarLink
              label="Overview"
              icon={<OverviewIcon />}
              active={pathname === '/'}
              onClick={() => {
                void navigate('/')
                onClose()
              }}
            />
            {/* placeholder rung — no destination wired up yet */}
            <SidebarLink label="Nav 2" icon={<PlaceholderIcon />} />
          </SidebarSection>

          {/*
            More groups go here. `SidebarSection` and `SidebarLink` are exported
            from this file and already carry the rail's styling, so a group is:

              <SidebarSection label="Team">
                <SidebarLink label="Members" icon={<YourIcon />} badge={8} />
              </SidebarSection>
          */}
        </nav>

        <div className="mt-auto border-t border-white/8 p-4">
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="grid size-8 shrink-0 place-items-center rounded-full bg-app-highlight text-sm font-semibold text-app-highlight-foreground"
            >
              {email?.charAt(0).toUpperCase() ?? '?'}
            </span>
            <div className="flex min-w-0 flex-1 flex-col text-xs">
              {email && <span className="truncate text-white/80">{email}</span>}
              <button
                type="button"
                onClick={onSignOut}
                className="cursor-pointer self-start rounded text-white/45 transition-colors hover:text-white hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/50"
              >
                Log out
              </button>
            </div>
            <ThemeToggle onDark className="size-8 shrink-0" />
          </div>
        </div>
      </aside>
    </>
  )
}
