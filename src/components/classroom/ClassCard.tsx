import { useEffect, useRef, useState } from 'react'
import type { ClassRoom } from '@/classroom/types'
import { plural } from '@/classroom/format'
import { relativePostedAt } from '@/components/home/relativeTime'
import { JoinCodeChip } from './JoinCodeChip'

function UsersIcon() {
  return (
    <svg className="size-3.5 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
      <circle cx="6" cy="5.5" r="2.5" />
      <path d="M1.8 13.5c.6-2.3 2.2-3.5 4.2-3.5s3.6 1.2 4.2 3.5" />
      <path d="M10.5 3.2a2.4 2.4 0 010 4.6M12 10.2c1.1.5 1.8 1.6 2.2 3.3" />
    </svg>
  )
}

function QuizIcon() {
  return (
    <svg className="size-3.5 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="2" width="10" height="12" rx="1.5" />
      <path d="M5.5 6l1 1 2-2M5.5 10.5l1 1 2-2M10 6.2h.5M10 10.7h.5" />
    </svg>
  )
}

function BellIcon() {
  return (
    <svg className="size-3.5 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 2.5a3.5 3.5 0 00-3.5 3.5v2.2L3.2 10.5h9.6l-1.3-2.3V6A3.5 3.5 0 008 2.5z" />
      <path d="M6.5 12.5a1.5 1.5 0 003 0" />
    </svg>
  )
}

function ArrowRightIcon() {
  return (
    <svg className="size-4 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3.5 8h9M9 4.5l3.5 3.5-3.5 3.5" />
    </svg>
  )
}

function ClassActionMenu({
  onOpen,
  onDelete,
}: {
  onOpen: () => void
  onDelete: () => void
}) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        aria-label="Class actions"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Class options"
        className="flex size-7.5 cursor-pointer items-center justify-center rounded-app-sm text-app-muted transition-colors hover:bg-app-surface hover:text-app-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent"
      >
        <svg className="size-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <circle cx="8" cy="3.5" r="1.3" />
          <circle cx="8" cy="8" r="1.3" />
          <circle cx="8" cy="12.5" r="1.3" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 min-w-36 rounded-app-sm border border-app-border bg-app-background p-1 shadow-app"
        >
          <button
            type="button"
            role="menuitem"
            onClick={(e) => {
              e.stopPropagation()
              setOpen(false)
              onOpen()
            }}
            className="flex w-full cursor-pointer items-center gap-2 rounded-[calc(var(--app-radius-sm)-2px)] px-2.5 py-1.5 text-left text-xs font-medium text-app-foreground transition-colors hover:bg-app-surface focus-visible:outline-2 focus-visible:outline-app-accent"
          >
            Open folder
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={(e) => {
              e.stopPropagation()
              setOpen(false)
              onDelete()
            }}
            className="flex w-full cursor-pointer items-center gap-2 rounded-[calc(var(--app-radius-sm)-2px)] px-2.5 py-1.5 text-left text-xs font-medium text-red-600 transition-colors hover:bg-red-500/10 focus-visible:outline-2 focus-visible:outline-red-500"
          >
            Delete class
          </button>
        </div>
      )}
    </div>
  )
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) {
    const first = parts[0]
    const second = parts[1]
    if (first && second) {
      return (first[0] + second[0]).toUpperCase()
    }
  }
  return name.slice(0, 2).toUpperCase()
}

/**
 * Executive Academic Card for Grid View.
 */
