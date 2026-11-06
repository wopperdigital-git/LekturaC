import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { TakeLesson } from '@/lesson/rows'
import { LessonSummary } from './LessonSummary'

/** A render smoke test (no jsdom): the end of a lesson shows the score and a mark per question, never an answer. */

const lesson = {
  title: 'Cells',
  sections: [{ title: 'Test 1', instructions: '', config: { type: 'multiple_choice', choiceCount: 4 } }],
  questions: [
    { id: 'q1', prompt: 'First?', sectionIndex: 0, type: 'multiple_choice', choices: ['a', 'b'], slideNumber: 1, orderIndex: 0, cardId: null },
    { id: 'q2', prompt: 'Second?', sectionIndex: 0, type: 'multiple_choice', choices: ['a', 'b'], slideNumber: 1, orderIndex: 1, cardId: null },
  ],
} as unknown as TakeLesson

describe('LessonSummary', () => {
  const html = renderToStaticMarkup(
    <LessonSummary lesson={lesson} answered={new Map([['q1', true], ['q2', false]])} score={0.5} />,
  )

  it('shows the score and how many were right', () => {
    expect(html).toContain('50%')
    expect(html).toMatch(/answered <span[^>]*>1<\/span> of <span[^>]*>2<\/span>/)
  })

  it('marks each question right or wrong', () => {
    expect(html).toContain('aria-label="Correct"')
    expect(html).toContain('aria-label="Incorrect"')
    expect(html).toContain('First?')
    expect(html).toContain('Second?')
  })
})
