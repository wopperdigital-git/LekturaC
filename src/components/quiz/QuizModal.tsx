import { useEffect, useReducer, useRef, useState, type KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { QuizPreview } from './QuizPreview'
import { SectionList } from './SectionCard'
import { CodeChip, DeckQuizList } from './DeckQuizList'
import { QUIZ_CHAIN, generateQuizWithFallback } from '@/ai/fallbackProvider'
import { hasQuizContent, quizSlides } from '@/ai/quizPrompt'
import { AIProviderError } from '@/ai/provider'
import { buildQuestions } from '@/quiz/build'
import { createQuiz, listQuizzesForDeck, loadOwnerQuiz } from '@/quiz/api'
import type { DeckQuizSummary, OwnerQuiz } from '@/quiz/rows'
import { exportQuizPdf } from '@/quiz/pdf/quizPdf'
import { EmptySectionError, SectionFailure, generateSections, type BuiltSection } from '@/quiz/sections'
import { changesForm, newSection, sectionsReducer, toSectionRequests, type SectionAction } from '@/quiz/sectionForm'
import { headingTextOf, type Card } from '@/engine/contentBlocks'
import { describeError } from '@/store/presentationStore'
import { useAuthStore } from '@/store/authStore'

type Tab = 'create' | 'list'
type Phase = 'form' | 'generating' | 'saving' | 'done'

const TABS: { id: Tab; label: string }[] = [
  { id: 'create', label: 'Create new quiz' },
  { id: 'list', label: 'Quizzes from this deck' },
]

/** Written tests held after a failed save, so "Save again" never regenerates. */
interface Pending {
  built: BuiltSection[]
  /** Set once `create_quiz` has succeeded, so a retry only re-reads and never creates a duplicate. */
  savedId: string | null
}

interface Result {
  quiz: OwnerQuiz
  built: BuiltSection[]
}

function friendlyError(err: unknown, saving: boolean): string {
  if (err instanceof AIProviderError && err.kind === 'capacity') {
    return 'The free AI model is busy. Try again in a minute.'
  }
  const message = describeError(err)
  return saving && /create_quiz/i.test(message) ? `${message} Run migration 0016 in Supabase.` : message
}

function failureMessage(failure: SectionFailure): string {
  if (failure.cause instanceof EmptySectionError) {
    return `The AI couldn't write questions for ${failure.section.title}. Try again or add more content.`
  }
  return `${failure.section.title}: ${friendlyError(failure.cause, false)}`
}

/**
 * Makes a quiz of 1–3 tests from the open deck: one model call per test, in
 * order (`generateSections`), deterministic assembly (`buildQuestions`), one
 * `create_quiz` write for the whole quiz, then the owner's preview and PDF.
 *
 * Failure paths are kept apart on purpose. A failed *test* keeps the tests
 * before it and Try again resumes there (each test is a model call worth
 * keeping); editing the form drops them, since they no longer match it. A
 * failed *save* keeps every written test (`pending`) and offers Save again.
 * Both tab panels stay mounted, so switching tabs never cancels a run.
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

  const [tab, setTab] = useState<Tab>('create')
  const [drafts, dispatch] = useReducer(sectionsReducer, undefined, () => [newSection(0, crypto.randomUUID())])
  /** Tests finished before a failure; the next Generate resumes after them. */
  const [written, setWritten] = useState<BuiltSection[]>([])
  const [progress, setProgress] = useState<number | null>(null)

  const [phase, setPhase] = useState<Phase>('form')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [previous, setPrevious] = useState<DeckQuizSummary[] | null>(null)
  const [previousError, setPreviousError] = useState(false)
  const [pdfNotice, setPdfNotice] = useState<string | null>(null)
  /** A failed PDF build (shown as an alert), apart from the muted font notice above. */
  const [pdfError, setPdfError] = useState<string | null>(null)
  /** Which PDF is being built: 'result' for the one just made, else a quiz id. */
  const [pdfBusy, setPdfBusy] = useState<string | null>(null)

  const abortRef = useRef<AbortController | null>(null)
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])

  // Leaving mid-generation must stop the request, not let it finish unseen.
  useEffect(() => () => abortRef.current?.abort(), [])

  useEffect(() => {
    let live = true
    listQuizzesForDeck(presentationId)
      .then((rows) => {
        if (live) setPrevious(rows)
      })
      .catch(() => {
        if (live) setPreviousError(true)
      })
    return () => {
      live = false
    }
  }, [presentationId])

  async function refreshPrevious() {
    try {
      setPrevious(await listQuizzesForDeck(presentationId))
      setPreviousError(false)
    } catch {
      // Keep what is shown.
    }
  }

  const noKey = QUIZ_CHAIN.length === 0
  const noContent = !hasQuizContent(cards)
  const busy = phase === 'generating' || phase === 'saving'

  /** A change to the form drops tests written for the old form (a blur's count commit is not a change). */
  function edit(action: SectionAction) {
    dispatch(action)
    if (changesForm(action)) setWritten([])
  }

  function addTest() {
    edit({ kind: 'add', key: crypto.randomUUID() })
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
          sections: p.built.map((b) => ({ section: b.section, questions: b.questions })),
        })
        savedId = created.id
      }
      const quiz = await loadOwnerQuiz(savedId)
      setResult({ quiz, built: p.built })
      setPhase('done')
      void refreshPrevious()
    } catch (err) {
      setError(friendlyError(err, true))
      setPending({ ...p, savedId })
      setPhase('form')
    }
  }

  async function generate() {
    dispatch({ kind: 'commitAll' })
    const requests = toSectionRequests(drafts)
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const { signal } = controller
    const seed = crypto.randomUUID()
    const slides = quizSlides(cards)
    const cardRefs = cards.map((c, i) => ({ id: c.id, heading: headingTextOf(c, i) }))

    setError(null)
    setPdfNotice(null)
    setPdfError(null)
    setPending(null)
    setPhase('generating')

    let built: BuiltSection[]
    try {
      built = await generateSections({
        requests,
        written,
        signal,
        onProgress: setProgress,
        write: async (request, index, avoid) => {
          const response = await generateQuizWithFallback(
            QUIZ_CHAIN,
            { title, slides, count: request.count, config: request.section.config, avoid },
            signal,
          )
          return buildQuestions({
            response,
            config: request.section.config,
            count: request.count,
            cards: cardRefs,
            seed: `${seed}:${index}`,
          })
        },
      })
    } catch (err) {
      setProgress(null)
      if (signal.aborted) {
        // A cancel is the user's own act: back to the form, nothing kept, no message.
        setWritten([])
      } else if (err instanceof SectionFailure) {
        setWritten(err.written)
        setError(failureMessage(err))
      } else {
        setError(friendlyError(err, false))
      }
      setPhase('form')
      return
    }

    setProgress(null)
    setWritten([])
    await save({ built, savedId: null })
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

  function onTabKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (step === 0) return
    e.preventDefault()
    const at = TABS.findIndex((t) => t.id === tab)
    const next = (at + step + TABS.length) % TABS.length
    setTab(TABS[next].id)
    tabRefs.current[next]?.focus()
  }

  const notices = (
    <>
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
    </>
  )

  function createPanel() {
    if (phase === 'done' && result) {
      const { quiz, built } = result
      const short = built.filter((b) => b.shortfall > 0)
      return (
        <div>
          <h3 className="text-base font-semibold text-app-foreground">Quiz ready</h3>
          {short.map((b) => (
            <p key={b.section.title} className="mt-1 text-sm text-app-muted">
              {b.section.title}: generated {b.questions.length} of {b.requested} — the deck didn&apos;t have enough
              material for more.
            </p>
          ))}

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

          {notices}

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
        </div>
      )
    }

    if (pending) {
      const count = pending.built.reduce((n, b) => n + b.questions.length, 0)
      return (
        <div>
          <p className="text-sm text-app-muted">
            {pending.savedId !== null
              ? `Your quiz was saved, but it couldn't be loaded just now.`
              : `${count} questions are written. They just haven't been saved yet.`}
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
      )
    }

    const resuming = written.length > 0
    return (
      <div>
        <p className="mb-4 text-sm text-app-muted">
          Questions are written once from your slides and saved. Each test is written separately; the answer key is for
          you, and students see only the questions.
        </p>

        <SectionList drafts={drafts} dispatch={edit} onAdd={addTest} disabled={busy} />

        {noKey && <p className="mt-4 text-xs text-app-muted">Quiz generation needs VITE_GROQ_API_KEY.</p>}
        {!noKey && noContent && <p className="mt-4 text-xs text-app-muted">Add some slide content first.</p>}
        {phase === 'generating' && progress !== null && (
          <p role="status" className="mt-4 text-sm text-app-muted">
            Writing {drafts[progress]?.title.trim() || `Test ${progress + 1}`} ({progress + 1} of {drafts.length})…
          </p>
        )}
        {error && (
          <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
        {resuming && phase === 'form' && (
          <p className="mt-2 text-xs text-app-muted">
            {written.length === 1 ? 'The first test is' : `The first ${written.length} tests are`} written; Try again
            continues from the next one. Changing the form starts over.
          </p>
        )}
        {notices}

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
            {resuming ? 'Try again' : 'Generate'}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <Modal title="Generate a quiz" maxWidth="max-w-3xl" onClose={onClose}>
      <div role="tablist" aria-label="Quiz" onKeyDown={onTabKeyDown} className="mb-5 flex gap-1 border-b border-app-border">
        {TABS.map((t, i) => {
          const selected = tab === t.id
          return (
            <button
              key={t.id}
              ref={(el) => {
                tabRefs.current[i] = el
              }}
              type="button"
              role="tab"
              id={`quiz-tab-${t.id}`}
              aria-controls={`quiz-panel-${t.id}`}
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => setTab(t.id)}
              className={`-mb-px cursor-pointer border-b-2 px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent ${
                selected
                  ? 'border-app-accent text-app-foreground'
                  : 'border-transparent text-app-muted hover:text-app-foreground'
              }`}
            >
              {t.label}
              {t.id === 'list' && previous && previous.length > 0 && (
                <span className="ml-1.5 rounded-full bg-app-surface px-1.5 py-0.5 text-xs text-app-muted">
                  {previous.length}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div role="tabpanel" id="quiz-panel-create" aria-labelledby="quiz-tab-create" hidden={tab !== 'create'}>
        {createPanel()}
      </div>
      <div role="tabpanel" id="quiz-panel-list" aria-labelledby="quiz-tab-list" hidden={tab !== 'list'}>
        <DeckQuizList
          quizzes={previous}
          loadError={previousError}
          isTeacher={isTeacher}
          pdfBusy={pdfBusy}
          busy={busy}
          onPdf={(id) => void downloadPdf(id, () => loadOwnerQuiz(id))}
        />
        {tab === 'list' && notices}
      </div>
    </Modal>
  )
}
