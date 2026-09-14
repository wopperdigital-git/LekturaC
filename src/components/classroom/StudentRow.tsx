import { useId, useMemo } from 'react'
import { formatCompletion, formatDate, formatPercent, personLabel, describeTrend } from '@/classroom/format'
import { formatSlideRange } from '@/classroom/slideRange'
import { studentStats, type ClassroomRecords, type RosterEntry } from '@/classroom/stats'
import type { ClassRoom, QuizSummary } from '@/classroom/types'
import { Button } from '@/components/ui/Button'
import { ClassChip } from './ClassChip'
import { ScoreChart, Sparkline, TrendBadge } from './charts'

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex flex-col">
      <span className="text-[11px] text-app-muted">{label}</span>
      <span className="text-sm font-medium tabular-nums text-app-foreground">{value}</span>
    </span>
  )
}

/**
 * One student: a summary line that expands in place into the detailed view.
 *
 * `scopeClassId` computes every statistic within one class (the class folder);
 * without it they span all of the teacher's classes and the detail adds a
 * per-class breakdown. The toggle and Remove are sibling buttons — a button
 * inside a button is invalid and breaks keyboard focus.
 */
export function StudentRow({
  entry,
  classes,
  quizzes,
  records,
  scopeClassId,
  expanded,
  onToggle,
  onRemove,
}: {
  entry: RosterEntry
  classes: ClassRoom[]
  quizzes: QuizSummary[]
  records: ClassroomRecords
  scopeClassId?: string
  expanded: boolean
  onToggle: () => void
  onRemove?: () => void
}) {
  const panelId = useId()
  const studentId = entry.student.id
  const stats = useMemo(() => studentStats(studentId, records, scopeClassId), [studentId, records, scopeClassId])
  const classById = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes])
  const quizById = useMemo(() => new Map(quizzes.map((q) => [q.id, q])), [quizzes])
  const name = personLabel(entry.student)
  const scores = stats.points.map((p) => p.score)
  const showBreakdown = !scopeClassId && entry.classIds.length > 1

  return (
    <div className="rounded-app-sm border border-app-border">
      <div className="flex items-center gap-2 pr-2">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={panelId}
          className="flex min-w-0 flex-1 cursor-pointer flex-wrap items-center gap-x-6 gap-y-2 rounded-app-sm px-4 py-3 text-left transition-colors hover:bg-app-surface/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent"
        >
          <span className="min-w-0 flex-1 basis-48">
            <span className="block truncate text-sm font-medium text-app-foreground">{name}</span>
            <span className="block truncate text-xs text-app-muted">{entry.student.email}</span>
            {!scopeClassId && (
              <span className="mt-1 flex flex-wrap gap-1">
                {entry.classIds.map((id) => (
                  <ClassChip key={id} name={classById.get(id)?.name ?? 'Class'} />
                ))}
              </span>
            )}
          </span>
          <Metric label="Average" value={formatPercent(stats.average)} />
          <Metric label="Completed" value={formatCompletion(stats)} />
          <span className="flex items-center gap-2">
            <Sparkline scores={scores} label={`${name}: ${describeTrend(stats.trend)}`} />
            <TrendBadge trend={stats.trend} />
          </span>
          <svg
            className={`size-4 shrink-0 text-app-muted transition-transform ${expanded ? 'rotate-180' : ''}`}
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M4 6l4 4 4-4" />
          </svg>
        </button>
        {onRemove && (
          <Button variant="ghost" onClick={onRemove} className="px-2 py-1 text-xs" aria-label={`Remove ${name}`}>
            Remove
          </Button>
        )}
      </div>

      <div id={panelId} hidden={!expanded} className="border-t border-app-border px-4 py-4">
        {expanded && (
          <div className="flex flex-col gap-6">
            <section>
              <h4 className="mb-2 text-xs font-medium tracking-wide text-app-muted uppercase">Scores over time</h4>
              <ScoreChart points={stats.points} />
            </section>

            {showBreakdown && (
              <section>
                <h4 className="mb-2 text-xs font-medium tracking-wide text-app-muted uppercase">By class</h4>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[20rem] text-left text-sm">
                    <thead className="text-xs text-app-muted">
                      <tr>
                        <th className="py-1.5 pr-4 font-medium">Class</th>
                        <th className="py-1.5 pr-4 font-medium">Average</th>
                        <th className="py-1.5 font-medium">Completed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entry.classIds.map((classId) => {
                        const perClass = studentStats(studentId, records, classId)
                        return (
                          <tr key={classId} className="border-t border-app-border">
                            <td className="py-1.5 pr-4 text-app-foreground">{classById.get(classId)?.name ?? 'Class'}</td>
                            <td className="py-1.5 pr-4 tabular-nums">{formatPercent(perClass.average)}</td>
                            <td className="py-1.5 tabular-nums">{formatCompletion(perClass)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            <section>
              <h4 className="mb-2 text-xs font-medium tracking-wide text-app-muted uppercase">Quiz history</h4>
              {stats.history.length === 0 ? (
                <p className="text-sm text-app-muted">No quizzes have been posted to {scopeClassId ? 'this class' : "this student's classes"} yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[36rem] text-left text-sm">
                    <thead className="text-xs text-app-muted">
                      <tr>
                        <th className="py-1.5 pr-4 font-medium">Quiz</th>
                        <th className="py-1.5 pr-4 font-medium">Class</th>
                        <th className="py-1.5 pr-4 font-medium">Slides</th>
                        <th className="py-1.5 pr-4 font-medium">Score</th>
                        <th className="py-1.5 font-medium">Submitted</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.history.map((h) => {
                        const quiz = quizById.get(h.quizId)
                        return (
                          <tr key={`${h.quizId}-${h.classId}`} className="border-t border-app-border">
                            <td className="py-1.5 pr-4 text-app-foreground">{quiz?.title ?? 'Quiz'}</td>
                            <td className="py-1.5 pr-4">{classById.get(h.classId)?.name ?? 'Class'}</td>
                            <td className="py-1.5 pr-4 text-app-muted">{quiz ? formatSlideRange(quiz.slideNumbers) || '—' : '—'}</td>
                            <td className="py-1.5 pr-4 tabular-nums">
                              {h.attempt ? (
                                formatPercent(h.attempt.score)
                              ) : (
                                <span className="font-medium text-red-600 dark:text-red-400">Missing</span>
                              )}
                            </td>
                            <td className="py-1.5 text-app-muted">{h.attempt ? formatDate(h.attempt.submittedAt) : '—'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
