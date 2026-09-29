import { useId, useMemo } from 'react'
import {
  formatCompletion,
  formatDate,
  formatPercent,
  personLabel,
  describeTrend,
} from '@/classroom/format'
import { formatSlideRange } from '@/classroom/slideRange'
import { studentStats, type ClassroomRecords, type RosterEntry } from '@/classroom/stats'
import type { ClassRoom, QuizSummary } from '@/classroom/types'
import { Button } from '@/components/ui/Button'
import { ClassChip } from './ClassChip'
import { ScoreChart, Sparkline, TrendBadge } from './charts'

function MetricPill({
  label,
  value,
  highlight = false,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div className="flex flex-col items-start gap-0.5 sm:items-end">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-app-muted">
        {label}
      </span>
      <span
        className={`font-mono text-xs font-semibold tabular-nums ${
          highlight && value !== '—'
            ? 'text-app-accent-text'
            : 'text-app-foreground'
        }`}
      >
        {value}
      </span>
    </div>
  )
}

/**
 * Executive Student Academic Dossier.
 * Displays student identity, average grade, completion status, trajectory sparklines,
 * and expands into an in-depth analytics dossier with submission histories.
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
  const stats = useMemo(
    () => studentStats(studentId, records, scopeClassId),
    [studentId, records, scopeClassId],
  )
  const classById = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes])
  const quizById = useMemo(() => new Map(quizzes.map((q) => [q.id, q])), [quizzes])
  const name = personLabel(entry.student)
  const scores = stats.points.map((p) => p.score)
  const showBreakdown = !scopeClassId && entry.classIds.length > 1

  const initial = name.charAt(0).toUpperCase() || '?'

  return (
    <div
      className={`overflow-hidden rounded-app border transition-all duration-200 ${
        expanded
          ? 'border-app-accent/50 bg-app-background shadow-sm ring-1 ring-app-accent/20'
          : 'border-app-border bg-app-background shadow-xs hover:border-app-accent/30 hover:shadow-sm'
      }`}
    >
      <div className="flex items-center justify-between gap-2 pr-2">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={panelId}
          className="flex min-w-0 flex-1 cursor-pointer flex-wrap items-center justify-between gap-4 rounded-app-sm p-4 text-left transition-colors hover:bg-app-surface/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent"
        >
          {/* Student Profile Info */}
          <div className="flex min-w-0 flex-1 basis-64 items-center gap-3.5">
            <div
              aria-hidden="true"
              className="grid size-11 shrink-0 place-items-center rounded-xl border border-app-accent/20 bg-app-accent/10 font-mono text-sm font-bold text-app-accent shadow-2xs"
            >
              {initial}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-semibold tracking-tight text-app-foreground">
                  {name}
                </span>
              </div>
              <span className="block truncate text-xs text-app-muted">
                {entry.student.email}
              </span>
              {!scopeClassId && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {entry.classIds.map((id) => (
                    <ClassChip key={id} name={classById.get(id)?.name ?? 'Class'} />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right-Side Performance Metrics */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <MetricPill
              label="Avg Grade"
              value={formatPercent(stats.average)}
              highlight={stats.average !== null}
            />

            <MetricPill label="Completed" value={formatCompletion(stats)} />

            <div className="flex items-center gap-2.5">
              {scores.length >= 2 && (
                <Sparkline scores={scores} label={`${name}: ${describeTrend(stats.trend)}`} />
              )}
              <TrendBadge trend={stats.trend} />
            </div>

            <div
              className={`grid size-8 shrink-0 place-items-center rounded-full text-app-muted transition-transform duration-200 ${
                expanded ? 'rotate-180 bg-app-surface text-app-foreground' : ''
              }`}
              aria-hidden="true"
            >
              <svg
                className="size-4"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 6l4 4 4-4" />
              </svg>
            </div>
          </div>
        </button>

        {onRemove && (
          <Button
            variant="ghost"
            onClick={onRemove}
            className="px-2.5 py-1 text-xs text-red-600 hover:bg-red-500/10 dark:text-red-400"
            aria-label={`Remove ${name}`}
          >
            Remove
          </Button>
        )}
      </div>

      {/* Expanded Detailed Dossier */}
      <div id={panelId} hidden={!expanded} className="border-t border-app-border/80 bg-app-surface/20 p-5 sm:p-6">
        {expanded && (
          <div className="flex flex-col gap-6">
            {/* Section 1: Performance Trajectory */}
            <section className="flex flex-col gap-2.5">
              <div className="flex items-center gap-2">
                <div className="grid size-6 place-items-center rounded-md bg-app-accent/10 text-app-accent">
                  <svg
                    className="size-3.5"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M2 13l4-5 3 3 5-8" />
                  </svg>
                </div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-app-foreground">
                  Performance Trajectory
                </h4>
              </div>

              <div className="rounded-app-sm border border-app-border bg-app-background p-4 shadow-2xs">
                <ScoreChart points={stats.points} />
              </div>
            </section>

            {/* Section 2: Class Enrollment Breakdown (when applicable) */}
            {showBreakdown && (
              <section className="flex flex-col gap-2.5">
                <div className="flex items-center gap-2">
                  <div className="grid size-6 place-items-center rounded-md bg-app-accent/10 text-app-accent">
                    <svg
                      className="size-3.5"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M2 4.5A1.5 1.5 0 013.5 3h3l1.5 1.5h4.5A1.5 1.5 0 0114 6v5.5a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 11.5z" />
                    </svg>
                  </div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-app-foreground">
                    Class Enrollment Breakdown
                  </h4>
                </div>

                <div className="overflow-x-auto rounded-app-sm border border-app-border bg-app-background shadow-2xs">
                  <table className="w-full min-w-[24rem] text-left text-sm">
                    <thead className="border-b border-app-border bg-app-surface/60 text-xs font-semibold uppercase tracking-wider text-app-muted">
                      <tr>
                        <th className="px-4 py-2.5 font-medium">Classroom</th>
                        <th className="px-4 py-2.5 font-medium">Average Score</th>
                        <th className="px-4 py-2.5 font-medium">Quizzes Completed</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-app-border text-xs sm:text-sm">
                      {entry.classIds.map((cId) => {
                        const perClass = studentStats(studentId, records, cId)
                        return (
                          <tr key={cId} className="hover:bg-app-surface/30 transition-colors">
                            <td className="px-4 py-3 font-medium text-app-foreground">
                              {classById.get(cId)?.name ?? 'Class'}
                            </td>
                            <td className="px-4 py-3 font-mono font-semibold tabular-nums text-app-foreground">
                              {formatPercent(perClass.average)}
                            </td>
                            <td className="px-4 py-3 font-mono tabular-nums text-app-muted">
                              {formatCompletion(perClass)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* Section 3: Quiz History */}
            <section className="flex flex-col gap-2.5">
              <div className="flex items-center gap-2">
                <div className="grid size-6 place-items-center rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400">
                  <svg
                    className="size-3.5"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="3" y="2" width="10" height="12" rx="1.5" />
                    <path d="M5.5 6l1 1 2-2M5.5 10.5l1 1 2-2M10 6.2h.5M10 10.7h.5" />
                  </svg>
                </div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-app-foreground">
                  Assessment History & Submissions
                </h4>
              </div>

              {stats.history.length === 0 ? (
                <div className="flex items-center gap-3.5 rounded-app-sm border border-dashed border-app-border bg-app-background p-5 text-sm">
                  <div className="grid size-10 shrink-0 place-items-center rounded-xl border border-app-border bg-app-surface text-app-muted">
                    <svg
                      className="size-5"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                    >
                      <rect x="3" y="2" width="10" height="12" rx="1.5" />
                      <path d="M6 7h4M6 10h2" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-app-foreground sm:text-sm">
                      No quizzes assigned to {scopeClassId ? 'this classroom' : "this student's classes"} yet
                    </p>
                    <p className="mt-0.5 text-xs text-app-muted">
                      When quizzes are posted in their classes, submission status and score breakdowns will appear here.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-app-sm border border-app-border bg-app-background shadow-2xs">
                  <table className="w-full min-w-[36rem] text-left text-sm">
                    <thead className="border-b border-app-border bg-app-surface/60 text-xs font-semibold uppercase tracking-wider text-app-muted">
                      <tr>
                        <th className="px-4 py-2.5 font-medium">Quiz Title</th>
                        <th className="px-4 py-2.5 font-medium">Classroom</th>
                        <th className="px-4 py-2.5 font-medium">Curriculum Slides</th>
                        <th className="px-4 py-2.5 font-medium">Grade / Score</th>
                        <th className="px-4 py-2.5 font-medium">Submission Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-app-border text-xs sm:text-sm">
                      {stats.history.map((h) => {
                        const quiz = quizById.get(h.quizId)
                        return (
                          <tr
                            key={`${h.quizId}-${h.classId}`}
                            className="hover:bg-app-surface/30 transition-colors"
                          >
                            <td className="px-4 py-3 font-medium text-app-foreground">
                              {quiz?.title ?? 'Quiz'}
                            </td>
                            <td className="px-4 py-3 text-xs text-app-muted">
                              <ClassChip name={classById.get(h.classId)?.name ?? 'Class'} />
                            </td>
                            <td className="px-4 py-3 font-mono text-xs text-app-muted">
                              {quiz ? formatSlideRange(quiz.slideNumbers) || '—' : '—'}
                            </td>
                            <td className="px-4 py-3">
                              {h.attempt ? (
                                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-0.5 font-mono text-xs font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                                  {formatPercent(h.attempt.score)}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                                  Pending
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-xs text-app-muted tabular-nums">
                              {h.attempt ? formatDate(h.attempt.submittedAt) : '—'}
                            </td>
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
