import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import type { StudentQuizItem } from '@/classroom/select'
import { StudentQuizRow } from './StudentQuizRow'

/** A render smoke test (no jsdom): where a posted quiz or lesson sends the student, and what it says. */

function item(overrides: Partial<StudentQuizItem> = {}): StudentQuizItem {
  return {
    quiz: { id: 'q1', title: 'Cells', code: 'ABCD23XY', quizType: 'multiple_choice', createdAt: '2026-10-01T00:00:00Z' },
    classId: 'c1',
    postedAt: '2026-10-02T00:00:00Z',
    mode: 'quiz',
    started: false,
    attempt: null,
    ...overrides,
  }
}

function render(i: StudentQuizItem) {
  return renderToStaticMarkup(
    <MemoryRouter>
      <StudentQuizRow item={i} />
    </MemoryRouter>,
  )
}

describe('StudentQuizRow', () => {
  it('still links an open quiz to /quiz/<code>', () => {
    const html = render(item())
    expect(html).toContain('href="/quiz/ABCD23XY"')
    expect(html).toContain('Take quiz')
    expect(html).not.toContain('/lesson/')
  })

  it('links a lesson not yet started to /lesson/<code>/<classId> as Start lesson', () => {
    const html = render(item({ mode: 'lesson' }))
    expect(html).toContain('href="/lesson/ABCD23XY/c1"')
    expect(html).toContain('Start lesson')
    expect(html).not.toContain('Continue lesson')
    expect(html).not.toContain('Take quiz')
  })

  it('reads Continue lesson once the lesson is started', () => {
    const html = render(item({ mode: 'lesson', started: true }))
    expect(html).toContain('href="/lesson/ABCD23XY/c1"')
    expect(html).toContain('Continue lesson')
    expect(html).not.toContain('Start lesson')
  })

  it('shows Finished with the whole-number score for a finished lesson, and nothing to press', () => {
    const html = render(
      item({
        mode: 'lesson',
        started: true,
        attempt: { quizId: 'q1', classId: 'c1', studentId: 's1', score: 0.8, submittedAt: '2026-10-03T00:00:00Z' },
      }),
    )
    expect(html).toContain('Finished · 80%')
    expect(html).not.toContain('href=')
  })
})
