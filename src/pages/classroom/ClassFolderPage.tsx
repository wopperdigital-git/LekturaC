import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import {
  createAnnouncement,
  deleteAnnouncement,
  loadTeacherClassroom,
  regenerateJoinCode,
  removeMembership,
  updateAnnouncement,
  updateClass,
} from '@/classroom/api'
import { matchesQuery, personLabel, plural } from '@/classroom/format'
import { rosterOf, type RosterEntry } from '@/classroom/stats'
import type { Announcement } from '@/classroom/types'
import { useAsync } from '@/classroom/useAsync'
import { invalidateMyClasses } from '@/classroom/useMyClasses'
import { DashboardShell } from '@/components/home/DashboardShell'
import { AnnouncementList } from '@/components/classroom/AnnouncementList'
import { ClassFormModal } from '@/components/classroom/ClassFormModal'
import { ConfirmModal } from '@/components/classroom/ConfirmModal'
import { JoinCodeChip } from '@/components/classroom/JoinCodeChip'
import { ClassUnavailable, LoadError, Panel, PanelMessage, RowsSkeleton } from '@/components/classroom/Panel'
import { QuizRow } from '@/components/classroom/QuizRow'
import { StudentRow } from '@/components/classroom/StudentRow'
import { Button } from '@/components/ui/Button'

type Tab = 'students' | 'announcements' | 'quizzes'

function parseTab(value: string | null): Tab {
  return value === 'announcements' || value === 'quizzes' ? value : 'students'
}

function UsersTabIcon() {
  return (
    <svg className="size-4 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
      <circle cx="6" cy="5.5" r="2.5" />
      <path d="M1.8 13.5c.6-2.3 2.2-3.5 4.2-3.5s3.6 1.2 4.2 3.5" />
      <path d="M10.5 3.2a2.4 2.4 0 010 4.6M12 10.2c1.1.5 1.8 1.6 2.2 3.3" />
    </svg>
  )
}

function MegaphoneIcon() {
  return (
    <svg className="size-4 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2.5 6.5h2l4.5-3.5v10l-4.5-3.5h-2a1 1 0 01-1-1v-1a1 1 0 011-1z" />
      <path d="M12 5.5a4 4 0 010 5M13.5 3.5a7 7 0 010 9" />
    </svg>
  )
}

function QuizTabIcon() {
  return (
    <svg className="size-4 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="2" width="10" height="12" rx="1.5" />
      <path d="M5.5 6l1 1 2-2M5.5 10.5l1 1 2-2M10 6.2h.5M10 10.7h.5" />
    </svg>
  )
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) {
    const first = parts[0]
    const second = parts[1]
    if (first && second) return (first[0] + second[0]).toUpperCase()
  }
  return name.slice(0, 2).toUpperCase()
}

/**
 * One class as a folder: executive header, student roster, announcements, and quizzes.
 */
