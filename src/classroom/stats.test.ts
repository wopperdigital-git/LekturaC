import { describe, expect, it } from 'vitest'
import { rosterOf, studentStats, trendOf } from './stats'
import type { Attempt, Member, Person, Posting } from './types'

const day = (d: number, hour = 9) => `2026-09-${String(d).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00+00:00`
const member = (studentId: string, classId: string): Member => ({ studentId, classId, joinedAt: day(1) })
const posting = (quizId: string, classId: string, d: number): Posting => ({ quizId, classId, postedAt: day(d) })
const attempt = (quizId: string, classId: string, studentId: string, score: number, d: number): Attempt => ({
  quizId,
  classId,
  studentId,
  score,
  submittedAt: day(d, 15),
})

describe('studentStats', () => {
  it('reports nothing expected as null completion and null average, not zeroes', () => {
    const stats = studentStats('s1', { members: [member('s1', 'A')], postings: [], attempts: [] })
    expect(stats.expected).toBe(0)
    expect(stats.completion).toBeNull()
    expect(stats.average).toBeNull()
    expect(stats.trend).toEqual({ kind: 'insufficient' })
  })

  it('lets a missing quiz lower completion but never the average', () => {
    const stats = studentStats('s1', {
      members: [member('s1', 'A')],
      postings: [posting('q1', 'A', 2), posting('q2', 'A', 3)],
      attempts: [attempt('q1', 'A', 's1', 0.9, 2)],
    })
    expect(stats.expected).toBe(2)
    expect(stats.submitted).toBe(1)
    expect(stats.completion).toBe(0.5)
    expect(stats.average).toBe(0.9)
  })

  it("counts a quiz posted to two of the student's classes once per class", () => {
    const stats = studentStats('s1', {
      members: [member('s1', 'A'), member('s1', 'B')],
      postings: [posting('q1', 'A', 2), posting('q1', 'B', 2)],
      attempts: [attempt('q1', 'A', 's1', 0.7, 3)],
    })
    expect(stats.expected).toBe(2)
    expect(stats.submitted).toBe(1)
  })

  it('scopes to one class when given a classId', () => {
    const records = {
      members: [member('s1', 'A'), member('s1', 'B')],
      postings: [posting('q1', 'A', 2), posting('q2', 'B', 2)],
      attempts: [attempt('q1', 'A', 's1', 0.6, 3), attempt('q2', 'B', 's1', 1, 3)],
    }
    const scoped = studentStats('s1', records, 'B')
    expect(scoped.expected).toBe(1)
    expect(scoped.average).toBe(1)
  })

  it('ignores attempts in a class the student is no longer a member of', () => {
    const stats = studentStats('s1', {
      members: [member('s1', 'A')],
      postings: [posting('q1', 'A', 2), posting('q2', 'B', 2)],
      attempts: [attempt('q2', 'B', 's1', 0.1, 3)],
    })
    expect(stats.expected).toBe(1)
    expect(stats.submitted).toBe(0)
    expect(stats.average).toBeNull()
  })

  it("ignores other students' attempts", () => {
    const stats = studentStats('s1', {
      members: [member('s1', 'A'), member('s2', 'A')],
      postings: [posting('q1', 'A', 2)],
      attempts: [attempt('q1', 'A', 's2', 1, 3)],
    })
    expect(stats.submitted).toBe(0)
  })

  it('lists history newest posting first, marks missing quizzes, and orders points chronologically', () => {
    const stats = studentStats('s1', {
      members: [member('s1', 'A')],
      postings: [posting('q1', 'A', 2), posting('q2', 'A', 5), posting('q3', 'A', 8)],
      attempts: [attempt('q3', 'A', 's1', 0.5, 9), attempt('q1', 'A', 's1', 0.9, 3)],
    })
    expect(stats.history.map((h) => h.quizId)).toEqual(['q3', 'q2', 'q1'])
    expect(stats.history[1].attempt).toBeNull()
    expect(stats.points.map((p) => p.score)).toEqual([0.9, 0.5])
  })
})

describe('trendOf', () => {
  it('needs at least four scores', () => {
    expect(trendOf([])).toEqual({ kind: 'insufficient' })
    expect(trendOf([0.5, 0.6, 0.7])).toEqual({ kind: 'insufficient' })
  })

  it('compares the latest three with what came before, even when fewer than three came before', () => {
    expect(trendOf([0.4, 0.8, 0.8, 0.8])).toMatchObject({ kind: 'trend', direction: 'improving' })
  })

  it('treats exactly five points as steady, despite floating-point noise', () => {
    expect(trendOf([0.7, 0.7, 0.7, 0.75, 0.75, 0.75])).toMatchObject({ direction: 'steady', delta: 0.05 })
  })

  it('treats an exact -5-point delta as steady too', () => {
    expect(trendOf([0.75, 0.75, 0.75, 0.7, 0.7, 0.7])).toMatchObject({ direction: 'steady', delta: -0.05 })
  })

  it('calls more than five points improving or slipping', () => {
    expect(trendOf([0.7, 0.7, 0.7, 0.76, 0.76, 0.76])).toMatchObject({ direction: 'improving' })
    expect(trendOf([0.7, 0.7, 0.7, 0.64, 0.64, 0.64])).toMatchObject({ direction: 'slipping' })
  })

  it('looks only at the last six scores', () => {
    expect(trendOf([0, 0, 0, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8])).toMatchObject({ direction: 'steady' })
  })
})

describe('rosterOf', () => {
  const people: Person[] = [
    { id: 's1', displayName: 'Zoe', email: 'zoe@x.test' },
    { id: 's2', displayName: 'Adam', email: 'adam@x.test' },
  ]

  it('lists each student once with every class they are in, sorted by name', () => {
    const roster = rosterOf([member('s1', 'A'), member('s2', 'A'), member('s1', 'B')], people)
    expect(roster.map((r) => r.student.displayName)).toEqual(['Adam', 'Zoe'])
    expect(roster[1].classIds).toEqual(['A', 'B'])
  })

  it('scopes to one class', () => {
    expect(rosterOf([member('s1', 'A'), member('s2', 'B')], people, 'B').map((r) => r.student.id)).toEqual(['s2'])
  })

  it('keeps a member whose profile could not be read rather than hiding them', () => {
    const roster = rosterOf([member('ghost', 'A')], people)
    expect(roster).toEqual([{ student: { id: 'ghost', displayName: '', email: '' }, classIds: ['A'] }])
  })
})
