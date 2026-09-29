import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { LogoSlot } from '@/components/ui/LogoSlot'
import { useDrafts } from '@/lib/briefDrafts'
import { useAuthStore } from '@/store/authStore'
import { useMyClasses } from '@/classroom/useMyClasses'
import { ROLE_LABEL } from '@/classroom/roles'
import { SettingsModal } from '@/components/settings/SettingsModal'

/**
 * The dashboard navigation rail, adapting seamlessly to light and dark themes.
 *
 * Below `lg` it becomes an off-canvas drawer driven by `open`/`onClose`
 * rather than a second, duplicated mobile header.
 */


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

function DraftsIcon() {
  return (
    <svg
      className="size-4"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8.8 2H4.5A1.5 1.5 0 003 3.5v9A1.5 1.5 0 004.5 14h7a1.5 1.5 0 001.5-1.5V8" />
      <path d="M11.4 1.9l2 2-4.2 4.2-2.4.4.4-2.4z" />
    </svg>
  )
}

function ClassesIcon() {
  return (
    <svg className="size-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 4.5A1.5 1.5 0 013.5 3h3l1.5 1.5h4.5A1.5 1.5 0 0114 6v5.5a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 11.5z" />
    </svg>
  )
}

function StudentsIcon() {
  return (
    <svg className="size-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
      <circle cx="6" cy="5.5" r="2.5" />
      <path d="M1.8 13.5c.6-2.3 2.2-3.5 4.2-3.5s3.6 1.2 4.2 3.5" />
      <path d="M10.5 3.2a2.4 2.4 0 010 4.6M12 10.2c1.1.5 1.8 1.6 2.2 3.3" />
    </svg>
  )
}

function QuizzesIcon() {
  return (
    <svg className="size-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="2" width="10" height="12" rx="1.5" />
      <path d="M5.5 6l1 1 2-2M5.5 10.5l1 1 2-2M10 6.2h.5M10 10.7h.5" />
    </svg>
  )
}

function JoinIcon() {
  return (
    <svg className="size-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
      <circle cx="8" cy="8" r="6" />
      <path d="M8 5.2v5.6M5.2 8h5.6" />
    </svg>
  )
}

export function SettingsIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  )
}

/** How many classes the student rail lists by name before "All classes". */
const RAIL_CLASS_LIMIT = 5

/**
 * Section heading for a group of nav links. Exported ready-to-use so the nav
 * slot below can be filled in without re-deriving the styling.
 */