export function ClassFolderPage() {
  const { classId = '' } = useParams()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const tab = parseTab(params.get('tab'))
  const userId = useAuthStore((s) => s.user?.id ?? '')
  const { state, reload } = useAsync(loadTeacherClassroom, userId)
  const [query, setQuery] = useState('')
  const [editingDetails, setEditingDetails] = useState(false)
  const [confirmRegenerate, setConfirmRegenerate] = useState(false)
  const [pendingRemoval, setPendingRemoval] = useState<RosterEntry | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Announcement | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (state.status !== 'ready') {
    return (
      <DashboardShell title="Class" query={query} onQueryChange={setQuery}>
        <Panel>
          {state.status === 'loading' ? <RowsSkeleton /> : <LoadError message={state.error} onRetry={reload} />}
        </Panel>
      </DashboardShell>
    )
  }

  const data = state.data
  const classRoom = data.classes.find((c) => c.id === classId)
  if (!classRoom) {
    return (
      <DashboardShell title="Class" query={query} onQueryChange={setQuery}>
        <ClassUnavailable backTo="/classroom/classes" backLabel="Back to Classes" />
      </DashboardShell>
    )
  }

  const fullRoster = rosterOf(data.members, data.students, classRoom.id)
  const roster = fullRoster.filter((e) => matchesQuery(query, e.student.displayName, e.student.email))
  const classAnnouncements = data.announcements.filter((a) => a.classId === classRoom.id)
  const announcements = classAnnouncements.filter((a) => matchesQuery(query, a.title, a.body))
  const postedQuizIds = new Set(data.postings.filter((p) => p.classId === classRoom.id).map((p) => p.quizId))
  const classQuizzes = data.quizzes.filter((q) => postedQuizIds.has(q.id))
  const quizzes = classQuizzes.filter((q) => matchesQuery(query, q.title, q.deckTitle))

  const tabs: { value: Tab; label: string; count: number; icon: React.ReactNode }[] = [
    { value: 'students', label: 'Students', count: fullRoster.length, icon: <UsersTabIcon /> },
    { value: 'announcements', label: 'Announcements', count: classAnnouncements.length, icon: <MegaphoneIcon /> },
    { value: 'quizzes', label: 'Quizzes', count: classQuizzes.length, icon: <QuizTabIcon /> },
  ]

  const initials = getInitials(classRoom.name)

  return (
    <DashboardShell
      title={classRoom.name}
      subtitle={classRoom.description || `${plural(fullRoster.length, 'enrolled student')}`}
      query={query}
      onQueryChange={setQuery}
    >
      {/* Breadcrumb Navigation */}
      <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-2 text-xs text-app-muted">
        <Link
          to="/classroom/classes"
          className="inline-flex items-center gap-1 font-medium transition-colors hover:text-app-foreground"
        >
          <svg className="size-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 12l-4-4 4-4" />
          </svg>
          Classes
        </Link>
        <span className="text-app-border">/</span>
        <span className="truncate font-semibold text-app-foreground">{classRoom.name}</span>
      </nav>

      {/* Executive Course Hero Card */}
      <section className="mb-6 overflow-hidden rounded-app border border-app-border bg-app-background shadow-xs">
        <div className="flex flex-col gap-5 p-5 lg:flex-row lg:items-center lg:justify-between">
          {/* Left: Class identity & summary pills */}
          <div className="flex items-start gap-4 min-w-0 flex-1">
            <span
              aria-hidden="true"
              className="grid size-12 shrink-0 place-items-center rounded-app-sm border border-app-accent/25 bg-app-accent/10 font-mono text-base font-bold text-app-accent-text shadow-2xs"
            >
              {initials}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-xl font-bold tracking-tight text-app-foreground">
                  {classRoom.name}
                </h1>
              </div>
              <p className="mt-1 line-clamp-2 text-sm text-app-muted">
                {classRoom.description || 'No class description yet.'}
              </p>

              {/* Quick stats capsules */}
              <div className="mt-3.5 flex flex-wrap items-center gap-2 text-xs">
                <span className="inline-flex items-center gap-1.5 rounded-app-sm border border-app-border/80 bg-app-surface/60 px-2.5 py-1 text-app-foreground">
                  <UsersTabIcon />
                  <span className="font-semibold">{fullRoster.length}</span>
                  <span className="text-app-muted">{plural(fullRoster.length, 'student')}</span>
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-app-sm border border-app-border/80 bg-app-surface/60 px-2.5 py-1 text-app-foreground">
                  <MegaphoneIcon />
                  <span className="font-semibold">{classAnnouncements.length}</span>
                  <span className="text-app-muted">{plural(classAnnouncements.length, 'update', 'updates')}</span>
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-app-sm border border-app-border/80 bg-app-surface/60 px-2.5 py-1 text-app-foreground">
                  <QuizTabIcon />
                  <span className="font-semibold">{classQuizzes.length}</span>
                  <span className="text-app-muted">{plural(classQuizzes.length, 'quiz', 'quizzes')}</span>
                </span>
              </div>
            </div>
          </div>

          {/* Right: Join Voucher Widget & Actions */}
          <div className="flex flex-wrap items-center gap-2.5 rounded-app-sm border border-app-border/80 bg-app-surface/40 p-3 lg:flex-nowrap">
            <div className="flex flex-col">
              <span className="text-[10px] font-semibold tracking-wider text-app-muted uppercase">Student Join Code</span>
              <div className="mt-1 flex items-center gap-2">
                <JoinCodeChip code={classRoom.joinCode} />
                <Button
                  variant="ghost"
                  className="px-2 py-1 text-xs text-app-muted hover:text-app-foreground"
                  onClick={() => setConfirmRegenerate(true)}
                  title="Generate a new class code"
                >
                  Regenerate
                </Button>
              </div>
            </div>

            <div className="hidden h-8 w-px bg-app-border lg:block" />

            <Button
              variant="secondary"
              className="px-3 py-1.5 text-xs font-medium"
              onClick={() => setEditingDetails(true)}
            >
              Edit details
            </Button>
          </div>
        </div>
      </section>

      {/* Main Tabbed Panel */}
      <Panel
        toolbar={
          <div role="tablist" aria-label="Class sections" className="flex flex-wrap gap-1.5 rounded-app-sm bg-app-surface/60 p-1">
            {tabs.map((t) => {
              const active = t.value === tab
              return (
                <button
                  key={t.value}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setParams({ tab: t.value }, { replace: true })}
                  className={`flex cursor-pointer items-center gap-2 rounded-[calc(var(--app-radius-sm)-2px)] px-3.5 py-1.5 text-sm font-medium transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent ${
                    active
                      ? 'border border-app-border/80 bg-app-background text-app-foreground shadow-2xs'
                      : 'text-app-muted hover:bg-app-surface hover:text-app-foreground'
                  }`}
                >
                  <span className={active ? 'text-app-accent-text' : 'opacity-70'}>{t.icon}</span>
                  {t.label}
                  <span
                    className={`grid min-w-5 place-items-center rounded px-1 text-xs tabular-nums ${
                      active ? 'bg-app-surface font-semibold text-app-foreground' : 'text-app-muted'
                    }`}
                  >
                    {t.count}
                  </span>
                </button>
              )
            })}
          </div>
        }
      >
        <div role="tabpanel">
          {tab === 'students' &&
            (fullRoster.length === 0 ? (
              <PanelMessage
                icon={<UsersTabIcon />}
                title="No students enrolled yet"
                body={
                  <span>
                    Invite students to your class with code{' '}
                    <strong className="font-mono tracking-widest text-app-foreground">{classRoom.joinCode}</strong>.
                    Students sign up, enter this code, and appear here.
                  </span>
                }
                action={<JoinCodeChip code={classRoom.joinCode} />}
              />
            ) : roster.length === 0 ? (
              <PanelMessage title="No students match your search" />
            ) : (
              <div className="flex flex-col gap-2">
                {roster.map((entry) => (
                  <StudentRow
                    key={entry.student.id}
                    entry={entry}
                    classes={data.classes}
                    quizzes={data.quizzes}
                    records={data}
                    scopeClassId={classRoom.id}
                    expanded={expandedId === entry.student.id}
                    onToggle={() => setExpandedId((open) => (open === entry.student.id ? null : entry.student.id))}
                    onRemove={() => setPendingRemoval(entry)}
                  />
                ))}
              </div>
            ))}

          {tab === 'announcements' && (
            <AnnouncementList
              announcements={announcements}
              emptyMessage={classAnnouncements.length === 0 ? 'No announcements yet.' : 'No announcements match your search.'}
              editable={{
                onCreate: async (details) => {
                  await createAnnouncement(classRoom.id, details)
                  reload()
                },
                onUpdate: async (id, details) => {
                  await updateAnnouncement(id, details)
                  reload()
                },
                onDelete: setPendingDelete,
              }}
            />
          )}

          {tab === 'quizzes' &&
            (classQuizzes.length === 0 ? (
              <PanelMessage
                icon={<QuizTabIcon />}
                title="No quizzes posted yet"
                body="Quizzes you generate from decks will appear here once posted to this class."
                action={
                  <Button variant="secondary" onClick={() => void navigate('/classroom/quizzes')}>
                    Browse all quizzes →
                  </Button>
                }
              />
            ) : quizzes.length === 0 ? (
              <PanelMessage title="No quizzes match your search" />
            ) : (
              <div className="flex flex-col gap-2">
                {quizzes.map((quiz) => {
                  const postedClassIds = new Set(data.postings.filter((p) => p.quizId === quiz.id).map((p) => p.classId))
                  return (
                    <QuizRow
                      key={quiz.id}
                      quiz={quiz}
                      postedIn={data.classes.filter((c) => postedClassIds.has(c.id))}
                      allClasses={data.classes}
                      onChanged={reload}
                    />
                  )
                })}
              </div>
            ))}
        </div>
      </Panel>

      {editingDetails && (
        <ClassFormModal
          title="Edit class details"
          submitLabel="Save changes"
          initial={{ name: classRoom.name, description: classRoom.description }}
          onCancel={() => setEditingDetails(false)}
          onSubmit={async (details) => {
            await updateClass(classRoom.id, details)
            setEditingDetails(false)
            invalidateMyClasses()
            reload()
          }}
        />
      )}

      {confirmRegenerate && (
        <ConfirmModal
          title="Regenerate join code"
          confirmLabel="Regenerate"
          pendingLabel="Regenerating…"
          danger={false}
          onCancel={() => setConfirmRegenerate(false)}
          onConfirm={async () => {
            await regenerateJoinCode(classRoom.id)
            setConfirmRegenerate(false)
            reload()
          }}
        >
          <p>
            <span className="font-mono text-app-foreground">{classRoom.joinCode}</span> will stop working immediately.
            Students already in the class stay in it.
          </p>
        </ConfirmModal>
      )}

      {pendingRemoval && (
        <ConfirmModal
          title="Remove student"
          confirmLabel="Remove"
          pendingLabel="Removing…"
          onCancel={() => setPendingRemoval(null)}
          onConfirm={async () => {
            await removeMembership(classRoom.id, pendingRemoval.student.id)
            setPendingRemoval(null)
            setExpandedId(null)
            reload()
          }}
        >
          <p>
            Remove <span className="font-medium text-app-foreground">{personLabel(pendingRemoval.student)}</span> from{' '}
            {classRoom.name}? They can rejoin with the class code. Their scores in this class stop showing here while
            they are out of it.
          </p>
        </ConfirmModal>
      )}

      {pendingDelete && (
        <ConfirmModal
          title="Delete announcement"
          confirmLabel="Delete"
          pendingLabel="Deleting…"
          onCancel={() => setPendingDelete(null)}
          onConfirm={async () => {
            await deleteAnnouncement(pendingDelete.id)
            setPendingDelete(null)
            reload()
          }}
        >
          <p>
            Delete <span className="font-medium text-app-foreground">“{pendingDelete.title}”</span>? Students will no
            longer see it. This can't be undone.
          </p>
        </ConfirmModal>
      )}
    </DashboardShell>
  )
}
