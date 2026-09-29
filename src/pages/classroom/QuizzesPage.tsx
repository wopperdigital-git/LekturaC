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
import { Select } from '@/components/ui/Select'

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
              <div className="flex items-center gap-2 text-sm text-app-muted">
                <span className="font-medium text-app-muted">Sort</span>
                <Select
                  value={sort}
                  onChange={(v) => setSort(v as QuizSort)}
                  ariaLabel="Sort quizzes"
                  align="right"
                  options={[
                    {
                      value: 'newest',
                      label: 'Newest first',
                      icon: (
                        <svg className="size-3.5 shrink-0 text-app-muted" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                          <path d="M4 3v10M4 13l-2-2M4 13l2-2M8 4h6M8 8h4M8 12h2" />
                        </svg>
                      ),
                    },
                    {
                      value: 'oldest',
                      label: 'Oldest first',
                      icon: (
                        <svg className="size-3.5 shrink-0 text-app-muted" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                          <path d="M4 13V3M4 3l-2 2M4 3l2 2M8 4h2M8 8h4M8 12h6" />
                        </svg>
                      ),
                    },
                  ]}
                />
              </div>
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
            icon={
              <svg className="size-6 text-app-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
            }
            title="No quizzes yet"
            body="Quizzes you generate from a deck will show up here, with the slides they came from and the classes they're posted in."
          />
        ) : visible.length === 0 ? (
          <PanelMessage
            icon={
              <svg className="size-6 text-app-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
            }
            title="No quizzes match"
            body="No assessments match your current search query or class filter."
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
          <div className="flex flex-col gap-3.5">
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