export function ClassCard({
  classRoom,
  studentCount,
  quizCount,
  latestAnnouncementAt,
  onOpen,
  onDelete,
}: {
  classRoom: ClassRoom
  studentCount: number
  quizCount: number
  latestAnnouncementAt: string | null
  onOpen: () => void
  onDelete: () => void
}) {
  const initials = getInitials(classRoom.name)

  return (
    <article
      onClick={onOpen}
      className="group relative flex cursor-pointer flex-col justify-between overflow-hidden rounded-app border border-app-border bg-app-background shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-app-accent/50 hover:shadow-md"
    >
      {/* Top subtle decorative gradient bar */}
      <div className="h-1.5 w-full bg-gradient-to-r from-app-accent/80 via-app-accent to-app-highlight" />

      <div className="flex flex-1 flex-col p-5">
        {/* Header: Class Badge, Name & Context Menu */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <span
              aria-hidden="true"
              className="grid size-10 shrink-0 place-items-center rounded-app-sm border border-app-accent/25 bg-app-accent/10 font-mono text-sm font-bold text-app-accent-text"
            >
              {initials}
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-base font-semibold text-app-foreground transition-colors group-hover:text-app-accent-text">
                {classRoom.name}
              </h3>
              <p className="mt-0.5 line-clamp-1 text-xs text-app-muted">
                {classRoom.description || 'No description provided'}
              </p>
            </div>
          </div>

          <ClassActionMenu onOpen={onOpen} onDelete={onDelete} />
        </div>

        {/* Bento-style Metric Pills */}
        <div className="mt-5 grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center gap-2 rounded-app-sm border border-app-border/70 bg-app-surface/50 px-2.5 py-2 text-app-foreground">
            <span className="text-app-accent-text">
              <UsersIcon />
            </span>
            <span className="truncate font-medium">
              {studentCount} <span className="font-normal text-app-muted">{plural(studentCount, 'student')}</span>
            </span>
          </div>

          <div className="flex items-center gap-2 rounded-app-sm border border-app-border/70 bg-app-surface/50 px-2.5 py-2 text-app-foreground">
            <span className="text-app-accent-text">
              <QuizIcon />
            </span>
            <span className="truncate font-medium">
              {quizCount} <span className="font-normal text-app-muted">{plural(quizCount, 'quiz', 'quizzes')}</span>
            </span>
          </div>
        </div>

        {/* Latest Activity Strip */}
        <div className="mt-2.5 flex items-center gap-2 rounded-app-sm bg-app-surface/30 px-2.5 py-1.5 text-xs text-app-muted">
          <span className="text-app-muted/80">
            <BellIcon />
          </span>
          <span className="truncate">
            {latestAnnouncementAt ? (
              <>
                <span className="font-medium text-app-foreground">Update: </span>
                {relativePostedAt(latestAnnouncementAt)}
              </>
            ) : (
              'No announcements yet'
            )}
          </span>
        </div>
      </div>

      {/* Footer: Voucher Join Code & Enter Button */}
      <div className="flex items-center justify-between gap-3 border-t border-app-border/80 bg-app-surface/30 px-5 py-3">
        <JoinCodeChip code={classRoom.joinCode} />

        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-app-accent-text transition-colors group-hover:text-app-accent">
          Open class
          <ArrowRightIcon />
        </span>
      </div>
    </article>
  )
}

/**
 * Executive Academic Row for List View.
 */
export function ClassListRow({
  classRoom,
  studentCount,
  quizCount,
  latestAnnouncementAt,
  onOpen,
  onDelete,
}: {
  classRoom: ClassRoom
  studentCount: number
  quizCount: number
  latestAnnouncementAt: string | null
  onOpen: () => void
  onDelete: () => void
}) {
  const initials = getInitials(classRoom.name)

  return (
    <article
      onClick={onOpen}
      className="group relative flex cursor-pointer flex-col gap-3 rounded-app-sm border border-app-border bg-app-background p-4 shadow-2xs transition-all duration-150 hover:border-app-accent/40 hover:bg-app-surface/30 sm:flex-row sm:items-center sm:justify-between"
    >
      {/* Left: Class initials avatar, Name, Description */}
      <div className="flex items-center gap-3.5 min-w-0 flex-1">
        <span
          aria-hidden="true"
          className="grid size-9 shrink-0 place-items-center rounded-app-sm border border-app-accent/25 bg-app-accent/10 font-mono text-xs font-bold text-app-accent-text"
        >
          {initials}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-app-foreground transition-colors group-hover:text-app-accent-text">
            {classRoom.name}
          </h3>
          <p className="line-clamp-1 text-xs text-app-muted">
            {classRoom.description || 'No description'}
          </p>
        </div>
      </div>

      {/* Center: Join Code & Metrics */}
      <div className="flex flex-wrap items-center gap-3 sm:gap-4">
        <JoinCodeChip code={classRoom.joinCode} />

        <div className="flex items-center gap-3 text-xs text-app-muted">
          <span className="inline-flex items-center gap-1 font-medium text-app-foreground">
            <span className="text-app-accent-text"><UsersIcon /></span>
            {studentCount}
          </span>
          <span className="inline-flex items-center gap-1 font-medium text-app-foreground">
            <span className="text-app-accent-text"><QuizIcon /></span>
            {quizCount}
          </span>
          <span className="hidden xl:inline text-xs text-app-muted">
            {latestAnnouncementAt ? relativePostedAt(latestAnnouncementAt) : 'No updates'}
          </span>
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2 justify-end">
        <span className="hidden sm:inline-flex items-center gap-1 text-xs font-semibold text-app-accent-text transition-colors group-hover:text-app-accent">
          Open
          <ArrowRightIcon />
        </span>
        <ClassActionMenu onOpen={onOpen} onDelete={onDelete} />
      </div>
    </article>
  )
}
