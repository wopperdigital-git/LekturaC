import { groupBySection, type OwnerQuestion, type OwnerQuiz } from '@/quiz/rows'
import type { QuizConfig } from '@/quiz/types'

const LETTERS = ['A', 'B', 'C', 'D']

function answerLabel(q: OwnerQuestion, config: QuizConfig): string {
  if (q.type === 'multiple_choice' && typeof q.answer === 'number') return LETTERS[q.answer]
  if (q.type === 'true_false') {
    const letter = config.type === 'true_false' && config.notation === 'letter'
    return q.answer === true ? (letter ? 'T' : 'TRUE') : letter ? 'F' : 'FALSE'
  }
  if (typeof q.answer === 'object') {
    return q.answer.accepted.length > 0 ? `${q.answer.text} (also: ${q.answer.accepted.join(', ')})` : q.answer.text
  }
  return ''
}

/** The generated quiz with its answers marked, grouped by test. Owner-only: it is fed by `loadOwnerQuiz`. */
export function QuizPreview({ quiz }: { quiz: OwnerQuiz }) {
  return (
    <div className="scrollbar-subtle max-h-96 space-y-5 overflow-y-auto rounded-app border border-app-border p-3 text-sm">
      {groupBySection(quiz.sections, quiz.questions).map(({ section, index, questions }) => (
        <section key={index} aria-label={section.title}>
          <h4 className="font-semibold text-app-foreground">{section.title}</h4>
          {section.instructions && <p className="mt-0.5 text-xs text-app-muted">{section.instructions}</p>}
          <ol className="mt-2 space-y-3">
            {questions.map((q, i) => (
              <li key={q.id}>
                <p className="font-medium text-app-foreground">
                  {i + 1}. {q.prompt}
                </p>
                {q.type === 'multiple_choice' && (
                  <ul className="mt-1 space-y-0.5 pl-4 text-app-muted">
                    {q.choices.map((c, ci) => (
                      <li key={ci} className={q.answer === ci ? 'font-medium text-app-accent-text' : undefined}>
                        {LETTERS[ci]}. {c}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-1 text-xs text-app-muted">
                  Answer:{' '}
                  <span className="font-medium text-app-accent-text">{answerLabel(q, section.config)}</span> · slide{' '}
                  {q.slideNumber}
                </p>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  )
}
