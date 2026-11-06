import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { QuestionField } from '@/components/quiz/QuestionField'
import type { TakeQuestion } from '@/quiz/rows'
import type { QuizConfig } from '@/quiz/types'
import { isAnswered } from '@/quiz/taking'

type Answer = number | string | boolean

/**
 * One quiz question asked in the middle of a lesson. `result` is null until the server has
 * marked the answer; then it is shown as right or wrong and nothing more, because the
 * correct answer never reaches the student's browser. Locked once marked.
 */
export function CheckpointCard({
  question,
  config,
  index,
  words,
  result,
  busy,
  error,
  initialAnswer,
  onSubmit,
  onContinue,
}: {
  question: TakeQuestion
  config: QuizConfig
  index: number
  /** The word box of the question's test, for fill in the blank. */
  words?: string[]
  result: boolean | null
  busy: boolean
  /** Why the last Check did not go through. */
  error?: string | null
  /** For a render test only: the card starts with this answer picked. */
  initialAnswer?: Answer
  onSubmit: (answer: Answer) => void
  onContinue: () => void
}) {
  const [answer, setAnswer] = useState<Answer | undefined>(initialAnswer)
  const marked = result !== null

  return (
    <div
      role="group"
      aria-label="Question"
      className="flex flex-col gap-4 rounded-app border border-app-border bg-app-background p-4 shadow-lg sm:p-5"
    >
      {words && words.length > 0 && (
        <div className="rounded-app-sm border border-app-border bg-app-surface p-3">
          <p className="mb-2 text-xs font-medium text-app-muted">Word box</p>
          <ul className="flex flex-wrap gap-2">
            {words.map((word, i) => (
              <li
                key={i}
                className="rounded-app-sm border border-app-border bg-app-background px-2.5 py-1 text-sm text-app-foreground"
              >
                {word}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Locked while the answer is in flight and once it is marked. */}
      <fieldset disabled={busy || marked} className="m-0 min-w-0 border-0 p-0">
        <QuestionField index={index} question={question} config={config} answer={answer} onAnswer={setAnswer} />
      </fieldset>

      {error && (
        <p role="alert" className="text-sm font-medium text-app-danger-text">
          {error}
        </p>
      )}

      {marked ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p
            role="status"
            className={`text-sm font-semibold ${result ? 'text-app-highlight-text' : 'text-app-danger-text'}`}
          >
            {result ? '✓ Correct' : '✗ Not quite'}
          </p>
          <Button variant="primary" onClick={onContinue} autoFocus>
            Continue
          </Button>
        </div>
      ) : (
        <Button
          variant="primary"
          className="self-start"
          loading={busy}
          disabled={busy || !isAnswered(answer)}
          onClick={() => {
            if (answer !== undefined) onSubmit(answer)
          }}
        >
          Check
        </Button>
      )}
    </div>
  )
}
