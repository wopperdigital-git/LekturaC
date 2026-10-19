import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { TakeQuestion } from '@/quiz/rows'
import { QuestionField } from './QuestionField'

/**
 * A render smoke test, a deliberate exception to "pure logic only" like the editor's:
 * a focus ring drawn on the wrong element is a JSX-only failure no pure test can see.
 * Whether the ring actually appears under a keyboard (`:focus-visible`) needs a browser.
 */

const question: TakeQuestion = {
  id: 'q1',
  slideNumber: 2,
  prompt: 'Which planet is largest?',
  choices: ['Mars', 'Jupiter', 'Venus', 'Earth'],
  sectionIndex: 0,
  type: 'multiple_choice',
}

const render = () =>
  renderToStaticMarkup(
    <QuestionField
      index={0}
      question={question}
      config={{ type: 'multiple_choice', choiceCount: 4 }}
      answer={undefined}
      onAnswer={() => {}}
    />,
  )

/** The opening tag of each `<label>` for a choice. */
const choiceLabels = (html: string) => html.match(/<label[^>]*for="quiz-q-q1-\d"[^>]*>/g) ?? []

describe('QuestionField (multiple choice)', () => {
  // Keyboard focus lands on the visually hidden radio, never on its label (WCAG 2.4.7):
  // a `focus-visible:` ring on the label could never show, so it must key off the radio inside.
  it("draws each option's focus ring when the radio inside it has keyboard focus", () => {
    const labels = choiceLabels(render())
    expect(labels).toHaveLength(4)
    for (const label of labels) {
      expect(label).toContain('has-[:focus-visible]:outline-2')
      expect(label).toContain('has-[:focus-visible]:outline-app-accent')
      expect(label).not.toMatch(/(^|\s)focus-visible:outline/)
    }
  })

  it('keeps the real radios in the page for the keyboard and screen readers', () => {
    const radios = render().match(/<input[^>]*type="radio"[^>]*>/g) ?? []
    expect(radios).toHaveLength(4)
    for (const radio of radios) expect(radio).toContain('sr-only')
  })
})
