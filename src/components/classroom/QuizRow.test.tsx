import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import type { ClassRoom, QuizSummary } from '@/classroom/types'
import { QuizRow } from './QuizRow'

/** A render smoke test (no jsdom): what the teacher's quiz card offers. */

const quiz: QuizSummary = {
  id: 'q1',
  title: 'Cells — quiz',
  deckTitle: 'Cells',
  presentationId: 'd1',
  createdAt: '2026-10-01T00:00:00Z',
  slideNumbers: [1, 2],
  code: 'ABCD23XY',
  quizType: 'multiple_choice',
}

const klass: ClassRoom = { id: 'c1', teacherId: 't1', name: 'Biology 9', description: '', joinCode: 'JOIN1234', createdAt: '' }

const records = { members: [], students: [], attempts: [] }

function render(postedIn: ClassRoom[] = [], lessonModes: ReadonlySet<string> = new Set()) {
  return renderToStaticMarkup(
    <MemoryRouter>
      <QuizRow
        quiz={quiz}
        postedIn={postedIn}
        allClasses={[klass]}
        lessonModes={lessonModes}
        records={records}
        onChanged={() => {}}
      />
    </MemoryRouter>,
  )
}

describe('QuizRow', () => {
  it('offers a Delete button named after the quiz', () => {
    expect(render()).toContain('aria-label="Delete Cells — quiz"')
  })

  it('still offers Delete once the quiz is posted to every class', () => {
    const html = render([klass])
    expect(html).toContain('Posted to every classroom')
    expect(html).toContain('aria-label="Delete Cells — quiz"')
  })

  it('does not ask before the button is pressed', () => {
    expect(render()).not.toContain('Checking submissions')
  })

  it('marks a posting made as a lesson with a Lesson chip that opens its progress', () => {
    const html = render([klass], new Set(['q1|c1']))
    expect(html).toContain('>Lesson<')
    expect(html).toContain('aria-label="Lesson progress in Biology 9"')
  })

  it('shows no Lesson chip for a posting made as a quiz', () => {
    const html = render([klass])
    expect(html).not.toContain('>Lesson<')
    expect(html).not.toContain('Lesson progress')
  })

  it('offers the choice of quiz or lesson beside the class picker', () => {
    const html = render()
    expect(html).toContain('Post as quiz')
    expect(html).toContain('Post as lesson')
  })
})
