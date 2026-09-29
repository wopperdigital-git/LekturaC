import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { describeError } from '@/store/presentationStore'
import { joinClass, loadStudentClassroom } from '@/classroom/api'
import { matchesQuery, personLabel, plural } from '@/classroom/format'
import { JOIN_CODE_LENGTH, joinCodeProblem, normalizeJoinCode } from '@/classroom/joinCode'
import { useAsync } from '@/classroom/useAsync'
import { invalidateMyClasses } from '@/classroom/useMyClasses'
import { QUIZ_CODE_LENGTH, normalizeQuizCode, quizCodeProblem } from '@/quiz/quizCode'
import { DashboardShell } from '@/components/home/DashboardShell'
import { relativePostedAt } from '@/components/home/relativeTime'
import { LoadError, Panel, PanelMessage, RowsSkeleton } from '@/components/classroom/Panel'
import { Button } from '@/components/ui/Button'

/**
 * Executive Academic Student Hub.
 * Provides rapid class joining, direct quiz access, and rich course cards with activity metrics.
 */
export function MyClassesPage() {
  const navigate = useNavigate()
  const userId = useAuthStore((s) => s.user?.id ?? '')
  const role = useAuthStore((s) => s.profile?.role ?? 'general')
  const refreshProfile = useAuthStore((s) => s.refreshProfile)
  const { state, reload } = useAsync(loadStudentClassroom, userId)
  const [query, setQuery] = useState('')
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState<string | null>(null)
  const [joining, setJoining] = useState(false)
  const [quizCode, setQuizCode] = useState('')
  const [quizCodeError, setQuizCodeError] = useState<string | null>(null)

  function openQuiz(e: FormEvent) {
    e.preventDefault()
    const problem = quizCodeProblem(quizCode)
    if (problem) {
      setQuizCodeError(problem)
      return
    }
    void navigate(`/quiz/${normalizeQuizCode(quizCode)}`)
  }

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
      // A General account is promoted to Student by the join itself (migration
      // 0010), and the client has to catch up before navigating: the class page
      // is student-only, so a profile still reading General would be bounced
      // straight back to the dashboard by RequireRole.
      await refreshProfile()
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
      title={role === 'general' ? 'Join a Class' : 'My Classes'}
      subtitle={
        data
          ? data.classes.length > 0
            ? plural(data.classes.length, 'enrolled class', 'enrolled classes')
            : 'Enter a class code or quiz code to access your courses'
          : 'Loading your classes…'
      }
      query={query}
      onQueryChange={setQuery}
    >
      {/* Executive Quick Access Portal: Side-by-Side Join Class & Quiz Entry */}
      <div className="mb-8 grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Card 1: Join Classroom */}
        <div className="relative flex flex-col justify-between overflow-hidden rounded-app border border-app-border bg-app-background p-5 shadow-sm transition-all duration-200 hover:border-app-accent/40 hover:shadow-md">
          <div>
            <div className="flex items-center gap-3">
              <div className="grid size-10 shrink-0 place-items-center rounded-xl border border-app-accent/25 bg-app-accent/10 text-app-accent shadow-2xs">
                <svg
                  className="size-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
                  <path d="M6 6h10M6 10h10" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-semibold tracking-tight text-app-foreground">
                  Join a Classroom
                </h3>
                <p className="text-xs text-app-muted">
                  Enter the 6-character code provided by your instructor
                </p>
              </div>
            </div>

            <form onSubmit={(e) => void join(e)} noValidate className="mt-4 flex flex-col gap-3">
              <div className="relative flex items-center">
                <div className="pointer-events-none absolute left-3.5 text-app-muted">
                  <svg
                    className="size-4"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    aria-hidden="true"
                  >
                    <circle cx="8" cy="8" r="6" />
                    <path d="M8 5.2v5.6M5.2 8h5.6" />
                  </svg>
                </div>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => {
                    setCode(normalizeJoinCode(e.target.value).slice(0, JOIN_CODE_LENGTH))
                    if (codeError) setCodeError(null)
                  }}
                  placeholder="e.g. QWERT9"
                  maxLength={JOIN_CODE_LENGTH}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  aria-label="Class code"
                  className="w-full rounded-app-sm border border-app-border bg-app-surface/60 py-2.5 pr-14 pl-10 font-mono text-sm font-semibold tracking-[0.22em] text-app-foreground uppercase outline-none transition-all placeholder:font-sans placeholder:font-normal placeholder:tracking-normal placeholder:text-app-muted/60 focus:border-app-accent focus:bg-app-background focus:ring-2 focus:ring-app-accent/25"
                />
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute right-3 font-mono text-[11px] font-medium text-app-muted"
                >
                  {code.length}/{JOIN_CODE_LENGTH}
                </div>
              </div>

              {codeError && <p className="text-xs font-medium text-red-600">{codeError}</p>}

              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] text-app-muted">Letters & numbers only</span>
                <Button
                  type="submit"
                  variant="primary"
                  loading={joining}
                  disabled={joining || code.length < JOIN_CODE_LENGTH}
                  className="gap-2 self-end text-xs"
                >
                  <span>{joining ? 'Joining…' : 'Join class'}</span>
                  <span aria-hidden="true">→</span>
                </Button>
              </div>
            </form>
          </div>
        </div>

        {/* Card 2: Open Quiz */}
        <div className="relative flex flex-col justify-between overflow-hidden rounded-app border border-app-border bg-app-background p-5 shadow-sm transition-all duration-200 hover:border-blue-500/40 hover:shadow-md">
          <div>
            <div className="flex items-center gap-3">
              <div className="grid size-10 shrink-0 place-items-center rounded-xl border border-blue-500/25 bg-blue-500/10 text-blue-600 shadow-2xs dark:text-blue-400">
                <svg
                  className="size-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-semibold tracking-tight text-app-foreground">
                  Take a Quiz
                </h3>
                <p className="text-xs text-app-muted">
                  Have an 8-character quiz code? Jump straight into testing
                </p>
              </div>
            </div>

            <form onSubmit={openQuiz} noValidate className="mt-4 flex flex-col gap-3">
              <div className="relative flex items-center">
                <div className="pointer-events-none absolute left-3.5 text-app-muted">
                  <svg
                    className="size-4"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    aria-hidden="true"
                  >
                    <rect x="3" y="2" width="10" height="12" rx="1.5" />
                    <path d="M5.5 6l1 1 2-2M5.5 10.5l1 1 2-2M10 6.2h.5M10 10.7h.5" />
                  </svg>
                </div>
                <input
                  type="text"
                  value={quizCode}
                  onChange={(e) => {
                    setQuizCode(normalizeQuizCode(e.target.value).slice(0, QUIZ_CODE_LENGTH))
                    if (quizCodeError) setQuizCodeError(null)
                  }}
                  placeholder="e.g. K7M2QX9P"
                  maxLength={QUIZ_CODE_LENGTH}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  aria-label="Quiz code"
                  className="w-full rounded-app-sm border border-app-border bg-app-surface/60 py-2.5 pr-14 pl-10 font-mono text-sm font-semibold tracking-[0.22em] text-app-foreground uppercase outline-none transition-all placeholder:font-sans placeholder:font-normal placeholder:tracking-normal placeholder:text-app-muted/60 focus:border-app-accent focus:bg-app-background focus:ring-2 focus:ring-app-accent/25"
                />
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute right-3 font-mono text-[11px] font-medium text-app-muted"
                >
                  {quizCode.length}/{QUIZ_CODE_LENGTH}
                </div>
              </div>

              {quizCodeError && <p className="text-xs font-medium text-red-600">{quizCodeError}</p>}

              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] text-app-muted">Direct assessment access</span>
                <Button
                  type="submit"
                  variant="secondary"
                  disabled={quizCode.length < QUIZ_CODE_LENGTH}
                  className="gap-2 self-end text-xs"
                >
                  <span>Open quiz</span>
                  <span aria-hidden="true">→</span>
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* Classroom Section Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <h2 className="text-base font-semibold tracking-tight text-app-foreground sm:text-lg">
            Enrolled Classes
          </h2>
          {data && data.classes.length > 0 && (
            <span className="grid min-w-5 place-items-center rounded-full border border-app-border bg-app-surface px-2 py-0.5 text-xs font-semibold tabular-nums text-app-muted">
              {data.classes.length}
            </span>
          )}
        </div>
      </div>

      <Panel>
        {state.status === 'loading' ? (
          <RowsSkeleton count={3} />
        ) : state.status === 'error' ? (
          <LoadError message={state.error} onRetry={reload} />
        ) : state.data.classes.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-app border border-dashed border-app-border/80 bg-app-surface/20 px-6 py-16 text-center">
            <div className="mb-4 grid size-14 place-items-center rounded-2xl border border-app-accent/20 bg-app-accent/10 text-app-accent shadow-xs">
              <svg
                className="size-7"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
                <path d="M6 12v5c3 3 9 3 12 0v-5" />
              </svg>
            </div>
            <h3 className="text-base font-semibold text-app-foreground">
              You're not in any classes yet
            </h3>
            <p className="mt-1.5 max-w-sm text-xs text-app-muted">
              Ask your teacher or professor for their 6-character class code, then enter it in the portal above to join.
            </p>
          </div>
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
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((c) => {
              const teacher = state.data.teachers.find((t) => t.id === c.teacherId)
              const classAnnouncements = state.data.announcements.filter((a) => a.classId === c.id)
              const latest = classAnnouncements[0]
              const classQuizzesCount = state.data.postings.filter((p) => p.classId === c.id).length
              const monogram = c.name
                .split(/\s+/)
                .map((w) => w[0])
                .join('')
                .slice(0, 2)
                .toUpperCase()

              return (
                <div
                  key={c.id}
                  onClick={() => void navigate(`/classes/${c.id}`)}
                  className="group relative flex cursor-pointer flex-col overflow-hidden rounded-app border border-app-border bg-app-background shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-app-accent/40 hover:shadow-md focus-within:ring-2 focus-within:ring-app-accent"
                >
                  {/* Decorative top accent gradient bar */}
                  <div className="h-1 w-full bg-gradient-to-r from-app-accent/80 via-app-accent to-app-highlight" />

                  <div className="flex flex-1 flex-col p-5">
                    <div className="flex items-start gap-3">
                      {/* Monogram avatar */}
                      <div className="grid size-10 shrink-0 place-items-center rounded-xl border border-app-accent/20 bg-app-accent/10 font-mono text-sm font-bold text-app-accent shadow-2xs">
                        {monogram}
                      </div>

                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-base font-semibold tracking-tight text-app-foreground transition-colors group-hover:text-app-accent">
                          {c.name}
                        </h3>
                        <p className="mt-0.5 truncate text-xs text-app-muted">
                          {teacher ? `Taught by ${personLabel(teacher)}` : 'Teacher assigned'}
                        </p>
                      </div>
                    </div>

                    {c.description && (
                      <p className="mt-3 line-clamp-2 text-xs text-app-muted/90">
                        {c.description}
                      </p>
                    )}

                    {/* Bento activity capsules */}
                    <div className="mt-4 flex flex-wrap gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-app-border bg-app-surface/60 px-2.5 py-1 text-xs text-app-muted">
                        <svg
                          className="size-3 text-app-muted"
                          viewBox="0 0 16 16"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          aria-hidden="true"
                        >
                          <rect x="3" y="2" width="10" height="12" rx="1.5" />
                          <path d="M5.5 6l1 1 2-2M5.5 10.5l1 1 2-2" />
                        </svg>
                        <span>
                          {classQuizzesCount > 0
                            ? plural(classQuizzesCount, 'quiz', 'quizzes')
                            : 'No quizzes'}
                        </span>
                      </span>

                      <span className="inline-flex items-center gap-1.5 rounded-full border border-app-border bg-app-surface/60 px-2.5 py-1 text-xs text-app-muted">
                        <svg
                          className="size-3 text-app-muted"
                          viewBox="0 0 16 16"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          aria-hidden="true"
                        >
                          <path d="M8 2.5a5.5 5.5 0 0 0-5.5 5.5v2L1 12v1h14v-1l-1.5-2v-2A5.5 5.5 0 0 0 8 2.5z" />
                        </svg>
                        <span>
                          {classAnnouncements.length > 0
                            ? plural(classAnnouncements.length, 'update', 'updates')
                            : 'No updates'}
                        </span>
                      </span>
                    </div>

                    {/* Latest Notice Preview */}
                    <div className="mt-4 rounded-app-sm border border-app-border/70 bg-app-surface/30 p-2.5 text-xs">
                      <div className="flex items-center justify-between text-[11px] text-app-muted">
                        <span className="font-semibold uppercase tracking-wider text-[10px]">
                          Latest Notice
                        </span>
                        {latest && <span>{relativePostedAt(latest.createdAt)}</span>}
                      </div>
                      <p className="mt-1 line-clamp-1 font-medium text-app-foreground/90">
                        {latest ? latest.title : 'No announcements yet'}
                      </p>
                    </div>

                    {/* Footer link */}
                    <div className="mt-5 flex items-center justify-between border-t border-app-border/60 pt-3 text-xs font-semibold text-app-accent">
                      <span>Enter Classroom</span>
                      <span
                        className="transition-transform duration-150 group-hover:translate-x-1"
                        aria-hidden="true"
                      >
                        →
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Panel>
    </DashboardShell>
  )
}
