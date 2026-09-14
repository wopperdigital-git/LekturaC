import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { loadStudentClassroom, removeMembership } from '@/classroom/api'
import { matchesQuery, personLabel } from '@/classroom/format'
import { useAsync } from '@/classroom/useAsync'
import { invalidateMyClasses } from '@/classroom/useMyClasses'
import { DashboardShell } from '@/components/home/DashboardShell'
import { AnnouncementList } from '@/components/classroom/AnnouncementList'
import { ConfirmModal } from '@/components/classroom/ConfirmModal'
import { ClassUnavailable, LoadError, Panel, RowsSkeleton } from '@/components/classroom/Panel'
import { Button } from '@/components/ui/Button'

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

  return (
    <DashboardShell
      title={classRoom.name}
      subtitle={`Taught by ${teacher ? personLabel(teacher) : 'your teacher'}${classRoom.description ? ` · ${classRoom.description}` : ''}`}
      query={query}
      onQueryChange={setQuery}
    >
      <Panel
        toolbar={
          <>
            <h2 className="text-sm font-semibold text-app-foreground">Announcements</h2>
            <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setConfirmLeave(true)}>
              Leave class
            </Button>
          </>
        }
      >
        <AnnouncementList
          announcements={announcements}
          emptyMessage={classAnnouncements.length === 0 ? 'Your teacher hasn\'t posted anything yet.' : 'No announcements match your search.'}
        />
      </Panel>

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
