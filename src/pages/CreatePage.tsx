import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { usePresentationStore } from '@/store/presentationStore'
import { GeminiProvider } from '@/ai/geminiProvider'
import { AIProviderError, type GenerationBrief } from '@/ai/provider'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Input'
import { Spinner } from '@/components/ui/Spinner'

// Back on Gemini (was temporarily on Groq while Gemini was returning 503s
// under high demand). To switch back to Groq: swap this import/usage for
// GroqProvider and GROQ_API_KEY below — groqProvider.ts and
// VITE_GROQ_API_KEY are both left in place for exactly that.
const GEMINI_API_KEY = (import.meta.env.VITE_GEMINI_API_KEY ?? '').trim()

type DetailLevel = GenerationBrief['detailLevel']
type Tone = GenerationBrief['tone']

/**
 * Upper bound on the slide count.
 *
 * `geminiProvider` clamps `maxOutputTokens` at 8192, which is roughly what a
 * ~28-card deck needs — asking for more buys no extra budget and just truncates
 * the JSON mid-deck, so the request is rejected here instead of failing slowly.
 */
const MAX_SLIDES = 30

/** Answers persist here so a refresh mid-brief doesn't discard the whole thing. */
const DRAFT_KEY = 'lekturac:create-draft'

const DETAIL_OPTIONS: { value: DetailLevel; label: string; description: string }[] = [
  { value: 'simplified', label: 'Simplified', description: 'Quick & easy to skim' },
  { value: 'balanced', label: 'Balanced', description: 'Clear with real substance' },
  { value: 'detailed', label: 'Detailed', description: 'Deep and thorough' },
]

const TONE_OPTIONS: { value: Tone; label: string; description: string }[] = [
  { value: 'professional', label: 'Professional', description: 'Polished & business-appropriate' },
  { value: 'casual', label: 'Casual', description: 'Warm & conversational' },
  { value: 'bold', label: 'Bold', description: 'Punchy & high-energy' },
]

type StepKey = 'topic' | 'slideCount' | 'audience' | 'detailLevel' | 'tone' | 'guidance'

interface Answers {
  topic: string | null
  slideCount: number | 'auto' | null
  audience: string | null
  detailLevel: DetailLevel | null
  tone: Tone | null
  /** `''` is a real answer here (the user skipped it); `null` means unanswered. */
  guidance: string | null
}

const NO_ANSWERS: Answers = {
  topic: null,
  slideCount: null,
  audience: null,
  detailLevel: null,
  tone: null,
  guidance: null,
}

/** `answering` covers both the initial brief and any post-error edit. */
type Phase = 'answering' | 'generating' | 'failed' | 'done'

function loadDraft(): Answers {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return NO_ANSWERS
    // spread over the defaults so an older/partial payload can't leave holes
    return { ...NO_ANSWERS, ...(JSON.parse(raw) as Partial<Answers>) }
  } catch {
    return NO_ANSWERS
  }
}

function AssistantBubble({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <div
      id={id}
      className="max-w-[85%] self-start rounded-app-sm bg-app-surface px-4 py-3 text-sm text-app-foreground"
    >
      {children}
    </div>
  )
}

function UserBubble({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-app-sm bg-app-accent px-4 py-3 text-sm text-app-accent-foreground">
      {children}
    </div>
  )
}

/**
 * An answered step: the reply plus the affordance to change it. Without this the
 * only way to fix a typo three questions back was reloading the page.
 */
function AnsweredRow({
  children,
  onEdit,
  editLabel,
}: {
  children: ReactNode
  onEdit?: () => void
  editLabel: string
}) {
  return (
    <div className="flex max-w-[85%] items-center gap-2 self-end">
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          aria-label={editLabel}
          className="cursor-pointer rounded-app-sm px-1.5 py-1 text-xs text-app-muted transition-colors hover:text-app-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent"
        >
          Edit
        </button>
      )}
      <UserBubble>{children}</UserBubble>
    </div>
  )
}

