import { Input } from '@/components/ui/Input'
import type { TakeQuestion } from '@/quiz/rows'
import type { QuizConfig } from '@/quiz/types'

/*
  One question on the student's quiz page, in its type's control: lettered choices,
  a text box, or True/False.
*/

const CHOICE_LETTERS = 'ABCD'

const FOCUS_RING =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent'

// A choice is a <label> around a visually hidden radio, and keyboard focus lands on the
// radio, never the label, so `focus-visible:` on the label could never match (WCAG 2.4.7):
// the ring keys off the focused radio inside it instead. A mouse click on a radio does not
// match `:focus-visible`, so the ring stays a keyboard cue.
const CHOICE_FOCUS_RING =
  'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-app-accent'

export function QuestionField({
  index,
  question,
  config,
  answer,
  onAnswer,
}: {
  index: number
  question: TakeQuestion
  config: QuizConfig
  answer: number | string | boolean | undefined
  onAnswer: (value: number | string | boolean) => void
}) {
  const promptId = `quiz-q-${question.id}`
  const inputId = `${promptId}-input`

  const prompt = (
    <div id={promptId} className="flex flex-wrap items-center gap-2 mb-2">
      <span className="font-mono text-xs font-bold text-app-muted">
        Question {index + 1 < 10 ? `0${index + 1}` : index + 1}
      </span>
      {question.slideNumber > 0 && (
        <span className="rounded-full border border-app-border bg-app-surface/80 px-2 py-0.2 font-mono text-[10px] text-app-muted">
          Slide {question.slideNumber}
        </span>
      )}
      <p className="w-full text-base font-medium text-app-foreground leading-snug whitespace-pre-wrap">
        {question.prompt}
      </p>
    </div>
  )

  switch (question.type) {
    case 'multiple_choice':
      return (
        <div role="radiogroup" aria-labelledby={promptId} className="flex flex-col gap-2">
          {prompt}
          <div className="mt-1 flex flex-col gap-2">
            {question.choices.map((choice, ci) => {
              const optionId = `${promptId}-${ci}`
              const selected = answer === ci
              return (
                <label
                  key={ci}
                  htmlFor={optionId}
                  className={`flex cursor-pointer items-start gap-3 rounded-app-sm border p-3 text-sm text-app-foreground transition-all duration-150 ${CHOICE_FOCUS_RING} ${
                    selected
                      ? 'border-app-accent bg-app-accent/10 font-medium ring-1 ring-app-accent/30'
                      : 'border-app-border bg-app-surface/30 hover:border-app-border/90 hover:bg-app-surface/60'
                  }`}
                >
                  <input
                    id={optionId}
                    type="radio"
                    name={promptId}
                    checked={selected}
                    onChange={() => onAnswer(ci)}
                    className="sr-only"
                  />
                  <span
                    className={`grid size-6 shrink-0 place-items-center rounded font-mono text-xs font-bold transition-colors ${
                      selected
                        ? 'border border-app-accent bg-app-accent text-app-accent-foreground'
                        : 'border border-app-border/80 bg-app-surface text-app-muted'
                    }`}
                  >
                    {CHOICE_LETTERS[ci] ?? ci + 1}
                  </span>
                  <span className="flex-1 pt-0.5 leading-snug">{choice}</span>
                </label>
              )
            })}
          </div>
        </div>
      )

    case 'fill_blank':
      return (
        <div className="flex flex-col gap-2">
          <label htmlFor={inputId}>{prompt}</label>
          <Input
            id={inputId}
            value={typeof answer === 'string' ? answer : ''}
            onChange={(e) => onAnswer(e.target.value)}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="Type your answer here…"
            className="max-w-md"
          />
        </div>
      )

    case 'true_false': {
      const options: { value: boolean; label: string; spoken: string }[] =
        config.type === 'true_false' && config.notation === 'letter'
          ? [
              { value: true, label: 'T', spoken: 'True' },
              { value: false, label: 'F', spoken: 'False' },
            ]
          : [
              { value: true, label: 'TRUE', spoken: 'True' },
              { value: false, label: 'FALSE', spoken: 'False' },
            ]
      return (
        <div role="radiogroup" aria-labelledby={promptId} className="flex flex-col gap-2">
          {prompt}
          <div className="mt-1 flex gap-2.5">
            {options.map((o) => {
              const selected = answer === o.value
              return (
                <button
                  key={o.label}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={o.spoken}
                  onClick={() => onAnswer(o.value)}
                  className={`min-w-24 cursor-pointer rounded-app-sm border px-5 py-2.5 text-sm font-semibold transition-all duration-150 ${FOCUS_RING} ${
                    selected
                      ? 'border-app-accent bg-app-accent text-app-accent-foreground shadow-sm'
                      : 'border-app-border bg-app-surface/40 text-app-foreground hover:border-app-border/90 hover:bg-app-surface'
                  }`}
                >
                  {o.label}
                </button>
              )
            })}
          </div>
        </div>
      )
    }
  }
}
