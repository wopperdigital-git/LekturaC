import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { HardCheckpoint, StudentProgress } from '@/lesson/progress'
import { LessonProgressView } from './LessonProgressModal'

/** A render smoke test (no jsdom): who has done the lesson and which checkpoints were missed. */

const students = [
  { id: 's1', name: 'Ada Lovelace' },
  { id: 's2', name: 'Grace Hopper' },
  { id: 's3', name: 'Alan Turing' },
]

const progress: StudentProgress[] = [
  { studentId: 's1', status: 'finished', answered: 3, total: 3, score: 0.67 },
  { studentId: 's2', status: 'in_progress', answered: 1, total: 3, score: null },
  { studentId: 's3', status: 'not_started', answered: 0, total: 3, score: null },
]

const hardest: HardCheckpoint[] = [
  { questionId: 'q2', prompt: 'What does the nucleus hold?', slideNumber: 4, answered: 2, missed: 2, missRate: 1 },
  { questionId: 'q1', prompt: 'Where is energy made?', slideNumber: 2, answered: 2, missed: 1, missRate: 0.5 },
]

describe('LessonProgressView', () => {
  const html = renderToStaticMarkup(<LessonProgressView students={students} progress={progress} hardest={hardest} />)

  it('lists each student with status and score', () => {
    expect(html).toContain('Ada Lovelace')
    expect(html).toContain('Finished')
    expect(html).toContain('67%')
    expect(html).toContain('In progress')
    expect(html).toContain('1 of 3')
    expect(html).toContain('Not started')
  })

  it('lists the hardest checkpoints with how many were missed, hardest first', () => {
    expect(html).toContain('100% missed')
    expect(html).toContain('50% missed')
    expect(html).toContain('Slide 4')
    expect(html.indexOf('What does the nucleus hold?')).toBeLessThan(html.indexOf('Where is energy made?'))
  })

  it('says so when nothing has been answered', () => {
    const empty = renderToStaticMarkup(<LessonProgressView students={students} progress={progress} hardest={[]} />)
    expect(empty).toContain('No answers yet')
    expect(empty).not.toContain('% missed')
  })

  it('says so when nobody is enrolled', () => {
    const none = renderToStaticMarkup(<LessonProgressView students={[]} progress={[]} hardest={[]} />)
    expect(none).toContain('No students in this class yet.')
  })
})
