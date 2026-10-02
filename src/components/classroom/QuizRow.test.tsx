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

function render(postedIn: ClassRoom[] = []) {
  return renderToStaticMarkup(
    <MemoryRouter>
      <QuizRow quiz={quiz} postedIn={postedIn} allClasses={[klass]} onChanged={() => {}} />
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
})
