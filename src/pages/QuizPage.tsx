import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { describeError } from '@/store/presentationStore'
import { useAsync } from '@/classroom/useAsync'
import { DashboardShell } from '@/components/home/DashboardShell'
import { Panel, PanelMessage, RowsSkeleton } from '@/components/classroom/Panel'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { getQuizForTaking, submitQuizAttempt, type AttemptResult, type SubmittedAnswers } from '@/quiz/api'
import { normalizeQuizCode } from '@/quiz/quizCode'
import { groupBySection, type TakeQuiz } from '@/quiz/rows'
import { QuestionField } from '@/components/quiz/QuestionField'
import {
  buildAnswers,
  clearSavedAnswers,
  defaultClassId,
  firstUnanswered,
  isAlreadySubmitted,
  isAnswered,
  answerText,
  readSavedAnswers,
  saveAnswers,
} from '@/quiz/taking'
import { browserStore } from '@/lib/temporaryInk'
import { useAuthStore } from '@/store/authStore'
import { Alert } from '@/components/ui/Alert'
import { Modal } from '@/components/ui/Modal'

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

  return (
    <DashboardShell
      title={state.status === 'ready' ? state.data.title : 'Quiz'}
      subtitle={state.status === 'ready' ? state.data.deckTitle : undefined}
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
  const userId = useAuthStore((s) => s.user?.id ?? null)
  const [chosenClassId, setChosenClassId] = useState<string | null>(null)
  // Picked up from this browser, so a reload or a stray click away does not cost the work.
  const [restored] = useState(() => readSavedAnswers(browserStore(), userId, quiz.id, quiz.questions))
  const [answers, setAnswers] = useState<SubmittedAnswers>(restored)
  // Whether this browser is keeping the answers. Blocked storage is told to the student, and
  // only then does leaving the page ask first: with saving working, a reload loses nothing.
  const [kept, setKept] = useState(true)
  const [showMissing, setShowMissing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [alreadySubmitted, setAlreadySubmitted] = useState(false)
  const [result, setResult] = useState<AttemptResult | null>(null)

  const classId = chosenClassId ?? defaultClassId(quiz.classes)
  const chosenClass = quiz.classes.find((c) => c.id === classId) ?? null
  const restoredCount = Object.keys(restored).length

  const answeredCount = quiz.questions.filter((q) => isAnswered(answers[q.id])).length
  const totalCount = quiz.questions.length
  const missingCount = totalCount - answeredCount
  const progressPercent = Math.round((answeredCount / totalCount) * 100)

  useEffect(() => {
    if (kept || answeredCount === 0 || result) return
    function warn(e: BeforeUnloadEvent) {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [kept, answeredCount, result])

  function setAnswer(questionId: string, value: number | string | boolean) {
    const next = { ...answers, [questionId]: value }
    setAnswers(next)
    setKept(saveAnswers(browserStore(), userId, quiz.id, next))
  }

  /** Submit with gaps sends nothing: it marks them and takes the student to the first. */
  function requestSubmit(e: FormEvent) {
    e.preventDefault()
    if (!classId || submitting) return
    const first = firstUnanswered(quiz.questions, answers)
    if (first) {
      setShowMissing(true)
      const node = document.getElementById(questionItemId(first))
      node?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      node?.focus({ preventScroll: true })
      return
    }
    setConfirming(true)
  }

  async function submit() {
    if (!classId || submitting) return
    setConfirming(false)
    setSubmitting(true)
    setSubmitError(null)
    try {
      const attempt = await submitQuizAttempt(code, classId, buildAnswers(quiz.questions, answers))
      clearSavedAnswers(browserStore(), userId, quiz.id)
      setResult(attempt)
    } catch (err) {
      const message = describeError(err)
      if (isAlreadySubmitted(message)) {
        // Sent before (a lost reply, another tab): the score is on the class page, and these answers are spent.
        clearSavedAnswers(browserStore(), userId, quiz.id)
        setAlreadySubmitted(true)
      } else {
        setSubmitError(
          `${err instanceof TypeError ? "Couldn't reach the server." : message} Your answers weren't sent, and they're still here. Press Submit to try again.`,
        )
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (result) {
    return <ResultPanel quiz={quiz} result={result} answers={answers} />
  }

  if (alreadySubmitted && chosenClass) {
    return (
      <Panel>
        <PanelMessage
          title="Already submitted"
          body={`This quiz was already submitted for ${chosenClass.name}. Your score is on the class page.`}
          action={
            <Link
              to={`/classes/${chosenClass.id}`}
              className={`inline-flex items-center rounded-app-sm bg-app-accent px-3 py-1.5 text-sm font-medium text-app-accent-foreground hover:opacity-90 ${FOCUS_RING}`}
            >
              Go to {chosenClass.name}
            </Link>
          }
        />
      </Panel>
    )
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
        <form onSubmit={requestSubmit} noValidate className="flex flex-col gap-6">
          {/* Said before the first question: the one attempt, and what happens to the work meanwhile. */}
          <div className="flex flex-col gap-2">
            <Alert tone="info">
              {kept
                ? 'You can submit this quiz once. Your answers are saved on this device as you go.'
                : "You can submit this quiz once. This browser isn't saving your answers, so stay on this page until you submit."}
            </Alert>
            {restoredCount > 0 && (
              <p className="text-xs text-app-muted">
                We restored {restoredCount} {restoredCount === 1 ? 'answer' : 'answers'} from your last visit.
              </p>
            )}
          </div>

          {/* Progress Tracker */}
          <div className="flex items-center justify-between text-xs text-app-muted">
            <span>
              Progress: <strong className="font-semibold text-app-foreground">{answeredCount}</strong> of {totalCount} answered
            </span>
            <span className="font-mono">{progressPercent}%</span>
          </div>

          {/* Locked while the answers are in flight, so what is sent is what is on screen. */}
          <fieldset disabled={submitting} className="m-0 flex min-w-0 flex-col gap-6 border-0 p-0">
            {groupBySection(quiz.sections, quiz.questions).map(({ section, index, questions }) => {
              const words = quiz.wordBoxes[index]
              return (
                <section key={index} aria-labelledby={`quiz-test-${index}`} className="flex flex-col gap-4">
                  <div>
                    <h2 id={`quiz-test-${index}`} className="text-base font-semibold text-app-foreground">
                      {section.title}
                    </h2>
                    {section.instructions && <p className="mt-1 text-sm text-app-muted">{section.instructions}</p>}
                  </div>

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

                  <ol className="flex flex-col gap-4">
                    {questions.map((q, i) => {
                      const missing = showMissing && !isAnswered(answers[q.id])
                      return (
                        <li
                          key={q.id}
                          id={questionItemId(q.id)}
                          // Focusable only from script: the jump to the first unanswered question lands here, ringed when
                          // the jump came from the keyboard.
                          tabIndex={-1}
                          className={`rounded-app border bg-app-surface/20 p-4 transition-colors sm:p-5 ${FOCUS_RING} ${
                            missing ? 'border-app-track-sun' : 'border-app-border/80 hover:border-app-border'
                          }`}
                        >
                          {missing && (
                            <p className="mb-2 text-xs font-medium text-app-highlight-text">Not answered yet</p>
                          )}
                          <QuestionField
                            index={i}
                            question={q}
                            config={section.config}
                            answer={answers[q.id]}
                            onAnswer={(value) => setAnswer(q.id, value)}
                          />
                        </li>
                      )
                    })}
                  </ol>
                </section>
              )
            })}
          </fieldset>

          {submitError && (
            <p role="alert" className="text-sm font-medium text-app-danger-text">
              {submitError}
            </p>
          )}

          <div className="flex flex-col gap-2 pt-2">
            <Button
              type="submit"
              variant="primary"
              loading={submitting}
              disabled={submitting}
              className="self-start px-6 py-2.5 font-semibold shadow-sm"
            >
              {submitting ? 'Submitting attempt…' : 'Submit quiz →'}
            </Button>
            {showMissing && missingCount > 0 && (
              <p role="alert" className="text-xs text-app-highlight-text">
                {missingCount} {missingCount === 1 ? 'question still needs' : 'questions still need'} an answer.
                They&apos;re marked &ldquo;Not answered yet&rdquo;.
              </p>
            )}
          </div>
        </form>
      )}

      {confirming && chosenClass && (
        <Modal title="Submit your answers?" onClose={() => setConfirming(false)}>
          <p className="text-sm text-app-muted">
            You&apos;ve answered all {totalCount} questions. You can&apos;t change your answers afterwards, and you can
            submit this quiz once for <span className="font-medium text-app-foreground">{chosenClass.name}</span>.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              Keep checking
            </Button>
            <Button variant="primary" onClick={() => void submit()}>
              Submit
            </Button>
          </div>
        </Modal>
      )}
    </Panel>
  )
}

/** The DOM id of a question's card, for the jump to the first unanswered one. */
function questionItemId(questionId: string): string {
  return `quiz-item-${questionId}`
}

/**
 * Score, and per question the student's own answer beside a right/wrong mark, so a wrong
 * one can be learned from. Deliberately never the correct answers. The answers are the ones
 * just sent, held in memory: the server keeps only the score, so the line at the bottom
 * says they go when the page does.
 */
function ResultPanel({ quiz, result, answers }: { quiz: TakeQuiz; result: AttemptResult; answers: SubmittedAnswers }) {
  const navigate = useNavigate()
  const scorePercent = Math.round(result.score * 100)
  const positions = new Map(quiz.questions.map((q, i) => [q.id, i]))

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

        <div className="flex flex-col gap-6">
          {groupBySection(quiz.sections, quiz.questions).map(({ section, index, questions }) => (
            <section key={index} aria-label={section.title}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-app-muted">{section.title}</h3>
              <ol className="divide-y divide-app-border">
                {questions.map((q, i) => {
                  const right = result.results[positions.get(q.id) ?? -1] === true
                  const given = answerText(q, answers[q.id])
                  return (
                    <li key={q.id} className="flex items-start gap-3 py-3.5 first:pt-0 last:pb-0">
                      <span
                        className={`mt-0.5 inline-grid size-5 shrink-0 place-items-center rounded-full text-xs font-bold ${
                          right
                            ? 'bg-app-highlight/15 text-app-highlight-text'
                            : 'bg-app-danger/15 text-app-danger-text'
                        }`}
                        aria-label={right ? 'Correct' : 'Incorrect'}
                      >
                        {right ? '✓' : '✕'}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-xs text-app-muted">
                          <span className="font-mono font-medium">Question {i + 1}</span>
                        </div>
                        <p className="mt-1 text-sm text-app-foreground leading-snug">{q.prompt}</p>
                        <p className="mt-1 text-sm text-app-muted">
                          Your answer:{' '}
                          {given === null ? (
                            <span className="italic">No answer</span>
                          ) : (
                            <span className="font-medium text-app-foreground">{given}</span>
                          )}
                        </p>
                      </div>
                    </li>
                  )
                })}
              </ol>
            </section>
          ))}
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-app-border pt-4">
          <p className="text-xs text-app-muted">
            Your answers aren&apos;t kept after you leave this page. Your score is on the class page.
          </p>
          <Button variant="secondary" onClick={() => void navigate('/classes')}>
            Back to my classes
          </Button>
        </div>
      </div>
    </Panel>
  )
}

