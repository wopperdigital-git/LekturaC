import { useEffect, useReducer, useRef, useState, type KeyboardEvent } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { SectionList } from './SectionCard'
import { DeckQuizList } from './DeckQuizList'
import { QuizPreviewModal } from './QuizPreviewModal'
import { QUIZ_CHAIN } from '@/ai/fallbackProvider'
import { hasQuizContent } from '@/ai/quizPrompt'
import { listQuizzesForDeck, loadOwnerQuiz } from '@/quiz/api'
import type { DeckQuizSummary, OwnerQuiz } from '@/quiz/rows'
import { exportQuizPdf } from '@/quiz/pdf/quizPdf'
import { startQuizJob } from '@/jobs/start'
import { changesForm, newSection, sectionsReducer, toSectionRequests, type SectionAction } from '@/quiz/sectionForm'
import type { Card } from '@/engine/contentBlocks'
import { describeError } from '@/store/presentationStore'
import { useAuthStore } from '@/store/authStore'

type Tab = 'create' | 'list'

const TABS: { id: Tab; label: string }[] = [
  { id: 'create', label: 'Create new quiz' },
  { id: 'list', label: 'Quizzes from this deck' },
]

/**
 * The quiz form and the deck's saved quizzes. Generate hands the form to a
 * background job (`startQuizJob`) and closes: the top-bar strip and the corner
 * panel carry the progress, and the finished quiz shows on the second tab. Both
 * tab panels stay mounted, so switching tabs never loses the form.
 */
export function QuizModal({
  presentationId,
  title,
  cards,
  onClose,
  initialTab = 'create',
  quizIsNew = false,
  onListOpened,
  quizRunning = false,
}: {
  presentationId: string
  title: string
  /** Sorted by `orderIndex`. */
  cards: Card[]
  onClose: () => void
  initialTab?: Tab
  /** A finished quiz the user has not seen: dots the list tab. */
  quizIsNew?: boolean
  /** Called while the list tab is showing, so the page can clear the new-quiz marks. */
  onListOpened?: () => void
  /** A quiz job is already running: Generate waits. */
  quizRunning?: boolean
}) {
  const isTeacher = useAuthStore((s) => s.profile?.role) === 'teacher'

  const [tab, setTab] = useState<Tab>(initialTab)
  const [drafts, dispatch] = useReducer(sectionsReducer, undefined, () => [newSection(0, crypto.randomUUID())])
  const [startError, setStartError] = useState<string | null>(null)
  const [previous, setPrevious] = useState<DeckQuizSummary[] | null>(null)
  const [previousError, setPreviousError] = useState(false)
  const [pdfNotice, setPdfNotice] = useState<string | null>(null)
  /** A failed PDF build (shown as an alert), apart from the muted font notice above. */
  const [pdfError, setPdfError] = useState<string | null>(null)
  /** The id of the quiz whose PDF is being built. */
  const [pdfBusy, setPdfBusy] = useState<string | null>(null)
  /** The saved quiz open in the preview modal, if any. */
  const [previewing, setPreviewing] = useState<DeckQuizSummary | null>(null)

  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])

  useEffect(() => {
    if (tab === 'list') onListOpened?.()
  }, [tab, onListOpened])

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

  const noKey = QUIZ_CHAIN.length === 0
  const noContent = !hasQuizContent(cards)

  function edit(action: SectionAction) {
    dispatch(action)
    if (changesForm(action)) setStartError(null)
  }

  function addTest() {
    edit({ kind: 'add', key: crypto.randomUUID() })
  }

  function generate() {
    // `dispatch` applies on the next render, so the requests come from the committed form directly.
    const committed = sectionsReducer(drafts, { kind: 'commitAll' })
    dispatch({ kind: 'commitAll' })
    setPdfNotice(null)
    setPdfError(null)
    if (startQuizJob({ presentationId, title, cards, requests: toSectionRequests(committed) })) onClose()
    else setStartError('A quiz is already generating.')
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
    return (
      <div>
        <p className="mb-4 text-sm text-app-muted">
          Questions are written once from your slides and saved. Each test is written separately; the answer key is for
          you, and students see only the questions.
        </p>

        <SectionList drafts={drafts} dispatch={edit} onAdd={addTest} disabled={false} />

        {noKey && <p className="mt-4 text-xs text-app-muted">Quiz generation needs VITE_GROQ_API_KEY.</p>}
        {!noKey && noContent && <p className="mt-4 text-xs text-app-muted">Add some slide content first.</p>}
        {quizRunning && <p className="mt-4 text-xs text-app-muted">A quiz is already generating.</p>}
        {startError && (
          <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
            {startError}
          </p>
        )}
        {notices}

        <div className="mt-6 flex items-center justify-end gap-2">
          <Button
            variant="primary"
            disabled={noKey || noContent || quizRunning}
            title={quizRunning ? 'A quiz is already generating' : undefined}
            onClick={generate}
          >
            Generate
          </Button>
        </div>
      </div>
    )
  }

  return (
    // While the preview is open, Escape and a backdrop press belong to it alone:
    // both modals listen for Escape on the window, so this one stands down.
    <Modal title="Generate a quiz" maxWidth="max-w-3xl" onClose={previewing ? () => {} : onClose}>
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
              {t.id === 'list' && quizIsNew && (
                <span aria-label="New quiz" className="ml-1.5 inline-block size-2 rounded-full bg-amber-400 align-middle" />
              )}
              {t.id === 'list' && previous && previous.length > 0 && (
                <span className="ml-1.5 rounded-full bg-app-surface px-1.5 py-0.5 text-xs text-app-muted">
                  {previous.length}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* One fixed height for both tabs, so switching never resizes the modal; each panel scrolls inside it. */}
      <div className="h-[60vh]">
        <div
          role="tabpanel"
          id="quiz-panel-create"
          aria-labelledby="quiz-tab-create"
          hidden={tab !== 'create'}
          className="scrollbar-subtle h-full overflow-y-auto pr-1"
        >
          {createPanel()}
        </div>
        <div
          role="tabpanel"
          id="quiz-panel-list"
          aria-labelledby="quiz-tab-list"
          hidden={tab !== 'list'}
          className="scrollbar-subtle h-full overflow-y-auto pr-1"
        >
          <DeckQuizList
            quizzes={previous}
            loadError={previousError}
            isTeacher={isTeacher}
            pdfBusy={pdfBusy}
            busy={false}
            onPdf={(id) => void downloadPdf(id, () => loadOwnerQuiz(id))}
            onOpen={(q) => {
              setPdfNotice(null)
              setPdfError(null)
              setPreviewing(q)
            }}
          />
          {tab === 'list' && !previewing && notices}
        </div>
      </div>

      {previewing && (
        <QuizPreviewModal
          summary={previewing}
          isTeacher={isTeacher}
          pdfBusy={pdfBusy}
          onPdf={(quiz) => void downloadPdf(quiz.id, () => Promise.resolve(quiz))}
          notices={notices}
          onClose={() => setPreviewing(null)}
        />
      )}
    </Modal>
  )
}
