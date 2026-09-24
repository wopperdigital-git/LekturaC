import { useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
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

/** Unknown or missing `?tab=` lands on Students rather than an empty panel. */
function parseTab(value: string | null): Tab {
  return value === 'announcements' || value === 'quizzes' ? value : 'students'
}

/**
 * One class as a folder: its students, announcements and quizzes behind tabs.
 * The tab lives in the URL so a reload or a shared link opens the same one.
 */
export function ClassFolderPage() {
  const { classId = '' } = useParams()
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

  const tabs: { value: Tab; label: string; count: number }[] = [
    { value: 'students', label: 'Students', count: fullRoster.length },
    { value: 'announcements', label: 'Announcements', count: classAnnouncements.length },
    { value: 'quizzes', label: 'Quizzes', count: classQuizzes.length },
  ]

  return (
    <DashboardShell
      title={classRoom.name}
      subtitle={`${classRoom.description ? `${classRoom.description} · ` : ''}${plural(fullRoster.length, 'student')}${
        fullRoster.length === 0 ? ' · Share the code below to add students' : ''
      }`}
      query={query}
      onQueryChange={setQuery}
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-sm text-app-muted">Join code</span>
        <JoinCodeChip code={classRoom.joinCode} />
        <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setConfirmRegenerate(true)}>
          Regenerate
        </Button>
        <Button variant="secondary" className="ml-auto px-3 py-1.5 text-xs" onClick={() => setEditingDetails(true)}>
          Edit details
        </Button>
      </div>

      <Panel
        toolbar={
          <div role="tablist" aria-label="Class sections" className="flex flex-wrap gap-1 rounded-app-sm bg-app-surface p-1">
            {tabs.map((t) => {
              const active = t.value === tab
              return (
                <button
                  key={t.value}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setParams({ tab: t.value }, { replace: true })}
                  className={`flex cursor-pointer items-center gap-2 rounded-[calc(var(--app-radius-sm)-2px)] px-3 py-1.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent ${
                    active ? 'bg-app-background font-medium text-app-foreground shadow-sm' : 'text-app-muted hover:text-app-foreground'
                  }`}
                >
                  {t.label}
                  <span className="text-xs text-app-muted tabular-nums">{t.count}</span>
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
                title="No students yet"
                body={`Students join by signing up as a Student and entering ${classRoom.joinCode}.`}
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
              <PanelMessage title="No quizzes posted" body="Quizzes will appear here once they're generated and posted to this class." />
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
