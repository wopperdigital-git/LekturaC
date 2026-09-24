import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'
import { QuizPreview } from './QuizPreview'
import { QUIZ_CHAIN, generateQuizWithFallback } from '@/ai/fallbackProvider'
import { hasQuizContent, quizSlides } from '@/ai/quizPrompt'
import { AIProviderError } from '@/ai/provider'
import { buildQuestions } from '@/quiz/build'
import { createQuiz, listQuizzesForDeck, loadOwnerQuiz } from '@/quiz/api'
import type { DeckQuizSummary, OwnerQuiz } from '@/quiz/rows'
import { exportQuizPdf } from '@/quiz/pdf/quizPdf'
import {
  DEFAULT_CONFIGS,
  MAX_QUIZ_ITEMS,
  MIN_QUIZ_ITEMS,
  clampItemCount,
  type QuizConfig,
  type QuizQuestionDraft,
  type QuizType,
} from '@/quiz/types'
import { headingTextOf, type Card } from '@/engine/contentBlocks'
import { describeError } from '@/store/presentationStore'
import { useAuthStore } from '@/store/authStore'

const DEFAULT_COUNT = 10

const TYPE_OPTIONS: { value: QuizType; label: string }[] = [
  { value: 'multiple_choice', label: 'Multiple choice' },
  { value: 'fill_blank', label: 'Fill in the blank' },
  { value: 'true_false', label: 'True or False' },
]

const TYPE_LABEL: Record<QuizType, string> = {
  multiple_choice: 'Multiple choice',
  fill_blank: 'Fill in the blank',
  true_false: 'True or False',
}

type Phase = 'form' | 'generating' | 'saving' | 'done'

/** Generated questions held after a failed save, so "Save again" never regenerates. */
interface Pending {
  questions: QuizQuestionDraft[]
  shortfall: number
  config: QuizConfig
  requested: number
  /** Set once `create_quiz` has succeeded, so a retry only re-reads and never creates a duplicate. */
  savedId: string | null
}

interface Result {
  quiz: OwnerQuiz
  shortfall: number
  requested: number
}

/** What the number field means: an integer within 1–20, or `null` when the text isn't a number. */
function parseCount(text: string): number | null {
  if (!/^\s*\d+\s*$/.test(text)) return null
  return clampItemCount(Number(text))
}

function friendlyError(err: unknown, saving: boolean): string {
  if (err instanceof AIProviderError && err.kind === 'capacity') {
    return 'The free AI model is busy. Try again in a minute.'
  }
  const message = describeError(err)
  return saving && /create_quiz/i.test(message) ? `${message} Run migration 0012 in Supabase.` : message
}

interface RadioOption<T extends string> {
  value: T
  label: string
}

