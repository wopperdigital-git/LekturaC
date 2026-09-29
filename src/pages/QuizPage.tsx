import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { describeError } from '@/store/presentationStore'
import { useAsync } from '@/classroom/useAsync'
import { DashboardShell } from '@/components/home/DashboardShell'
import { Panel, PanelMessage, RowsSkeleton } from '@/components/classroom/Panel'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
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
      {/* Breadcrumb Navigation */}
      <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-2 text-xs text-app-muted">
        <Link
          to="/classes"
          className="inline-flex items-center gap-1 font-medium transition-colors hover:text-app-foreground"
        >
          <svg className="size-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 12l-4-4 4-4" />
          </svg>
          My classes
        </Link>
        <span className="text-app-border">/</span>
        <span className="truncate font-semibold text-app-foreground">
          {state.status === 'ready' ? state.data.title : 'Assessment'}
        </span>
      </nav>

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

  const answeredCount = quiz.questions.filter((q) => answers[q.id] !== undefined && answers[q.id] !== '').length
  const totalCount = quiz.questions.length
  const progressPercent = Math.round((answeredCount / totalCount) * 100)

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
          <Select
            value={classId ?? ''}
            onChange={(val) => {
              setChosenClassId(val)
              setSubmitError(null)
            }}
            options={quiz.classes.map((c) => ({
              value: c.id,
              label: c.attempted ? `${c.name} (already submitted)` : c.name,
              icon: (
                <svg className="size-3.5 shrink-0 text-app-muted" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 1.5l6.5 3.5L8 8.5 1.5 5 8 1.5z" />
                  <path d="M3.5 7.5v4c0 1.2 2 2.5 4.5 2.5s4.5-1.3 4.5-2.5v-4L8 10 3.5 7.5z" opacity="0.75" />
                </svg>
              ),
            }))}
            ariaLabel="Submit for class"
            className="w-full"
          />
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
          {/* Progress Tracker */}
          <div className="flex items-center justify-between text-xs text-app-muted">
            <span>
              Progress: <strong className="font-semibold text-app-foreground">{answeredCount}</strong> of {totalCount} answered
            </span>
            <span className="font-mono">{progressPercent}%</span>
          </div>

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

          <ol className="flex flex-col gap-4">
            {quiz.questions.map((q, i) => (
              <li
                key={q.id}
                className="rounded-app border border-app-border/80 bg-app-surface/20 p-4 sm:p-5 transition-colors hover:border-app-border"
              >
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
            <p role="alert" className="text-sm font-medium text-red-600 dark:text-red-400">
              {submitError}
            </p>
          )}

          <div className="flex flex-col gap-2 pt-2">
            <Button
              type="submit"
              variant="primary"
              loading={submitting}
              disabled={!ready || submitting}
              className="self-start px-6 py-2.5 font-semibold shadow-sm"
            >
              {submitting ? 'Submitting attempt…' : 'Submit quiz →'}
            </Button>
            {!ready && (
              <p className="text-xs text-app-muted">
                Please complete all {totalCount} questions before submitting.
              </p>
            )}
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

  switch (config.type) {
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
                  className={`flex cursor-pointer items-start gap-3 rounded-app-sm border p-3 text-sm text-app-foreground transition-all duration-150 ${FOCUS_RING} ${
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

/** Score and a right/wrong mark per question. Deliberately never the correct answers. */
function ResultPanel({ quiz, result }: { quiz: TakeQuiz; result: AttemptResult }) {
  const navigate = useNavigate()
  const scorePercent = Math.round(result.score * 100)

  return (
    <Panel>
      <div className="border-b border-app-border pb-6 text-center sm:pb-8">
        <p className="font-mono text-4xl font-bold tracking-tight text-app-foreground sm:text-5xl">
          {scorePercent}%
        </p>
        <p className="mt-2 text-sm text-app-muted">
          You answered <span className="font-semibold text-app-foreground">{result.correct}</span> of{' '}
          <span className="font-semibold text-app-foreground">{result.total}</span> questions correctly.
        </p>
      </div>

      <div className="pt-6 sm:pt-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-app-foreground">Question review</h2>
          <span className="text-xs text-app-muted">Submitted to instructor</span>
        </div>

        <ol className="divide-y divide-app-border">
          {quiz.questions.map((q, i) => {
            const right = result.results[i] === true
            return (
              <li key={q.id} className="flex items-start gap-3 py-3.5 first:pt-0 last:pb-0">
                <span
                  className={`mt-0.5 inline-grid size-5 shrink-0 place-items-center rounded-full text-xs font-bold ${
                    right
                      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                      : 'bg-red-500/15 text-red-600 dark:text-red-400'
                  }`}
                  aria-label={right ? 'Correct' : 'Incorrect'}
                >
                  {right ? '✓' : '✕'}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-xs text-app-muted">
                    <span className="font-mono font-medium">Question {i + 1}</span>
                    {q.slideNumber > 0 && <span>· Slide {q.slideNumber}</span>}
                  </div>
                  <p className="mt-1 text-sm text-app-foreground leading-snug">{q.prompt}</p>
                </div>
              </li>
            )
          })}
        </ol>

        <div className="mt-8 flex justify-end border-t border-app-border pt-4">
          <Button variant="secondary" onClick={() => void navigate('/classes')}>
            Back to my classes
          </Button>
        </div>
      </div>
    </Panel>
  )
}

