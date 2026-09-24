import { useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { describeError } from '@/store/presentationStore'
import { useAsync } from '@/classroom/useAsync'
import { DashboardShell } from '@/components/home/DashboardShell'
import { Panel, PanelMessage, RowsSkeleton } from '@/components/classroom/Panel'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { getQuizForTaking, submitQuizAttempt, type AttemptResult, type SubmittedAnswers } from '@/quiz/api'
import { normalizeQuizCode } from '@/quiz/quizCode'
import type { TakeQuestion, TakeQuiz } from '@/quiz/rows'
import { allAnswered, buildAnswers, defaultClassId } from '@/quiz/taking'

const CHOICE_LETTERS = 'ABCD'

const FOCUS_RING =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent'

/**
 * Keyed on the code: `useAsync` keeps the previous data on screen while a new
 * key loads, so without a remount quiz A's answers could be submitted against
 * code B, and A would stay interactive while B loads.
 */
export function QuizPage() {
  const { code = '' } = useParams()
  const normalized = normalizeQuizCode(code)
  return <QuizPageInner key={normalized} code={normalized} />
}

function QuizPageInner({ code }: { code: string }) {
  const navigate = useNavigate()
  const { state, reload } = useAsync(() => getQuizForTaking(code), code)
  const [query, setQuery] = useState('')

  return (
    <DashboardShell
      title={state.status === 'ready' ? state.data.title : 'Quiz'}
      subtitle={state.status === 'ready' ? state.data.deckTitle : undefined}
      query={query}
      onQueryChange={setQuery}
    >
      {state.status === 'loading' ? (
        <Panel>
          <RowsSkeleton count={3} />
        </Panel>
      ) : state.status === 'error' ? (
        <Panel>
          <PanelMessage
            title="This quiz isn't available"
            body={state.error}
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button variant="primary" onClick={() => void navigate('/classes')}>
                  Go to my classes
                </Button>
                <Button variant="secondary" onClick={reload}>
                  Retry
                </Button>
              </div>
            }
          />
        </Panel>
      ) : (
        <QuizForm key={state.data.id} code={code} quiz={state.data} />
      )}
    </DashboardShell>
  )
}