export function SidebarSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mt-7 first:mt-0">
      <div className="px-3 pb-2 text-[11px] font-semibold tracking-[0.14em] text-app-muted uppercase">
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
      className={`group flex w-full cursor-pointer items-center gap-3 rounded-app-sm px-3 py-2 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent ${
        active
          ? 'bg-app-accent font-medium text-app-accent-foreground shadow-2xs'
          : 'text-app-muted hover:bg-app-surface hover:text-app-foreground'
      }`}
    >
      {icon && (
        <span
          className={`grid size-4 shrink-0 place-items-center transition-colors ${
            active ? 'text-app-accent-foreground' : 'text-app-muted group-hover:text-app-foreground'
          }`}
        >
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {badge !== undefined && (
        <span
          className={`grid min-w-5 shrink-0 place-items-center rounded px-1 text-[11px] font-medium tabular-nums ${
            active
              ? 'bg-app-accent-foreground/20 text-app-accent-foreground'
              : 'border border-app-border bg-app-surface text-app-muted'
          }`}
        >
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

  // Read here rather than passed in, so the badge stays right on every page
  // that renders the rail without each one having to thread the count through.
  const draftCount = useDrafts().length

  const profile = useAuthStore((s) => s.profile)
  const userId = useAuthStore((s) => s.user?.id ?? null)
  const profileDegraded = useAuthStore((s) => s.profileDegraded)
  const role = profile?.role ?? 'general'
  const myClasses = useMyClasses(userId, role !== 'general')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const name = profile?.displayName.trim() || email

  function go(path: string) {
    void navigate(path)
    onClose()
  }

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
        className={`fixed inset-y-0 left-0 z-40 flex w-[264px] shrink-0 flex-col border-r border-app-border bg-app-background transition-colors duration-200 lg:static lg:translate-x-0 ${
          // `invisible` while closed so the offscreen rail can't take tab focus
          open ? 'translate-x-0' : 'invisible -translate-x-full lg:visible'
        }`}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-4">
          <LogoSlot />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="grid size-8 cursor-pointer place-items-center rounded-app-sm text-app-muted transition-colors hover:bg-app-surface hover:text-app-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent lg:hidden"
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
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-app-muted"
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
              aria-label="Search"
              className="w-full rounded-app-sm border border-app-border bg-app-surface/60 py-2.5 pr-14 pl-9 text-sm text-app-foreground outline-none transition-colors duration-150 placeholder:text-app-muted focus:border-app-accent focus:bg-app-background focus:ring-2 focus:ring-app-accent/25 [&::-webkit-search-cancel-button]:hidden"
            />
            <kbd
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 rounded border border-app-border bg-app-surface px-1.5 py-0.5 font-app text-[10px] font-medium text-app-muted"
            >
              {isMac ? '⌘F' : 'Ctrl F'}
            </kbd>
          </div>
        </div>

        <nav className="scrollbar-subtle min-h-0 flex-1 overflow-y-auto px-4 py-6">
          <SidebarSection label="Workspace">
            <SidebarLink
              label="Overview"
              icon={<OverviewIcon />}
              active={pathname === '/'}
              onClick={() => go('/')}
            />
            <SidebarLink
              label="Drafts"
              icon={<DraftsIcon />}
              active={pathname === '/drafts'}
              badge={draftCount > 0 ? draftCount : undefined}
              onClick={() => go('/drafts')}
            />
            {/*
              A General account can join a class — doing so promotes it to
              Student (`join_class`, migration 0010) — so it needs a way in.
              It sits under Workspace rather than in a Classroom section of its
              own, because until the account joins something there is no
              classroom to head a section with.
            */}
            {role === 'general' && (
              <SidebarLink
                label="Join a class"
                icon={<JoinIcon />}
                active={pathname === '/classes'}
                onClick={() => go('/classes')}
              />
            )}
          </SidebarSection>

          {role === 'teacher' && (
            <SidebarSection label="Classroom">
              <SidebarLink
                label="Classes"
                icon={<ClassesIcon />}
                active={pathname.startsWith('/classroom/classes')}
                badge={myClasses && myClasses.length > 0 ? myClasses.length : undefined}
                onClick={() => go('/classroom/classes')}
              />
              <SidebarLink
                label="Students"
                icon={<StudentsIcon />}
                active={pathname === '/classroom/students'}
                onClick={() => go('/classroom/students')}
              />
              <SidebarLink
                label="Quizzes"
                icon={<QuizzesIcon />}
                active={pathname === '/classroom/quizzes'}
                onClick={() => go('/classroom/quizzes')}
              />
            </SidebarSection>
          )}

          {role === 'student' && (
            <SidebarSection label="My classes">
              {(myClasses ?? []).slice(0, RAIL_CLASS_LIMIT).map((c) => (
                <SidebarLink
                  key={c.id}
                  label={c.name}
                  icon={<ClassesIcon />}
                  active={pathname === `/classes/${c.id}`}
                  onClick={() => go(`/classes/${c.id}`)}
                />
              ))}
              {myClasses && myClasses.length > RAIL_CLASS_LIMIT && (
                <SidebarLink
                  label="All classes"
                  active={pathname === '/classes'}
                  onClick={() => go('/classes')}
                />
              )}
              <SidebarLink
                label="Join a class"
                icon={<JoinIcon />}
                active={pathname === '/classes' && !(myClasses && myClasses.length > RAIL_CLASS_LIMIT)}
                onClick={() => go('/classes')}
              />
            </SidebarSection>
          )}
        </nav>

        <div className="mt-auto border-t border-app-border p-4">
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="grid size-8 shrink-0 place-items-center rounded-full bg-app-highlight text-sm font-semibold text-app-highlight-foreground shadow-2xs"
            >
              {name?.charAt(0).toUpperCase() ?? '?'}
            </span>
            <div className="flex min-w-0 flex-1 flex-col text-xs">
              {name && <span className="truncate font-medium text-app-foreground">{name}</span>}
              {/*
                A transient profile read failure must not read as "General" in
                the one place that's always on screen — `ProfileSection`
                already shows `—` for the same signal (`profileDegraded`);
                the rail defaulting `role` to General for rendering safety
                shouldn't also mean *labeling* a teacher General.
              */}
              <span className="text-app-muted">{profileDegraded ? '—' : ROLE_LABEL[role]}</span>
            </div>
            {/*
              One control instead of three (Account type, Log out, light/dark).
              Appearance, profile and logout all live behind it now, which is
              also what makes room for the three-way System/Light/Dark setting
              a 9×9 icon button could never express.
            */}
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              aria-label="Settings"
              title="Settings"
              className="group grid size-8 shrink-0 cursor-pointer place-items-center rounded-full border border-app-border bg-app-surface/60 text-app-muted transition-all duration-200 hover:border-app-border/80 hover:bg-app-surface hover:text-app-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent"
            >
              <SettingsIcon className="size-4 transition-transform duration-300 group-hover:rotate-45" />
            </button>
          </div>
        </div>
      </aside>

      {settingsOpen && (
        <SettingsModal onClose={() => setSettingsOpen(false)} onSignOut={onSignOut} />
      )}
    </>
  )
}
