import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { TakeQuestion } from '@/quiz/rows'
import { CheckpointCard } from './CheckpointCard'

/**
 * A render smoke test (no jsdom): what the student sees at a checkpoint before, and after, the
 * server has marked the answer. The card never shows which choice was right.
 */

const question: TakeQuestion = {
  id: 'q1',
  slideNumber: 2,
  prompt: 'Which planet is largest?',
  choices: ['Mars', 'Jupiter', 'Venus', 'Earth'],
  sectionIndex: 0,
  type: 'multiple_choice',
}

function render(result: boolean | null, extra: { initialAnswer?: number; busy?: boolean; error?: string | null } = {}) {
  return renderToStaticMarkup(
    <CheckpointCard
      question={question}
      config={{ type: 'multiple_choice', choiceCount: 4 }}
      index={0}
      result={result}
      busy={extra.busy ?? false}
      error={extra.error}
      initialAnswer={extra.initialAnswer}
      onSubmit={() => {}}
      onContinue={() => {}}
    />,
  )
}

/** Choices drawn as picked (QuestionField's selected treatment). */
const pickedChoices = (html: string) => (html.match(/ring-app-accent\/30/g) ?? []).length

/** The opening tag of the Check button. */
const checkTag = (html: string) => html.match(/<button[^>]*>(?=(<[^>]*>)*Check<)/)?.[0] ?? ''

describe('CheckpointCard', () => {
  it('asks the question with a Check button and no verdict before answering', () => {
    const html = render(null)
    expect(html).toContain('Which planet is largest?')
    expect(html).toContain('Check')
    expect(html).not.toContain('Continue')
    expect(html).not.toContain('Correct')
    expect(html).not.toContain('Not quite')
  })

  it('keeps Check off until something is picked, and while the answer is in flight', () => {
    expect(checkTag(render(null))).toContain('disabled=""')
    expect(checkTag(render(null, { initialAnswer: 1 }))).not.toContain('disabled=""')
    expect(checkTag(render(null, { initialAnswer: 1, busy: true }))).toContain('disabled=""')
  })

  it('says Correct and offers Continue for a right answer', () => {
    const html = render(true, { initialAnswer: 1 })
    expect(html).toContain('✓ Correct')
    expect(html).toContain('Continue')
    expect(html).not.toContain('>Check<')
  })

  it('says Not quite and offers Continue for a wrong one, without revealing the right choice', () => {
    const html = render(false, { initialAnswer: 0 })
    expect(html).toContain('✗ Not quite')
    expect(html).toContain('Continue')
    expect(html).not.toMatch(/correct/i)
    // Only the student's own pick is drawn as picked; no other choice is highlighted.
    expect(pickedChoices(html)).toBe(1)
  })

  it('locks the choices once marked', () => {
    expect(render(false, { initialAnswer: 0 })).toMatch(/<fieldset[^>]*disabled/)
  })

  it('shows a failure to send in an alert', () => {
    expect(render(null, { initialAnswer: 1, error: "Couldn't reach the server." })).toContain('role="alert"')
  })
})