function QuizForm({ code, quiz }: { code: string; quiz: TakeQuiz }) {
  const [chosenClassId, setChosenClassId] = useState<string | null>(null)
  const [answers, setAnswers] = useState<SubmittedAnswers>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [result, setResult] = useState<AttemptResult | null>(null)

  const classId = chosenClassId ?? defaultClassId(quiz.classes)
  const chosenClass = quiz.classes.find((c) => c.id === classId) ?? null
  const ready = allAnswered(quiz.questions, answers)

  function setAnswer(questionId: string, value: number | string | boolean) {
    setAnswers((current) => ({ ...current, [questionId]: value }))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!classId || !ready || submitting) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      setResult(await submitQuizAttempt(code, classId, buildAnswers(quiz.questions, answers)))
    } catch (err) {
      setSubmitError(describeError(err))
    } finally {
      setSubmitting(false)
    }
  }

  if (result) {
    return <ResultPanel quiz={quiz} result={result} />
  }

  return (
    <Panel>
      {quiz.classes.length > 1 && (
        <div className="mb-5 max-w-sm">
          <label htmlFor="quiz-class" className="mb-1 block text-xs font-medium text-app-muted">
            Submit for class
          </label>
          <select
            id="quiz-class"
            value={classId ?? ''}
            onChange={(e) => {
              setChosenClassId(e.target.value)
              setSubmitError(null)
            }}
            className={`w-full cursor-pointer rounded-app-sm border border-app-border bg-app-background px-3 py-2 text-sm text-app-foreground ${FOCUS_RING}`}
          >
            {quiz.classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.attempted ? `${c.name} (already submitted)` : c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {!chosenClass ? (
        <PanelMessage title="This quiz isn't posted to any of your classes" />
      ) : chosenClass.attempted ? (
        <p className="text-sm text-app-foreground">
          You&apos;ve already submitted this quiz for <span className="font-medium">{chosenClass.name}</span>.
        </p>
      ) : (
        <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-6">
          <p className="text-sm text-app-muted">You get one attempt.</p>

          {quiz.wordBox && quiz.wordBox.length > 0 && (
            <div className="rounded-app-sm border border-app-border bg-app-surface p-3">
              <p className="mb-2 text-xs font-medium text-app-muted">Word box</p>
              <ul className="flex flex-wrap gap-2">
                {quiz.wordBox.map((word, i) => (
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

          <ol className="flex flex-col gap-6">
            {quiz.questions.map((q, i) => (
              <li key={q.id}>
                <QuestionField
                  index={i}
                  question={q}
                  config={quiz.config}
                  answer={answers[q.id]}
                  onAnswer={(value) => setAnswer(q.id, value)}
                />
              </li>
            ))}
          </ol>

          {submitError && (
            <p role="alert" className="text-sm text-red-600">
              {submitError}
            </p>
          )}

          <div>
            <Button type="submit" variant="primary" loading={submitting} disabled={!ready || submitting}>
              {submitting ? 'Submitting…' : 'Submit quiz'}
            </Button>
            {!ready && <p className="mt-2 text-xs text-app-muted">Answer every question to submit.</p>}
          </div>
        </form>
      )}
    </Panel>
  )
}

function QuestionField({
  index,
  question,
  config,
  answer,
  onAnswer,
}: {
  index: number
  question: TakeQuestion
  config: TakeQuiz['config']
  answer: number | string | boolean | undefined
  onAnswer: (value: number | string | boolean) => void
}) {
  const promptId = `quiz-q-${question.id}`
  const inputId = `${promptId}-input`

  const prompt = (
    <span id={promptId} className="block whitespace-pre-wrap text-sm font-medium text-app-foreground">
      <span className="mr-1.5 text-app-muted">{index + 1}.</span>
      {question.prompt}
    </span>
  )

  switch (config.type) {
    case 'multiple_choice':
      return (
        <div role="radiogroup" aria-labelledby={promptId} className="flex flex-col gap-2">
          {prompt}
          {question.choices.map((choice, ci) => {
            const optionId = `${promptId}-${ci}`
            return (
              <label
                key={ci}
                htmlFor={optionId}
                className="flex cursor-pointer items-start gap-2.5 rounded-app-sm border border-app-border px-3 py-2 text-sm text-app-foreground transition-colors hover:bg-app-surface has-[:checked]:border-app-accent has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-app-accent"
              >
                <input
                  id={optionId}
                  type="radio"
                  name={promptId}
                  checked={answer === ci}
                  onChange={() => onAnswer(ci)}
                  className="mt-0.5 accent-app-accent"
                />
                <span>
                  <span className="mr-1 font-medium">{CHOICE_LETTERS[ci] ?? ci + 1}.</span>
                  {choice}
                </span>
              </label>
            )
          })}
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
            placeholder="Your answer"
            className="max-w-md"
          />
        </div>
      )

    case 'true_false': {
      const options: { value: boolean; label: string; spoken: string }[] =
        config.notation === 'letter'
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
          <div className="flex gap-2">
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
                  className={`min-w-20 cursor-pointer rounded-app-sm border px-4 py-2 text-sm font-medium transition-colors ${FOCUS_RING} ${
                    selected
                      ? 'border-app-accent bg-app-accent text-app-accent-foreground'
                      : 'border-app-border bg-app-background text-app-foreground hover:bg-app-surface'
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

/** Score and a right/wrong mark per question. Deliberately never the correct answers. */
function ResultPanel({ quiz, result }: { quiz: TakeQuiz; result: AttemptResult }) {
  const navigate = useNavigate()
  return (
    <Panel>
      <div className="flex flex-col items-center gap-1 border-b border-app-border pb-5 text-center">
        <p className="text-4xl font-semibold text-app-foreground">{Math.round(result.score * 100)}%</p>
        <p className="text-sm text-app-muted">
          {result.correct} / {result.total} correct
        </p>
      </div>
      <ol className="mt-5 flex flex-col gap-3">
        {quiz.questions.map((q, i) => {
          const right = result.results[i] === true
          return (
            <li key={q.id} className="flex items-start gap-3 text-sm text-app-foreground">
              <span
                className={`mt-px w-5 shrink-0 text-center font-semibold ${right ? 'text-green-600' : 'text-red-600'}`}
                role="img"
                aria-label={right ? 'Correct' : 'Incorrect'}
              >
                {right ? '✓' : '✗'}
              </span>
              <span className="whitespace-pre-wrap">
                <span className="mr-1.5 text-app-muted">{i + 1}.</span>
                {q.prompt}
              </span>
            </li>
          )
        })}
      </ol>
      <div className="mt-6">
        <Button variant="secondary" onClick={() => void navigate('/classes')}>
          Back to my classes
        </Button>
      </div>
    </Panel>
  )
}
