import { useMemo, useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import { loadTeacherClassroom } from '@/classroom/api'
import { plural } from '@/classroom/format'
import { selectQuizzes, type QuizSort } from '@/classroom/select'
import { useAsync } from '@/classroom/useAsync'
import { DashboardShell } from '@/components/home/DashboardShell'
import { ClassFilter } from '@/components/classroom/ClassFilter'
import { LoadError, Panel, PanelMessage, RowsSkeleton } from '@/components/classroom/Panel'
import { QuizRow } from '@/components/classroom/QuizRow'
import { Button } from '@/components/ui/Button'

export function QuizzesPage() {
  const userId = useAuthStore((s) => s.user?.id ?? '')
  const { state, reload } = useAsync(loadTeacherClassroom, userId)
  const [query, setQuery] = useState('')
  const [classId, setClassId] = useState('')
  const [sort, setSort] = useState<QuizSort>('newest')

  const data = state.status === 'ready' ? state.data : null
  const visible = useMemo(
    () => (data ? selectQuizzes(data.quizzes, data.postings, { query, classId, sort }) : []),
    [data, query, classId, sort],
  )

  const subtitle = data
    ? data.quizzes.length > 0
      ? `${plural(data.quizzes.length, 'quiz', 'quizzes')} · Generated from your decks`
      : 'Quizzes you generate from a deck will show up here'
    : 'Loading your quizzes…'

  return (
    <DashboardShell title="Quizzes" subtitle={subtitle} query={query} onQueryChange={setQuery}>
      <Panel
        toolbar={
          data && data.quizzes.length > 0 ? (
            <>
              <ClassFilter classes={data.classes} value={classId} onChange={setClassId} />
              <label className="flex items-center gap-2 text-sm text-app-muted">
                <span>Sort</span>
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as QuizSort)}
                  className="rounded-app-sm border border-app-border bg-app-background px-2.5 py-1.5 text-sm text-app-foreground outline-none focus:border-app-accent focus:ring-2 focus:ring-app-accent/25"
                >
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                </select>
              </label>
            </>
          ) : undefined
        }
      >
        {state.status === 'loading' ? (
          <RowsSkeleton />
        ) : state.status === 'error' ? (
          <LoadError message={state.error} onRetry={reload} />
        ) : state.data.quizzes.length === 0 ? (
          <PanelMessage
            title="No quizzes yet"
            body="Quizzes you generate from a deck will show up here, with the slides they came from and the classes they're posted in."
          />
        ) : visible.length === 0 ? (
          <PanelMessage
            title="No quizzes match"
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
            {visible.map((quiz) => {
              const postedClassIds = new Set(
                state.data.postings.filter((p) => p.quizId === quiz.id).map((p) => p.classId),
              )
              return (
                <QuizRow
                  key={quiz.id}
                  quiz={quiz}
                  postedIn={state.data.classes.filter((c) => postedClassIds.has(c.id))}
                  allClasses={state.data.classes}
                  onChanged={reload}
                />
              )
            })}
          </div>
        )}
      </Panel>
    </DashboardShell>
  )
}
