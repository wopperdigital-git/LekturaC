import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { loadStudentClassroom, removeMembership } from '@/classroom/api'
import { matchesQuery, personLabel, plural } from '@/classroom/format'
import { studentClassQuizzes } from '@/classroom/select'
import { useAsync } from '@/classroom/useAsync'
import { invalidateMyClasses } from '@/classroom/useMyClasses'
import { DashboardShell } from '@/components/home/DashboardShell'
import { AnnouncementList } from '@/components/classroom/AnnouncementList'
import { ConfirmModal } from '@/components/classroom/ConfirmModal'
import { StudentQuizRow } from '@/components/classroom/StudentQuizRow'
import { ClassUnavailable, LoadError, Panel, PanelMessage, RowsSkeleton } from '@/components/classroom/Panel'

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) {
    const first = parts[0]
    const second = parts[1]
    if (first && second) return (first[0] + second[0]).toUpperCase()
  }
  return name.slice(0, 2).toUpperCase()
}

export function StudentClassPage() {
  const { classId = '' } = useParams()
  const navigate = useNavigate()
  const userId = useAuthStore((s) => s.user?.id ?? '')
  const { state, reload } = useAsync(loadStudentClassroom, userId)
  const [query, setQuery] = useState('')
  const [confirmLeave, setConfirmLeave] = useState(false)

  if (state.status !== 'ready') {
    return (
      <DashboardShell title="Class" query={query} onQueryChange={setQuery}>
        <Panel>
          {state.status === 'loading' ? <RowsSkeleton count={3} /> : <LoadError message={state.error} onRetry={reload} />}
        </Panel>
      </DashboardShell>
    )
  }

  const classRoom = state.data.classes.find((c) => c.id === classId)
  if (!classRoom) {
    return (
      <DashboardShell title="Class" query={query} onQueryChange={setQuery}>
        <ClassUnavailable backTo="/classes" backLabel="Back to My classes" />
      </DashboardShell>
    )
  }

  const teacher = state.data.teachers.find((t) => t.id === classRoom.teacherId)
  const classAnnouncements = state.data.announcements.filter((a) => a.classId === classRoom.id)
  const announcements = classAnnouncements.filter((a) => matchesQuery(query, a.title, a.body))
  const { quizzes, postings, attempts } = state.data
  const classQuizzes = studentClassQuizzes(classRoom.id, quizzes, postings, attempts)
  const visibleQuizzes = query.trim() ? studentClassQuizzes(classRoom.id, quizzes, postings, attempts, query) : classQuizzes
  const completedQuizzes = classQuizzes.filter((item) => item.attempt !== null)

  const initials = getInitials(classRoom.name)
  const teacherName = teacher ? personLabel(teacher) : 'Instructor'
  const teacherInitial = teacherName.trim().charAt(0).toUpperCase() || 'T'

  return (
    <DashboardShell
      title={classRoom.name}
      subtitle={`Taught by ${teacherName}${classRoom.description ? ` · ${classRoom.description}` : ''}`}
      query={query}
      onQueryChange={setQuery}
    >
      {/* Breadcrumb Navigation */}
      <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-2 text-xs text-app-muted">
        <Link
          to="/classes"
          className="inline-flex items-center gap-1 font-medium transition-colors hover:text-app-foreground"
        >
          <svg className="size-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 12l-4-4 4-4" />
          </svg>
          My classes
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
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="truncate text-xl font-bold tracking-tight text-app-foreground">
                  {classRoom.name}
                </h1>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-app-border bg-app-surface/80 px-2.5 py-0.5 text-xs text-app-foreground">
                  <span className="grid size-4 place-items-center rounded-full bg-app-accent/20 font-bold text-[9px] text-app-accent-text">
                    {teacherInitial}
                  </span>
                  <span>Taught by <strong className="font-semibold">{teacherName}</strong></span>
                </span>
              </div>

              <p className="mt-1 line-clamp-2 text-sm text-app-muted">
                {classRoom.description || 'Welcome to your class hub. Check below for active quizzes and course announcements.'}
              </p>

              {/* Quick stats capsules */}
              <div className="mt-3.5 flex flex-wrap items-center gap-2 text-xs">
                <span className="inline-flex items-center gap-1.5 rounded-app-sm border border-app-border/80 bg-app-surface/60 px-2.5 py-1 text-app-foreground">
                  <svg className="size-3.5 text-app-accent" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="3" y="2" width="10" height="12" rx="1.5" />
                    <path d="M5.5 6l1 1 2-2M5.5 10.5l1 1 2-2M10 6.2h.5M10 10.7h.5" />
                  </svg>
                  <span className="font-semibold">{classQuizzes.length}</span>
                  <span className="text-app-muted">{plural(classQuizzes.length, 'quiz', 'quizzes')}</span>
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-app-sm border border-app-border/80 bg-app-surface/60 px-2.5 py-1 text-app-foreground">
                  <svg className="size-3.5 text-emerald-600 dark:text-emerald-400" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                  </svg>
                  <span className="font-semibold">{completedQuizzes.length}</span>
                  <span className="text-app-muted">completed</span>
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-app-sm border border-app-border/80 bg-app-surface/60 px-2.5 py-1 text-app-foreground">
                  <svg className="size-3.5 text-app-muted" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M2.5 6.5h2l4.5-3.5v10l-4.5-3.5h-2a1 1 0 01-1-1v-1a1 1 0 011-1z" />
                    <path d="M12 5.5a4 4 0 010 5M13.5 3.5a7 7 0 010 9" />
                  </svg>
                  <span className="font-semibold">{classAnnouncements.length}</span>
                  <span className="text-app-muted">{plural(classAnnouncements.length, 'announcement', 'announcements')}</span>
                </span>
              </div>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex shrink-0 items-center">
            <button
              type="button"
              onClick={() => setConfirmLeave(true)}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-app-sm border border-app-border bg-app-surface px-3 py-1.5 text-xs font-medium text-app-muted transition-colors hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 focus-visible:outline-2 focus-visible:outline-red-500"
              title="Leave this classroom"
            >
              <svg className="size-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M6 14H3a1 1 0 01-1-1V3a1 1 0 011-1h3M11 11.5l3.5-3.5L11 4.5M14.5 8H6" />
              </svg>
              <span>Leave class</span>
            </button>
          </div>
        </div>
      </section>

      {/* Main Content Panels */}
      <div className="flex flex-col gap-6">
        <Panel
          toolbar={
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                <svg className="size-4 text-app-accent" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="2" width="10" height="12" rx="1.5" />
                  <path d="M5.5 6l1 1 2-2M5.5 10.5l1 1 2-2M10 6.2h.5M10 10.7h.5" />
                </svg>
                <h2 className="text-sm font-semibold text-app-foreground">Assigned Quizzes</h2>
                <span className="rounded-full bg-app-surface px-2 py-0.5 text-xs font-semibold text-app-muted">
                  {classQuizzes.length}
                </span>
              </div>
            </div>
          }
        >
          {visibleQuizzes.length === 0 ? (
            <PanelMessage
              title={classQuizzes.length === 0 ? 'No quizzes posted yet' : 'No quizzes match your search'}
              body={
                classQuizzes.length === 0
                  ? 'When your teacher posts an assessment for this class, it will appear here.'
                  : 'Try clearing your search query to see all class quizzes.'
              }
            />
          ) : (
            <div className="flex flex-col gap-3.5">
              {visibleQuizzes.map((item) => (
                <StudentQuizRow key={item.quiz.id} item={item} />
              ))}
            </div>
          )}
        </Panel>

        <Panel
          toolbar={
            <div className="flex items-center gap-2">
              <svg className="size-4 text-app-accent" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M2.5 6.5h2l4.5-3.5v10l-4.5-3.5h-2a1 1 0 01-1-1v-1a1 1 0 011-1z" />
                <path d="M12 5.5a4 4 0 010 5M13.5 3.5a7 7 0 010 9" />
              </svg>
              <h2 className="text-sm font-semibold text-app-foreground">Class Announcements</h2>
              <span className="rounded-full bg-app-surface px-2 py-0.5 text-xs font-semibold text-app-muted">
                {classAnnouncements.length}
              </span>
            </div>
          }
        >
          <AnnouncementList
            announcements={announcements}
            emptyMessage={
              classAnnouncements.length === 0
                ? "Your teacher hasn't posted any announcements yet."
                : 'No announcements match your search.'
            }
          />
        </Panel>
      </div>

      {confirmLeave && (
        <ConfirmModal
          title="Leave class"
          confirmLabel="Leave class"
          pendingLabel="Leaving…"
          onCancel={() => setConfirmLeave(false)}
          onConfirm={async () => {
            await removeMembership(classRoom.id, userId)
            invalidateMyClasses()
            void navigate('/classes')
          }}
        >
          <p>
            Leave <span className="font-medium text-app-foreground">{classRoom.name}</span>? You can rejoin later with the
            class code.
          </p>
        </ConfirmModal>
      )}
    </DashboardShell>
  )
}