function ChipGroup<T extends string>({
  options,
  selected,
  onSelect,
}: {
  options: { value: T; label: string; description: string }[]
  selected?: T | null
  onSelect: (value: T) => void
}) {
  return (
    <div className="flex flex-wrap gap-2 self-start">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onSelect(opt.value)}
          aria-pressed={selected === opt.value}
          className={`cursor-pointer rounded-app-sm border bg-app-background px-4 py-2 text-left transition-colors hover:border-app-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent ${
            selected === opt.value ? 'border-app-accent' : 'border-app-border'
          }`}
        >
          <div className="text-sm font-medium text-app-foreground">{opt.label}</div>
          <div className="text-xs text-app-muted">{opt.description}</div>
        </button>
      ))}
    </div>
  )
}

export function CreatePage() {
  const navigate = useNavigate()
  const { createDeckFromGeneration, createDeck } = usePresentationStore()

  const uid = useId()
  const qid = (step: StepKey) => `${uid}-q-${step}`

  const [answers, setAnswers] = useState<Answers>(loadDraft)
  const [editing, setEditing] = useState<StepKey | null>(null)

  const [topicDraft, setTopicDraft] = useState('')
  const [slideCountDraft, setSlideCountDraft] = useState('8')
  const [audienceDraft, setAudienceDraft] = useState('')
  const [guidanceDraft, setGuidanceDraft] = useState('')

  const [phase, setPhase] = useState<Phase>('answering')
  const [error, setError] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [skipping, setSkipping] = useState(false)

  const abortRef = useRef<AbortController | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const { topic, slideCount, audience, detailLevel, tone, guidance } = answers
  const isGenerating = phase === 'generating'

  // Checked up front rather than inside startGeneration: without this the user
  // answered all six questions before being told the app has no key.
  const missingKey = !GEMINI_API_KEY

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [answers, editing, phase, error])

  // Persist the brief, so a refresh or an accidental back-navigation is recoverable.
  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(answers))
    } catch {
      // private mode / quota — the flow still works, it just isn't recoverable
    }
  }, [answers])

  // Elapsed counter: a long generation with a bare spinner looks indistinguishable
  // from a hang, and the provider can retry for several seconds before succeeding.
  useEffect(() => {
    if (!isGenerating) return
    setElapsed(0)
    const timer = setInterval(() => setElapsed((s) => s + 1), 1000)
    return () => clearInterval(timer)
  }, [isGenerating])

  // A reload mid-generation loses the in-flight deck, which nothing can recover.
  useEffect(() => {
    if (!isGenerating) return
    function warn(e: BeforeUnloadEvent) {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [isGenerating])

  // Abandoning the page mid-request should stop it, not leave it running.
  useEffect(() => () => abortRef.current?.abort(), [])

  function clearDraft() {
    try {
      localStorage.removeItem(DRAFT_KEY)
    } catch {
      // nothing to do — the deck is already created either way
    }
  }

  async function startGeneration(brief: Answers) {
    const { topic: t, slideCount: count, audience: aud, detailLevel: level, tone: tn } = brief
    // Narrows the six nullable fields in one place. Previously a failed check
    // silently fell through and left "All set…" on screen forever.
    if (t === null || count === null || aud === null || level === null || tn === null) {
      setPhase('failed')
      setError('Some answers are still missing. Fill in the questions above and try again.')
      return
    }

    const controller = new AbortController()
    abortRef.current = controller
    setPhase('generating')
    setError(null)

    try {
      const provider = new GeminiProvider(GEMINI_API_KEY)
      const deck = await provider.generateDeck(
        t,
        {
          slideCount: count,
          audience: aud,
          detailLevel: level,
          tone: tn,
          guidance: brief.guidance ?? '',
        },
        controller.signal,
      )
      const id = await createDeckFromGeneration(deck)
      clearDraft()
      setPhase('done')
      void navigate(`/deck/${id}`)
    } catch (err) {
      if (controller.signal.aborted) {
        // user-initiated — back to the brief with no error shouting at them
        setPhase('answering')
        return
      }
      setPhase('failed')
      setError(err instanceof AIProviderError ? err.message : 'Generation failed. Try again.')
    } finally {
      abortRef.current = null
    }
  }

  function answer(patch: Partial<Answers>, { generate = false } = {}) {
    const next = { ...answers, ...patch }
    setAnswers(next)
    setEditing(null)
    // Editing after a failure clears the stale error; the Generate button below
    // lets them re-run when they're happy with the brief.
    if (phase === 'failed') {
      setPhase('answering')
      setError(null)
    }
    if (generate) void startGeneration(next)
  }

  function beginEdit(step: StepKey) {
    if (topic !== null) setTopicDraft(topic)
    setSlideCountDraft(slideCount === 'auto' || slideCount === null ? '8' : String(slideCount))
    if (audience !== null) setAudienceDraft(audience)
    setGuidanceDraft(guidance ?? '')
    setEditing(step)
  }

  const parsedSlideCount = parseInt(slideCountDraft, 10)
  const slideCountError =
    slideCountDraft.trim() === '' || !Number.isInteger(parsedSlideCount)
      ? 'Enter a number.'
      : parsedSlideCount < 1
        ? 'At least 1 slide.'
        : parsedSlideCount > MAX_SLIDES
          ? `${MAX_SLIDES} slides max — longer decks get truncated mid-generation.`
          : null

  function handleTopicKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (topicDraft.trim()) answer({ topic: topicDraft.trim() })
    }
  }

  async function handleSkip() {
    setSkipping(true)
    setError(null)
    try {
      const id = await createDeck()
      clearDraft()
      void navigate(`/deck/${id}`)
    } catch (err) {
      // previously unhandled: the button just looked dead on a failure
      setSkipping(false)
      setError(err instanceof Error ? err.message : 'Could not create a blank presentation.')
    }
  }

  const answeredAll =
    topic !== null &&
    slideCount !== null &&
    audience !== null &&
    detailLevel !== null &&
    tone !== null &&
    guidance !== null

  /** Answers lock while a request is in flight, so the brief can't drift under it. */
  const canEdit = phase !== 'generating' && phase !== 'done'
  const editHandler = (step: StepKey) => (canEdit ? () => beginEdit(step) : undefined)

  const skipButton = (
    <button
      type="button"
      onClick={() => void handleSkip()}
      disabled={skipping}
      className="cursor-pointer rounded-app-sm text-xs text-app-muted transition-colors hover:text-app-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent disabled:cursor-not-allowed disabled:opacity-50"
    >
      {skipping ? 'Creating…' : 'Skip and start with a blank canvas instead'}
    </button>
  )

  return (
    <div className="flex min-h-screen flex-col bg-app-canvas">
      <div className="flex items-center px-6 py-4">
        <Link
          to="/"
          className="rounded-app-sm text-sm text-app-muted transition-colors hover:text-app-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent"
        >
          ← Home
        </Link>
      </div>

      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col px-6 pb-16">
        <div
          // role="log" so a screen reader announces each new question as it
          // appears — the whole interaction is questions arriving one at a time
          role="log"
          aria-live="polite"
          aria-relevant="additions text"
          className="flex flex-1 flex-col gap-4 rounded-app bg-app-background p-8 shadow-md"
        >
          {missingKey ? (
            <>
              <Alert tone="error">
                No AI key configured. Add <code className="font-mono text-xs">VITE_GEMINI_API_KEY</code>{' '}
                to your <code className="font-mono text-xs">.env</code> file and restart the dev
                server.
              </Alert>
              <div className="self-start">{skipButton}</div>
              {/* the blank-canvas path is the only action here, so its failures
                  need somewhere to land on this branch too */}
              {error && <Alert tone="error">{error}</Alert>}
            </>
          ) : (
            <>
              <AssistantBubble id={qid('topic')}>What's this presentation about?</AssistantBubble>
              {topic === null || editing === 'topic' ? (
                <form
                  onSubmit={(e: FormEvent) => {
                    e.preventDefault()
                    if (topicDraft.trim()) answer({ topic: topicDraft.trim() })
                  }}
                  className="flex w-full flex-col gap-2 self-start"
                >
                  <Textarea
                    rows={3}
                    autoFocus
                    aria-labelledby={qid('topic')}
                    placeholder="e.g. a pitch for a solar panel startup called Helios"
                    value={topicDraft}
                    onChange={(e) => setTopicDraft(e.target.value)}
                    onKeyDown={handleTopicKeyDown}
                  />
                  <div className="flex items-center justify-between gap-3">
                    {editing === 'topic' ? (
                      <Button variant="ghost" type="button" onClick={() => setEditing(null)}>
                        Cancel
                      </Button>
                    ) : (
                      skipButton
                    )}
                    <Button type="submit" variant="primary" disabled={!topicDraft.trim()}>
                      {editing === 'topic' ? 'Save' : 'Next'}
                    </Button>
                  </div>
                </form>
              ) : (
                <AnsweredRow onEdit={editHandler('topic')} editLabel="Edit the topic">
                  {topic}
                </AnsweredRow>
              )}

              {topic !== null && (
                <>
                  <AssistantBubble id={qid('slideCount')}>How many slides?</AssistantBubble>
                  {slideCount === null || editing === 'slideCount' ? (
                    <form
                      onSubmit={(e: FormEvent) => {
                        e.preventDefault()
                        if (!slideCountError) answer({ slideCount: parsedSlideCount })
                      }}
                      className="flex w-full max-w-[280px] flex-col gap-2 self-start"
                    >
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          min={1}
                          max={MAX_SLIDES}
                          autoFocus
                          aria-labelledby={qid('slideCount')}
                          aria-describedby={slideCountError ? `${uid}-slide-error` : undefined}
                          invalid={Boolean(slideCountError)}
                          value={slideCountDraft}
                          onChange={(e) => setSlideCountDraft(e.target.value)}
                        />
                        <Button type="submit" variant="primary" disabled={Boolean(slideCountError)}>
                          {editing === 'slideCount' ? 'Save' : 'Next'}
                        </Button>
                      </div>
                      {slideCountError && (
                        <p id={`${uid}-slide-error`} className="text-xs text-red-600">
                          {slideCountError}
                        </p>
                      )}
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => answer({ slideCount: 'auto' })}
                          className="cursor-pointer rounded-app-sm text-xs text-app-muted transition-colors hover:text-app-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent"
                        >
                          Not sure — let AI decide
                        </button>
                        {editing === 'slideCount' && (
                          <button
                            type="button"
                            onClick={() => setEditing(null)}
                            className="cursor-pointer rounded-app-sm text-xs text-app-muted transition-colors hover:text-app-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </form>
                  ) : (
                    <AnsweredRow
                      onEdit={editHandler('slideCount')}
                      editLabel="Edit the slide count"
                    >
                      {slideCount === 'auto' ? 'Let AI decide' : slideCount}
                    </AnsweredRow>
                  )}
                </>
              )}

              {slideCount !== null && (
                <>
                  <AssistantBubble id={qid('audience')}>
                    Who's this presentation for?
                  </AssistantBubble>
                  {audience === null || editing === 'audience' ? (
                    <form
                      onSubmit={(e: FormEvent) => {
                        e.preventDefault()
                        if (audienceDraft.trim()) answer({ audience: audienceDraft.trim() })
                      }}
                      className="flex w-full flex-col gap-2 self-start"
                    >
                      <div className="flex gap-2">
                        <Input
                          autoFocus
                          aria-labelledby={qid('audience')}
                          placeholder="e.g. investors, customers, my team, students..."
                          value={audienceDraft}
                          onChange={(e) => setAudienceDraft(e.target.value)}
                        />
                        <Button type="submit" variant="primary" disabled={!audienceDraft.trim()}>
                          {editing === 'audience' ? 'Save' : 'Next'}
                        </Button>
                      </div>
                      {editing === 'audience' && (
                        <button
                          type="button"
                          onClick={() => setEditing(null)}
                          className="cursor-pointer self-start rounded-app-sm text-xs text-app-muted transition-colors hover:text-app-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent"
                        >
                          Cancel
                        </button>
                      )}
                    </form>
                  ) : (
                    <AnsweredRow onEdit={editHandler('audience')} editLabel="Edit the audience">
                      {audience}
                    </AnsweredRow>
                  )}
                </>
              )}

              {audience !== null && (
                <>
                  <AssistantBubble id={qid('detailLevel')}>
                    How much detail should it go into?
                  </AssistantBubble>
                  {detailLevel === null || editing === 'detailLevel' ? (
                    <ChipGroup
                      options={DETAIL_OPTIONS}
                      selected={detailLevel}
                      onSelect={(value) => answer({ detailLevel: value })}
                    />
                  ) : (
                    <AnsweredRow
                      onEdit={editHandler('detailLevel')}
                      editLabel="Edit the detail level"
                    >
                      {DETAIL_OPTIONS.find((o) => o.value === detailLevel)?.label}
                    </AnsweredRow>
                  )}
                </>
              )}

              {detailLevel !== null && (
                <>
                  <AssistantBubble id={qid('tone')}>What tone fits best?</AssistantBubble>
                  {tone === null || editing === 'tone' ? (
                    <ChipGroup
                      options={TONE_OPTIONS}
                      selected={tone}
                      onSelect={(value) => answer({ tone: value })}
                    />
                  ) : (
                    <AnsweredRow onEdit={editHandler('tone')} editLabel="Edit the tone">
                      {TONE_OPTIONS.find((o) => o.value === tone)?.label}
                    </AnsweredRow>
                  )}
                </>
              )}

              {tone !== null && (
                <>
                  <AssistantBubble id={qid('guidance')}>
                    Anything specific it should focus on—or steer clear of? (optional)
                  </AssistantBubble>
                  {guidance === null || editing === 'guidance' ? (
                    <form
                      onSubmit={(e: FormEvent) => {
                        e.preventDefault()
                        answer({ guidance: guidanceDraft.trim() }, { generate: editing === null })
                      }}
                      className="flex w-full flex-col gap-2 self-start"
                    >
                      <Textarea
                        rows={2}
                        autoFocus
                        aria-labelledby={qid('guidance')}
                        placeholder="e.g. don't make up statistics, stick to the facts I gave you; or emphasize the pricing story"
                        value={guidanceDraft}
                        onChange={(e) => setGuidanceDraft(e.target.value)}
                      />
                      <div className="flex items-center justify-between gap-3">
                        {editing === 'guidance' ? (
                          <Button variant="ghost" type="button" onClick={() => setEditing(null)}>
                            Cancel
                          </Button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => answer({ guidance: '' }, { generate: true })}
                            className="cursor-pointer rounded-app-sm text-xs text-app-muted transition-colors hover:text-app-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent"
                          >
                            Skip
                          </button>
                        )}
                        <Button type="submit" variant="primary">
                          {editing === 'guidance' ? 'Save' : 'Generate'}
                        </Button>
                      </div>
                    </form>
                  ) : (
                    <AnsweredRow onEdit={editHandler('guidance')} editLabel="Edit the guidance">
                      {guidance || '(none)'}
                    </AnsweredRow>
                  )}
                </>
              )}

              {phase === 'generating' && (
                <AssistantBubble>
                  <span className="flex items-center gap-3">
                    <Spinner className="size-4 shrink-0 text-app-muted" />
                    <span>
                      Generating your presentation…
                      <span className="ml-1 text-app-muted">{elapsed}s</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => abortRef.current?.abort()}
                      className="ml-auto shrink-0 cursor-pointer rounded-app-sm px-1.5 py-1 text-xs text-app-muted transition-colors hover:text-app-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent"
                    >
                      Cancel
                    </button>
                  </span>
                </AssistantBubble>
              )}

              {phase === 'failed' && error && (
                <div className="flex max-w-[85%] flex-col gap-2 self-start">
                  <Alert tone="error">{error}</Alert>
                  <Button
                    variant="secondary"
                    className="self-start"
                    onClick={() => void startGeneration(answers)}
                  >
                    Try again
                  </Button>
                </div>
              )}

              {/* Reachable after cancelling or editing once the brief is complete. */}
              {phase === 'answering' && answeredAll && editing === null && (
                <Button
                  variant="primary"
                  className="self-start"
                  onClick={() => void startGeneration(answers)}
                >
                  Generate
                </Button>
              )}

              {phase === 'done' && (
                <AssistantBubble>All set — taking you to your presentation…</AssistantBubble>
              )}

              {/* Blank-canvas failures surface here too, not just at step one. */}
              {phase !== 'failed' && error && (
                <div className="max-w-[85%] self-start">
                  <Alert tone="error">{error}</Alert>
                </div>
              )}
            </>
          )}

          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  )
}
