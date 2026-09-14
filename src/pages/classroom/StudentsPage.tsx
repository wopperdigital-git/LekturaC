import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { loadTeacherClassroom } from '@/classroom/api'
import { matchesQuery, plural } from '@/classroom/format'
import { rosterOf } from '@/classroom/stats'
import { useAsync } from '@/classroom/useAsync'
import { DashboardShell } from '@/components/home/DashboardShell'
import { ClassFilter } from '@/components/classroom/ClassFilter'
import { LoadError, Panel, PanelMessage, RowsSkeleton } from '@/components/classroom/Panel'
import { StudentRow } from '@/components/classroom/StudentRow'
import { Button } from '@/components/ui/Button'

export function StudentsPage() {
  const navigate = useNavigate()
  const userId = useAuthStore((s) => s.user?.id ?? '')
  const { state, reload } = useAsync(loadTeacherClassroom, userId)
  const [query, setQuery] = useState('')
  const [classId, setClassId] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const data = state.status === 'ready' ? state.data : null
  const everyone = useMemo(() => (data ? rosterOf(data.members, data.students) : []), [data])
  const roster = useMemo(
    () =>
      everyone.filter(
        (e) =>
          (!classId || e.classIds.includes(classId)) &&
          matchesQuery(query, e.student.displayName, e.student.email),
      ),
    [everyone, classId, query],
  )

  const subtitle = data
    ? everyone.length > 0
      ? `${plural(everyone.length, 'student')} across your classes · Select a student for details`
      : 'Students appear here once they join one of your classes'
    : 'Loading your students…'

  return (
    <DashboardShell title="Students" subtitle={subtitle} query={query} onQueryChange={setQuery}>
      <Panel toolbar={data && data.classes.length > 0 ? <ClassFilter classes={data.classes} value={classId} onChange={setClassId} /> : undefined}>
        {state.status === 'loading' ? (
          <RowsSkeleton />
        ) : state.status === 'error' ? (
          <LoadError message={state.error} onRetry={reload} />
        ) : state.data.classes.length === 0 ? (
          <PanelMessage
            title="No classes yet"
            body="Create a class and share its code — students show up here as they join."
            action={
              <Button variant="primary" onClick={() => void navigate('/classroom/classes')}>
                Go to Classes
              </Button>
            }
          />
        ) : everyone.length === 0 ? (
          <PanelMessage
            title="No students yet"
            body="Share a class's join code. Students sign up as a Student account and enter it."
          />
        ) : roster.length === 0 ? (
          <PanelMessage
            title="No students match"
            action={
              <Button
                variant="secondary"
                onClick={() => {
                  setQuery('')
                  setClassId('')
                }}
              >
                Clear filters
              </Button>
            }
          />
        ) : (
          <div className="flex flex-col gap-2">
            {roster.map((entry) => (
              <StudentRow
                key={entry.student.id}
                entry={entry}
                classes={state.data.classes}
                quizzes={state.data.quizzes}
                records={state.data}
                scopeClassId={classId || undefined}
                expanded={expandedId === entry.student.id}
                onToggle={() => setExpandedId((open) => (open === entry.student.id ? null : entry.student.id))}
              />
            ))}
          </div>
        )}
      </Panel>
    </DashboardShell>
  )
}
