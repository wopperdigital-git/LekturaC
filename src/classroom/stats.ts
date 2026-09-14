import { personLabel } from './format'
import type { Attempt, Member, Person, Posting } from './types'

/*
  Every performance statistic, defined once.

  - Expected: every (quiz, class) posting for a class the student is in. There
    are no due dates, so joining late still expects earlier quizzes.
  - Completion: submitted ÷ expected; `null` when nothing is expected, because
    a student with nothing posted is not failing.
  - Average: mean of submitted scores only. A missing quiz is already counted
    by completion; scoring it as zero too would punish one absence twice.
  - Trend: the latest TREND_WINDOW scores against the up-to-TREND_WINDOW before
    them. Needs more than TREND_WINDOW scores.

  An attempt only counts against a posting the student is currently expected
  to take, so leaving a class takes its scores out of the picture with it.
*/

export const TREND_WINDOW = 3
/** Five percentage points, as a 0–1 ratio. */
export const TREND_THRESHOLD = 0.05

export type TrendDirection = 'improving' | 'steady' | 'slipping'
export type Trend = { kind: 'insufficient' } | { kind: 'trend'; direction: TrendDirection; delta: number }

export interface HistoryEntry {
  quizId: string
  classId: string
  postedAt: string
  attempt: Attempt | null
}

export interface ScorePoint {
  submittedAt: string
  score: number
}

export interface StudentStats {
  expected: number
  submitted: number
  completion: number | null
  average: number | null
  trend: Trend
  /** Submitted scores, oldest first — what a chart draws. */
  points: ScorePoint[]
  /** One entry per expected posting, newest posting first. */
  history: HistoryEntry[]
}

export interface ClassroomRecords {
  members: readonly Member[]
  postings: readonly Posting[]
  attempts: readonly Attempt[]
}

export interface RosterEntry {
  student: Person
  classIds: string[]
}

const time = (iso: string) => Date.parse(iso)
const keyOf = (quizId: string, classId: string) => `${quizId}|${classId}`
const mean = (values: readonly number[]) => values.reduce((sum, v) => sum + v, 0) / values.length

export function studentStats(studentId: string, records: ClassroomRecords, classId?: string): StudentStats {
  const classIds = new Set(
    records.members
      .filter((m) => m.studentId === studentId && (classId === undefined || m.classId === classId))
      .map((m) => m.classId),
  )
  const attempts = new Map(
    records.attempts.filter((a) => a.studentId === studentId).map((a) => [keyOf(a.quizId, a.classId), a]),
  )

  const history: HistoryEntry[] = records.postings
    .filter((p) => classIds.has(p.classId))
    .map((p) => ({
      quizId: p.quizId,
      classId: p.classId,
      postedAt: p.postedAt,
      attempt: attempts.get(keyOf(p.quizId, p.classId)) ?? null,
    }))
    .sort((a, b) => time(b.postedAt) - time(a.postedAt))

  const points: ScorePoint[] = history
    .flatMap((entry) => (entry.attempt ? [{ submittedAt: entry.attempt.submittedAt, score: entry.attempt.score }] : []))
    .sort((a, b) => time(a.submittedAt) - time(b.submittedAt))

  const expected = history.length
  const submitted = points.length
  const scores = points.map((p) => p.score)

  return {
    expected,
    submitted,
    completion: expected === 0 ? null : submitted / expected,
    average: submitted === 0 ? null : mean(scores),
    trend: trendOf(scores),
    points,
    history,
  }
}

export function trendOf(scores: readonly number[]): Trend {
  if (scores.length <= TREND_WINDOW) return { kind: 'insufficient' }
  const recent = scores.slice(-TREND_WINDOW)
  const before = scores.slice(-2 * TREND_WINDOW, -TREND_WINDOW)
  // Rounded so a difference of exactly five points is not tipped over the
  // threshold by floating-point noise (0.75 - 0.7 is 0.05000000000000004).
  const delta = Math.round((mean(recent) - mean(before)) * 1e9) / 1e9
  const direction: TrendDirection =
    delta > TREND_THRESHOLD ? 'improving' : delta < -TREND_THRESHOLD ? 'slipping' : 'steady'
  return { kind: 'trend', direction, delta }
}

/**
 * Each student once, with the classes they are in, sorted by name.
 *
 * A member whose profile did not come back is kept under a blank Person
 * rather than dropped — a roster that silently loses a student is worse than
 * one that shows "Unnamed account".
 */
export function rosterOf(
  members: readonly Member[],
  people: readonly Person[],
  classId?: string,
): RosterEntry[] {
  const byId = new Map(people.map((p) => [p.id, p]))
  const classesByStudent = new Map<string, string[]>()
  for (const m of members) {
    if (classId !== undefined && m.classId !== classId) continue
    const list = classesByStudent.get(m.studentId) ?? []
    list.push(m.classId)
    classesByStudent.set(m.studentId, list)
  }
  return [...classesByStudent]
    .map(([id, classIds]) => ({
      student: byId.get(id) ?? { id, displayName: '', email: '' },
      classIds,
    }))
    .sort((a, b) => personLabel(a.student).localeCompare(personLabel(b.student)))
}
