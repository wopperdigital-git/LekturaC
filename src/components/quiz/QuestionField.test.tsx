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

describe('QuestionField (what a student sees)', () => {
  // Students can't open the deck, so "Slide 2" would point them at something they can't see.
  it('shows no slide number', () => {
    expect(render()).not.toContain('Slide 2')
    expect(render()).toContain('Which planet is largest?')
  })
})

describe('QuestionField (true or false)', () => {
  const tf: TakeQuestion = { ...question, type: 'true_false', choices: [] }
  const renderTf = (answer: boolean | undefined) =>
    renderToStaticMarkup(
      <QuestionField
        index={0}
        question={tf}
        config={{ type: 'true_false', notation: 'word' }}
        answer={answer}
        onAnswer={() => {}}
      />,
    )
  const radios = (html: string) => html.match(/<button[^>]*role="radio"[^>]*>/g) ?? []

  // One Tab stop for the group: the chosen answer, or True before one is chosen.
  it('can be reached with Tab once, on the chosen answer', () => {
    const [t, f] = radios(renderTf(undefined))
    expect(t).toContain('tabindex="0"')
    expect(f).toContain('tabindex="-1"')
    const [t2, f2] = radios(renderTf(false))
    expect(t2).toContain('tabindex="-1"')
    expect(f2).toContain('tabindex="0"')
  })
})
