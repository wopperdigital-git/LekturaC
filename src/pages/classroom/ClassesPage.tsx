import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { createClass, deleteClass, loadTeacherClassroom } from '@/classroom/api'
import { matchesQuery, plural } from '@/classroom/format'
import { useAsync } from '@/classroom/useAsync'
import { invalidateMyClasses } from '@/classroom/useMyClasses'
import type { ClassRoom } from '@/classroom/types'
import { DashboardShell } from '@/components/home/DashboardShell'
import { ViewTabs } from '@/components/home/ViewTabs'
import type { DeckView } from '@/components/home/deckFilters'
import { ClassCard } from '@/components/classroom/ClassCard'
import { ClassFormModal } from '@/components/classroom/ClassFormModal'
import { ConfirmModal } from '@/components/classroom/ConfirmModal'
import { LoadError, Panel, PanelMessage, RowsSkeleton } from '@/components/classroom/Panel'
import { Button } from '@/components/ui/Button'

export function ClassesPage() {
  const navigate = useNavigate()
  const userId = useAuthStore((s) => s.user?.id ?? '')
  const { state, reload } = useAsync(loadTeacherClassroom, userId)
  const [query, setQuery] = useState('')
  const [view, setView] = useState<DeckView>('grid')
  const [creating, setCreating] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<ClassRoom | null>(null)

  const data = state.status === 'ready' ? state.data : null
  const visible = useMemo(
    () => (data ? data.classes.filter((c) => matchesQuery(query, c.name, c.description)) : []),
    [data, query],
  )

  const subtitle = data
    ? data.classes.length > 0
      ? `${plural(data.classes.length, 'class', 'classes')} · Students join with a class code`
      : 'Create a class, then share its code with your students'
    : 'Loading your classes…'

  return (
    <DashboardShell title="Classes" subtitle={subtitle} query={query} onQueryChange={setQuery}>
      <Panel
        toolbar={
          <>
            <ViewTabs value={view} onChange={setView} />
            <Button variant="primary" onClick={() => setCreating(true)}>
              + New class
            </Button>
          </>
        }
      >
        {state.status === 'loading' ? (
          <RowsSkeleton />
        ) : state.status === 'error' ? (
          <LoadError message={state.error} onRetry={reload} />
        ) : state.data.classes.length === 0 ? (
          <PanelMessage
            title="Create your first class"
            body="Each class gets a short code. Students sign up as a Student, enter the code, and appear on your roster."
            action={
              <Button variant="primary" onClick={() => setCreating(true)}>
                + New class
              </Button>
            }
          />
        ) : visible.length === 0 ? (
          <PanelMessage
            title={`No classes match “${query.trim()}”`}
            action={
              <Button variant="secondary" onClick={() => setQuery('')}>
                Clear search
              </Button>
            }
          />
        ) : (
          <div className={view === 'list' ? 'grid grid-cols-1 gap-3' : 'grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3'}>
            {visible.map((c) => (
              <ClassCard
                key={c.id}
                classRoom={c}
                studentCount={state.data.members.filter((m) => m.classId === c.id).length}
                quizCount={state.data.postings.filter((p) => p.classId === c.id).length}
                latestAnnouncementAt={state.data.announcements.find((a) => a.classId === c.id)?.createdAt ?? null}
                onOpen={() => void navigate(`/classroom/classes/${c.id}`)}
                onDelete={() => setPendingDelete(c)}
              />
            ))}
          </div>
        )}
      </Panel>

      {creating && (
        <ClassFormModal
          title="New class"
          submitLabel="Create class"
          onCancel={() => setCreating(false)}
          onSubmit={async (details) => {
            const created = await createClass(details)
            invalidateMyClasses()
            void navigate(`/classroom/classes/${created.id}`)
          }}
        />
      )}

      {pendingDelete && (
        <ConfirmModal
          title="Delete class"
          confirmLabel="Delete class"
          pendingLabel="Deleting…"
          onCancel={() => setPendingDelete(null)}
          onConfirm={async () => {
            await deleteClass(pendingDelete.id)
            setPendingDelete(null)
            invalidateMyClasses()
            reload()
          }}
        >
          <p>
            Delete <span className="font-medium text-app-foreground">“{pendingDelete.name}”</span>? Its roster,
            announcements, quiz postings and the scores students earned in it are removed. Your quizzes and your
            students' accounts are kept. This can't be undone.
          </p>
        </ConfirmModal>
      )}
    </DashboardShell>
  )
}
