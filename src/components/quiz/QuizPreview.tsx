import type { OwnerQuiz } from '@/quiz/rows'

const LETTERS = ['A', 'B', 'C', 'D']

function answerLabel(quiz: OwnerQuiz, index: number): string {
  const q = quiz.questions[index]
  if (quiz.config.type === 'multiple_choice' && typeof q.answer === 'number') return LETTERS[q.answer]
  if (quiz.config.type === 'true_false') {
    const letter = quiz.config.notation === 'letter'
    return q.answer === true ? (letter ? 'T' : 'TRUE') : letter ? 'F' : 'FALSE'
  }
  if (typeof q.answer === 'object') {
    return q.answer.accepted.length > 0 ? `${q.answer.text} (also: ${q.answer.accepted.join(', ')})` : q.answer.text
  }
  return ''
}

/** The generated quiz with its answers marked. Owner-only: it is fed by `loadOwnerQuiz`. */
export function QuizPreview({ quiz }: { quiz: OwnerQuiz }) {
  return (
    <ol className="scrollbar-subtle max-h-72 space-y-3 overflow-y-auto rounded-app border border-app-border p-3 text-sm">
      {quiz.questions.map((q, i) => (
        <li key={q.id}>
          <p className="font-medium text-app-foreground">
            {i + 1}. {q.prompt}
          </p>
          {quiz.config.type === 'multiple_choice' && (
            <ul className="mt-1 space-y-0.5 pl-4 text-app-muted">
              {q.choices.map((c, ci) => (
                <li key={ci} className={q.answer === ci ? 'font-medium text-app-accent-text' : undefined}>
                  {LETTERS[ci]}. {c}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-1 text-xs text-app-muted">
            Answer: <span className="font-medium text-app-accent-text">{answerLabel(quiz, i)}</span> · slide {q.slideNumber}
          </p>
        </li>
      ))}
    </ol>
  )
}
