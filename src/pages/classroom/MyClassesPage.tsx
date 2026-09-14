import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { describeError } from '@/store/presentationStore'
import { joinClass, loadStudentClassroom } from '@/classroom/api'
import { matchesQuery, personLabel, plural } from '@/classroom/format'
import { JOIN_CODE_LENGTH, joinCodeProblem, normalizeJoinCode } from '@/classroom/joinCode'
import { useAsync } from '@/classroom/useAsync'
import { invalidateMyClasses } from '@/classroom/useMyClasses'
import { DashboardShell } from '@/components/home/DashboardShell'
import { relativePostedAt } from '@/components/home/relativeTime'
import { LoadError, Panel, PanelMessage, RowsSkeleton } from '@/components/classroom/Panel'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'

export function MyClassesPage() {
  const navigate = useNavigate()
  const userId = useAuthStore((s) => s.user?.id ?? '')
  const { state, reload } = useAsync(loadStudentClassroom, userId)
  const [query, setQuery] = useState('')
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState<string | null>(null)
  const [joining, setJoining] = useState(false)

  async function join(e: FormEvent) {
    e.preventDefault()
    const problem = joinCodeProblem(code)
    if (problem) {
      setCodeError(problem)
      return
    }
    setJoining(true)
    setCodeError(null)
    try {
      const classId = await joinClass(code)
      invalidateMyClasses()
      void navigate(`/classes/${classId}`)
    } catch (err) {
      setCodeError(describeError(err))
      setJoining(false)
    }
  }

  const data = state.status === 'ready' ? state.data : null
  const visible = data ? data.classes.filter((c) => matchesQuery(query, c.name, c.description)) : []

  return (
    <DashboardShell
      title="My classes"
      subtitle={data ? (data.classes.length > 0 ? plural(data.classes.length, 'class', 'classes') : 'Join a class with the code your teacher shares') : 'Loading your classes…'}
      query={query}
      onQueryChange={setQuery}
    >
      <div className="mb-6 rounded-app border border-app-border bg-app-background p-4 shadow-sm sm:p-5">
        <h2 className="mb-3 text-sm font-semibold text-app-foreground">Join a class</h2>
        <form onSubmit={(e) => void join(e)} noValidate className="flex flex-col gap-2 sm:flex-row sm:items-start">
          <div className="sm:w-60">
            <Field
              label="Class code"
              error={codeError}
              render={(fieldProps) => (
                <Input
                  {...fieldProps}
                  value={code}
                  onChange={(e) => {
                    setCode(normalizeJoinCode(e.target.value).slice(0, JOIN_CODE_LENGTH))
                    if (codeError) setCodeError(null)
                  }}
                  placeholder="e.g. QWERT9"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  className="font-mono tracking-[0.2em]"
                />
              )}
            />
          </div>
          <Button type="submit" variant="primary" loading={joining} className="sm:mt-5">
            {joining ? 'Joining…' : 'Join class'}
          </Button>
        </form>
      </div>

      <Panel>
        {state.status === 'loading' ? (
          <RowsSkeleton count={3} />
        ) : state.status === 'error' ? (
          <LoadError message={state.error} onRetry={reload} />
        ) : state.data.classes.length === 0 ? (
          <PanelMessage title="You're not in any classes yet" body="Ask your teacher for the class code and enter it above." />
        ) : visible.length === 0 ? (
          <PanelMessage
            title={`No classes match "${query.trim()}"`}
            action={
              <Button variant="secondary" onClick={() => setQuery('')}>
                Clear search
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((c) => {
              const teacher = state.data.teachers.find((t) => t.id === c.teacherId)
              const latest = state.data.announcements.find((a) => a.classId === c.id)
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => void navigate(`/classes/${c.id}`)}
                  className="flex cursor-pointer flex-col items-start gap-1 rounded-app border border-app-border bg-app-background px-5 py-4 text-left shadow-sm transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent"
                >
                  <span className="text-base font-semibold text-app-foreground">{c.name}</span>
                  <span className="text-xs text-app-muted">{teacher ? `Taught by ${personLabel(teacher)}` : 'Your teacher'}</span>
                  <span className="mt-2 line-clamp-2 text-sm text-app-muted">
                    {latest ? `${latest.title} · ${relativePostedAt(latest.createdAt)}` : 'No announcements yet'}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </Panel>
    </DashboardShell>
  )
}