/** A small exclusive choice, drawn as chips. Arrow keys move between options like a native radio group. */
function Radios<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string
  value: T
  options: RadioOption<T>[]
  onChange: (value: T) => void
  disabled?: boolean
}) {
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (step === 0 || disabled) return
    e.preventDefault()
    const at = options.findIndex((o) => o.value === value)
    const next = options[(at + step + options.length) % options.length]
    onChange(next.value)
    const buttons = e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')
    buttons[(at + step + options.length) % options.length]?.focus()
  }

  return (
    <div role="radiogroup" aria-label={label} onKeyDown={onKeyDown} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const checked = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={`cursor-pointer rounded-app-sm border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent disabled:cursor-not-allowed disabled:opacity-50 ${
              checked
                ? 'border-app-accent bg-app-accent/15 text-app-accent-text'
                : 'border-app-border bg-app-surface text-app-foreground hover:bg-app-border/40'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/** A share code in a monospace chip with a Copy button. Only ever rendered for Teachers. */
function CodeChip({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(timer)
  }, [copied])

  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
    } catch {
      // Clipboard blocked: the code is on screen to copy by hand.
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <code className="rounded-app-sm border border-app-border bg-app-surface px-2 py-1 font-mono text-sm tracking-wider text-app-foreground">
        {code}
      </code>
      <Button variant="secondary" className="!px-2 !py-1 text-xs" onClick={() => void copy()}>
        {copied ? 'Copied' : 'Copy'}
      </Button>
    </span>
  )
}

/**
 * Generates a quiz from the open deck: one model call, deterministic assembly
 * (`buildQuestions`), one `create_quiz` write, then the owner's preview and PDF.
 *
 * Two failure paths are kept apart on purpose. A failed *generation* returns to
 * the form (nothing worth keeping). A failed *save* keeps the questions already
 * written (`pending`) and offers Save again, because regenerating would spend a
 * model call and hand back different questions.
 */
export function QuizModal({
  presentationId,
  title,
  cards,
  onClose,
}: {
  presentationId: string
  title: string
  /** Sorted by `orderIndex`. */
  cards: Card[]
  onClose: () => void
}) {
  const isTeacher = useAuthStore((s) => s.profile?.role) === 'teacher'

  const [count, setCount] = useState(DEFAULT_COUNT)
  const [countText, setCountText] = useState(String(DEFAULT_COUNT))
  const [type, setType] = useState<QuizType>('multiple_choice')
  // One config per type, so toggling away and back keeps the sub-option chosen.
  const [configs, setConfigs] = useState<Record<QuizType, QuizConfig>>(DEFAULT_CONFIGS)
  const config = configs[type]

  const [phase, setPhase] = useState<Phase>('form')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [previous, setPrevious] = useState<DeckQuizSummary[] | null>(null)
  const [pdfNotice, setPdfNotice] = useState<string | null>(null)
  /** A failed PDF build (shown as an alert), apart from the muted font notice above. */
  const [pdfError, setPdfError] = useState<string | null>(null)
  /** Which PDF is being built: 'result' for the one just made, else a quiz id. */
  const [pdfBusy, setPdfBusy] = useState<string | null>(null)

  const abortRef = useRef<AbortController | null>(null)

  // Leaving mid-generation must stop the request, not let it finish unseen.
  useEffect(() => () => abortRef.current?.abort(), [])

  useEffect(() => {
    let live = true
    listQuizzesForDeck(presentationId)
      .then((rows) => {
        if (live) setPrevious(rows)
      })
      .catch(() => {
        if (live) setPrevious([])
      })
    return () => {
      live = false
    }
  }, [presentationId])

  async function refreshPrevious() {
    try {
      setPrevious(await listQuizzesForDeck(presentationId))
    } catch {
      // A list that can't load just isn't shown.
    }
  }

  const noKey = QUIZ_CHAIN.length === 0
  const noContent = !hasQuizContent(cards)
  const busy = phase === 'generating' || phase === 'saving'

  /** Settles the number field: valid text is clamped and shown; anything else reverts. */
  function commitCount(): number {
    const parsed = parseCount(countText)
    const next = parsed ?? count
    setCount(next)
    setCountText(String(next))
    return next
  }

  function pickSubOption(next: QuizConfig) {
    setConfigs((current) => ({ ...current, [next.type]: next }))
  }

  async function save(p: Pending) {
    setPhase('saving')
    setError(null)
    setPending(null)
    let savedId = p.savedId
    try {
      if (savedId === null) {
        const created = await createQuiz({
          presentationId,
          title: `${title} — quiz`,
          deckTitle: title,
          config: p.config,
          questions: p.questions,
        })
        savedId = created.id
      }
      const quiz = await loadOwnerQuiz(savedId)
      setResult({ quiz, shortfall: p.shortfall, requested: p.requested })
      setPhase('done')
      void refreshPrevious()
    } catch (err) {
      setError(friendlyError(err, true))
      setPending({ ...p, savedId })
      setPhase('form')
    }
  }

  async function generate() {
    const requested = commitCount()
    const chosen = config
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const { signal } = controller

    setError(null)
    setPdfNotice(null)
    setPdfError(null)
    setPending(null)
    setPhase('generating')

    let built: ReturnType<typeof buildQuestions>
    try {
      const response = await generateQuizWithFallback(
        QUIZ_CHAIN,
        { title, slides: quizSlides(cards), count: requested, config: chosen },
        signal,
      )
      if (signal.aborted) {
        setPhase('form')
        return
      }
      built = buildQuestions({
        response,
        config: chosen,
        count: requested,
        cards: cards.map((c, i) => ({ id: c.id, heading: headingTextOf(c, i) })),
        seed: crypto.randomUUID(),
      })
    } catch (err) {
      // A cancel is the user's own act: back to the form, no message.
      if (!signal.aborted) setError(friendlyError(err, false))
      setPhase('form')
      return
    }

    if (built.questions.length === 0) {
      setError("The AI couldn't write questions from this deck. Try again or add more content.")
      setPhase('form')
      return
    }

    await save({
      questions: built.questions,
      shortfall: built.shortfall,
      config: chosen,
      requested,
      savedId: null,
    })
  }

  async function downloadPdf(key: string, load: () => Promise<OwnerQuiz>) {
    setPdfBusy(key)
    setPdfNotice(null)
    setPdfError(null)
    try {
      const { unicodeFont } = await exportQuizPdf(await load())
      if (!unicodeFont) {
        setPdfNotice("The accent-safe font couldn't be loaded, so accented characters may not appear.")
      }
    } catch (err) {
      setPdfError(`Couldn't build the PDF: ${describeError(err)}`)
    } finally {
      setPdfBusy(null)
    }
  }

  function makeAnother() {
    setResult(null)
    setError(null)
    setPdfNotice(null)
    setPdfError(null)
    setPhase('form')
  }

  if (phase === 'done' && result) {
    const { quiz, shortfall, requested } = result
    return (
      <Modal title="Generate a quiz" onClose={onClose}>
        <h3 className="text-base font-semibold text-app-foreground">Quiz ready</h3>
        {shortfall > 0 && (
          <p className="mt-1 text-sm text-app-muted">
            Generated {quiz.questions.length} of {requested} — the deck didn't have enough material for more.
          </p>
        )}

        <div className="mt-3">
          <QuizPreview quiz={quiz} />
        </div>

        <div className="mt-4 text-sm">
          {isTeacher ? (
            <div className="space-y-2">
              <CodeChip code={quiz.code} />
              <p className="text-xs text-app-muted">
                Post it to a class from{' '}
                <Link
                  to="/classroom/quizzes"
                  className="rounded-app-sm text-app-accent-text underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent"
                >
                  Quizzes
                </Link>{' '}
                to let students answer.
              </p>
            </div>
          ) : (
            <p className="text-xs text-app-muted">Sharing needs a Teacher account.</p>
          )}
        </div>

        {pdfNotice && (
          <p role="status" className="mt-3 text-xs text-app-muted">
            {pdfNotice}
          </p>
        )}

        {pdfError && (
          <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
            {pdfError}
          </p>
        )}

        <div className="mt-6 flex items-center justify-end gap-2">
          <Button variant="secondary" onClick={makeAnother}>
            Make another
          </Button>
          <Button
            variant="primary"
            loading={pdfBusy === 'result'}
            disabled={pdfBusy !== null}
            onClick={() => void downloadPdf('result', () => Promise.resolve(quiz))}
          >
            Download PDF
          </Button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal title="Generate a quiz" onClose={onClose}>
      {pending ? (
        <div>
          <p className="text-sm text-app-muted">
            {pending.savedId !== null
              ? `Your quiz was saved, but it couldn't be loaded just now.`
              : `${pending.questions.length} questions are written. They just haven't been saved yet.`}
          </p>
          {error && (
            <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
          <div className="mt-6 flex items-center justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                // A quiz that did save should show up in the list even if we can't open it now.
                if (pending.savedId !== null) void refreshPrevious()
                setError(null)
                setPending(null)
              }}
            >
              Discard
            </Button>
            <Button variant="primary" onClick={() => void save(pending)}>
              {pending.savedId !== null ? 'Try loading again' : 'Save again'}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p className="text-sm text-app-muted">
            Questions are written once from your slides and saved. The answer key is for you; students see only the
            questions.
          </p>

          <div className="mt-4 space-y-4">
            <div className="w-28">
              <Field
                label="Items"
                hint={`${MIN_QUIZ_ITEMS}–${MAX_QUIZ_ITEMS}`}
                render={(fieldProps) => (
                  <Input
                    {...fieldProps}
                    inputMode="numeric"
                    autoComplete="off"
                    value={countText}
                    disabled={busy}
                    onChange={(e) => setCountText(e.target.value)}
                    onBlur={commitCount}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        commitCount()
                      }
                    }}
                  />
                )}
              />
            </div>

            <div>
              <p className="mb-1 text-xs font-medium text-app-muted">Type</p>
              <Radios
                label="Quiz type"
                value={type}
                options={TYPE_OPTIONS}
                onChange={setType}
                disabled={busy}
              />
            </div>

            <div>
              <p className="mb-1 text-xs font-medium text-app-muted">Options</p>
              {config.type === 'multiple_choice' && (
                <Radios
                  label="Number of choices"
                  value={String(config.choiceCount)}
                  options={[
                    { value: '3', label: 'A–C' },
                    { value: '4', label: 'A–D' },
                  ]}
                  onChange={(v) => pickSubOption({ type: 'multiple_choice', choiceCount: v === '3' ? 3 : 4 })}
                  disabled={busy}
                />
              )}
              {config.type === 'fill_blank' && (
                <Radios
                  label="Word box"
                  value={config.wordBox ? 'box' : 'none'}
                  options={[
                    { value: 'none', label: 'No word box' },
                    { value: 'box', label: 'Word box' },
                  ]}
                  onChange={(v) => pickSubOption({ type: 'fill_blank', wordBox: v === 'box' })}
                  disabled={busy}
                />
              )}
              {config.type === 'true_false' && (
                <Radios
                  label="Answer notation"
                  value={config.notation}
                  options={[
                    { value: 'word', label: 'TRUE / FALSE' },
                    { value: 'letter', label: 'T / F' },
                  ]}
                  onChange={(v) => pickSubOption({ type: 'true_false', notation: v })}
                  disabled={busy}
                />
              )}
            </div>
          </div>

          {noKey && <p className="mt-4 text-xs text-app-muted">Quiz generation needs VITE_GROQ_API_KEY.</p>}
          {!noKey && noContent && <p className="mt-4 text-xs text-app-muted">Add some slide content first.</p>}
          {error && (
            <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
          {pdfNotice && (
            <p role="status" className="mt-3 text-xs text-app-muted">
              {pdfNotice}
            </p>
          )}
          {pdfError && (
            <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
              {pdfError}
            </p>
          )}

          <div className="mt-6 flex items-center justify-end gap-2">
            {phase === 'generating' && (
              <Button variant="secondary" onClick={() => abortRef.current?.abort()}>
                Cancel
              </Button>
            )}
            <Button
              variant="primary"
              loading={busy}
              disabled={busy || noKey || noContent}
              onClick={() => void generate()}
            >
              Generate
            </Button>
          </div>

          {previous && previous.length > 0 && (
            <section className="mt-6 border-t border-app-border pt-4" aria-label="Quizzes from this deck">
              <h3 className="text-sm font-semibold text-app-foreground">Quizzes from this deck</h3>
              <ul className="mt-2 space-y-2">
                {previous.map((q) => (
                  <li
                    key={q.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-app border border-app-border px-3 py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-app-foreground">{q.title}</p>
                      <p className="text-xs text-app-muted">
                        {q.itemCount} questions · {TYPE_LABEL[q.config.type]} ·{' '}
                        {new Date(q.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {isTeacher && <CodeChip code={q.code} />}
                      <Button
                        variant="secondary"
                        className="!px-2 !py-1 text-xs"
                        loading={pdfBusy === q.id}
                        disabled={pdfBusy !== null || busy}
                        onClick={() => void downloadPdf(q.id, () => loadOwnerQuiz(q.id))}
                      >
                        PDF
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </Modal>
  )
}
