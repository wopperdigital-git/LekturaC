import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { usePresentationStore } from '@/store/presentationStore'
import { GroqProvider } from '@/ai/groqProvider'
import { GeminiProvider } from '@/ai/geminiProvider'
import { FallbackProvider, type NamedProvider } from '@/ai/fallbackProvider'
import { AIProviderError, type AIProvider } from '@/ai/provider'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Spinner'
import { AgentHeader } from '@/components/create/AgentHeader'
import { AnswerPill, OptionCards, StepBlock } from '@/components/create/ConversationStep'
import { ArrowLeftIcon, CheckIcon } from '@/components/create/icons'
import {
  STEP_ORDER,
  answeredCount,
  deleteDraft,
  emptyDraft,
  getDraft,
  saveDraft,
  type Answers,
  type BriefDraft,
  type DetailLevel,
  type StepKey,
  type Tone,
} from '@/lib/briefDrafts'

const GROQ_API_KEY = (import.meta.env.VITE_GROQ_API_KEY ?? '').trim()
const GEMINI_API_KEY = (import.meta.env.VITE_GEMINI_API_KEY ?? '').trim()

/**
 * Groq first, Gemini behind it — built once at module load.
 *
 * Both paths are operationally equivalent (each retries transient 503/429s via
 * `ai/retry.ts` and honours the AbortSignal); what differs is the ceiling.
 * Groq's free tier has a tight per-minute token cap that a large deck can
 * exhaust faster than the retries clear it, and that's exactly when
 * `FallbackProvider` reaches for Gemini. Only an out-of-capacity failure falls
 * through — see `fallbackProvider.ts` for why an auth failure must not.
 *
 * A provider with no key is left out of the chain entirely rather than added
 * and allowed to fail: dropping `VITE_GROQ_API_KEY` from `.env` makes this a
 * Gemini-only app with no code change, which is what the old "swap the import"
 * comment used to ask for by hand.
 */
const PROVIDER_CHAIN: NamedProvider[] = [
  ...(GROQ_API_KEY ? [{ name: 'Groq', provider: new GroqProvider(GROQ_API_KEY) }] : []),
  ...(GEMINI_API_KEY ? [{ name: 'Gemini', provider: new GeminiProvider(GEMINI_API_KEY) }] : []),
]

/**
 * Upper bound on the slide count.
 *
 * `geminiProvider` clamps `maxOutputTokens` at 8192, which is roughly what a
 * ~28-card deck needs — asking for more buys no extra budget and just truncates
 * the JSON mid-deck, so the request is rejected here instead of failing slowly.
 */
const MAX_SLIDES = 30

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

/** `answering` covers both the initial brief and any post-error edit. */
type Phase = 'answering' | 'generating' | 'failed' | 'done'

export function CreatePage() {
  const navigate = useNavigate()
  const { createDeckFromGeneration, createDeck } = usePresentationStore()

  const uid = useId()
  const qid = (step: StepKey) => `${uid}-q-${step}`

  // `?draft=<id>` resumes an existing brief; anything else starts a fresh one.
  // Resolved once and held in a ref so the identity can't change underfoot and
  // fork the draft into two rows mid-brief.
  const [searchParams] = useSearchParams()
  const resumedRef = useRef<BriefDraft | null>(null)
  if (resumedRef.current === null) {
    const requested = searchParams.get('draft')
    resumedRef.current = (requested && getDraft(requested)) || emptyDraft()
  }
  const resumed = resumedRef.current
  const draftId = resumed.id

  const [answers, setAnswers] = useState<Answers>(resumed.answers)
  const [editing, setEditing] = useState<StepKey | null>(null)

  // The unsubmitted text belongs to whichever question was open when the draft
  // was saved, so it's restored into that step's field and left blank elsewhere.
  const resumedStep = STEP_ORDER.find((step) => resumed.answers[step] === null) ?? null
  const restore = (step: StepKey) => (resumedStep === step ? resumed.pendingText : '')

  const [topicDraft, setTopicDraft] = useState(() => restore('topic'))
  const [slideCountDraft, setSlideCountDraft] = useState('8')
  const [audienceDraft, setAudienceDraft] = useState(() => restore('audience'))
  const [guidanceDraft, setGuidanceDraft] = useState(() => restore('guidance'))

  const [phase, setPhase] = useState<Phase>('answering')
  const [error, setError] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [skipping, setSkipping] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState(false)

  const abortRef = useRef<AbortController | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const { topic, slideCount, audience, detailLevel, tone, guidance } = answers
  const isGenerating = phase === 'generating'

  // Checked up front rather than inside startGeneration: without this the user
  // answered all six questions before being told the app has no key. One key is
  // enough — the chain simply has one link.
  const missingKey = PROVIDER_CHAIN.length === 0


  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [answers, editing, phase, error])

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

  /** Confirmed exit mid-generation: stop the request, keep the brief as a draft. */
  function cancelAndLeave() {
    abortRef.current?.abort()
    setConfirmLeave(false)
    void navigate('/')
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
      const provider: AIProvider = new FallbackProvider(PROVIDER_CHAIN)
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
      deleteDraft(draftId)
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
      deleteDraft(draftId)
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

  const completedCount = answeredCount(answers)

  /**
   * The step wearing the active-card treatment. Not simply the last one on
   * screen: reopening an earlier answer via Edit makes *that* step active again
   * while the later answers stay collapsed below it.
   */
  const activeStep: StepKey | null =
    editing ?? STEP_ORDER.find((step) => answers[step] === null) ?? null

  /** Answers lock while a request is in flight, so the brief can't drift under it. */
  const canEdit = phase !== 'generating' && phase !== 'done'
  const editHandler = (step: StepKey) => (canEdit ? () => beginEdit(step) : undefined)

  /**
   * Text sitting in the open question. Only one step is active at a time, so a
   * single slot covers all three text fields — and it's what makes a brief
   * abandoned mid-sentence resumable rather than just mid-question.
   */
  const pendingText =
    activeStep === 'topic'
      ? topicDraft
      : activeStep === 'audience'
        ? audienceDraft
        : activeStep === 'guidance'
          ? guidanceDraft
          : ''

  // Persist on every keystroke and every answer, so leaving costs nothing —
  // there's no confirmation on the way out for exactly this reason.
  useEffect(() => {
    if (phase === 'done') return
    saveDraft({ id: draftId, answers, pendingText, savedAt: Date.now() })
  }, [draftId, answers, pendingText, phase])

  const subtleButton =
    'cursor-pointer rounded-app-sm text-xs text-app-muted transition-colors hover:text-app-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent'

  const skipButton = (
    <button
      type="button"
      onClick={() => void handleSkip()}
      disabled={skipping}
      className={`${subtleButton} disabled:cursor-not-allowed disabled:opacity-50`}
    >
      {skipping ? 'Creating…' : 'Skip and start with a blank canvas instead'}
    </button>
  )

  return (
    <div className="min-h-screen bg-app-canvas">
      <div className="flex items-center px-6 py-4">
        <Link
          to="/"
          onClick={(e) => {
            // Leaving mid-brief is free — the draft is already saved, and it's
            // waiting under Drafts. Only an in-flight generation is worth
            // interrupting for, since cancelling it wastes real work.
            // Left as a real <Link> so middle-click / open-in-new-tab still work.
            if (!isGenerating) return
            e.preventDefault()
            setConfirmLeave(true)
          }}
          className="group inline-flex items-center gap-1.5 rounded-app-sm border border-app-border bg-app-surface px-3 py-1.5 text-sm font-medium text-app-muted transition-colors hover:bg-app-border/40 hover:text-app-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent"
        >
          <ArrowLeftIcon className="size-3.5 transition-transform duration-150 group-hover:-translate-x-0.5 motion-reduce:transform-none" />
          Home
        </Link>
      </div>

      {/*
        Natural height: the container starts compact and grows as the
        conversation accumulates, rather than filling the viewport up front.
      */}
      <div className="mx-auto w-full max-w-2xl px-4 pb-20 sm:px-6">
        <div className="overflow-hidden rounded-app border border-app-border bg-app-background shadow-app">
          <AgentHeader
            completed={completedCount}
            total={STEP_ORDER.length}
            showProgress={!missingKey}
          />

          <div
            // role="log" so a screen reader announces each new question as it
            // appears — the whole interaction is questions arriving one at a
            // time. The header sits outside it deliberately: its step counter
            // changes every turn and would otherwise be re-announced each time.
            role="log"
            aria-live="polite"
            aria-relevant="additions text"
            className="px-5 py-4 sm:px-6 sm:py-5"
          >
            {missingKey ? (
              <div className="flex flex-col gap-4">
                <Alert tone="error">
                  No AI key configured. Add{' '}
                  <code className="font-mono text-xs">VITE_GROQ_API_KEY</code> or{' '}
                  <code className="font-mono text-xs">VITE_GEMINI_API_KEY</code> to your{' '}
                  <code className="font-mono text-xs">.env</code> file and restart the dev server.
                </Alert>
                <div className="self-start">{skipButton}</div>
                {/* the blank-canvas path is the only action here, so its failures
                    need somewhere to land on this branch too */}
                {error && <Alert tone="error">{error}</Alert>}
              </div>
            ) : (
              <>
                <StepBlock
                  active={activeStep === 'topic'}
                  question="What's this presentation about?"
                  hint="Describe it in a sentence or two — the more specific, the better the deck."
                  questionId={qid('topic')}
                >
                  {activeStep === 'topic' ? (
                    <form
                      onSubmit={(e: FormEvent) => {
                        e.preventDefault()
                        if (topicDraft.trim()) answer({ topic: topicDraft.trim() })
                      }}
                      className="flex w-full flex-col gap-3"
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
                      <div className="flex flex-wrap items-center justify-between gap-3">
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
                    <AnswerPill onEdit={editHandler('topic')} editLabel="Edit the topic">
                      {topic}
                    </AnswerPill>
                  )}
                </StepBlock>

                {topic !== null && (
                  <StepBlock
                    active={activeStep === 'slideCount'}
                    question="How many slides?"
                    hint={`Up to ${MAX_SLIDES}. Not sure? Let the agent pick a length that fits.`}
                    questionId={qid('slideCount')}
                  >
                    {activeStep === 'slideCount' ? (
                      <form
                        onSubmit={(e: FormEvent) => {
                          e.preventDefault()
                          if (!slideCountError) answer({ slideCount: parsedSlideCount })
                        }}
                        className="flex w-full max-w-[300px] flex-col gap-2"
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
                          <Button
                            type="submit"
                            variant="primary"
                            disabled={Boolean(slideCountError)}
                          >
                            {editing === 'slideCount' ? 'Save' : 'Next'}
                          </Button>
                        </div>
                        {slideCountError && (
                          <p id={`${uid}-slide-error`} className="text-xs text-red-600">
                            {slideCountError}
                          </p>
                        )}
                        <div className="flex items-center gap-4">
                          <button
                            type="button"
                            onClick={() => answer({ slideCount: 'auto' })}
                            className={subtleButton}
                          >
                            Not sure — let AI decide
                          </button>
                          {editing === 'slideCount' && (
                            <button
                              type="button"
                              onClick={() => setEditing(null)}
                              className={subtleButton}
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </form>
                    ) : (
                      <AnswerPill
                        onEdit={editHandler('slideCount')}
                        editLabel="Edit the slide count"
                      >
                        {slideCount === 'auto' ? 'Let AI decide' : `${slideCount} slides`}
                      </AnswerPill>
                    )}
                  </StepBlock>
                )}

                {slideCount !== null && (
                  <StepBlock
                    active={activeStep === 'audience'}
                    question="Who's this presentation for?"
                    hint="Who's in the room? This shapes the language and the level it pitches at."
                    questionId={qid('audience')}
                  >
                    {activeStep === 'audience' ? (
                      <form
                        onSubmit={(e: FormEvent) => {
                          e.preventDefault()
                          if (audienceDraft.trim()) answer({ audience: audienceDraft.trim() })
                        }}
                        className="flex w-full flex-col gap-2"
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
                            className={`self-start ${subtleButton}`}
                          >
                            Cancel
                          </button>
                        )}
                      </form>
                    ) : (
                      <AnswerPill onEdit={editHandler('audience')} editLabel="Edit the audience">
                        {audience}
                      </AnswerPill>
                    )}
                  </StepBlock>
                )}

                {audience !== null && (
                  <StepBlock
                    active={activeStep === 'detailLevel'}
                    question="How much detail should it go into?"
                    hint="How deep each slide digs into the material."
                    questionId={qid('detailLevel')}
                  >
                    {activeStep === 'detailLevel' ? (
                      <div className="flex flex-col gap-3">
                        <OptionCards
                          options={DETAIL_OPTIONS}
                          selected={detailLevel}
                          onSelect={(value) => answer({ detailLevel: value })}
                        />
                        {editing === 'detailLevel' && (
                          <button
                            type="button"
                            onClick={() => setEditing(null)}
                            className={`self-start ${subtleButton}`}
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    ) : (
                      <AnswerPill
                        onEdit={editHandler('detailLevel')}
                        editLabel="Edit the detail level"
                      >
                        {DETAIL_OPTIONS.find((o) => o.value === detailLevel)?.label}
                      </AnswerPill>
                    )}
                  </StepBlock>
                )}

                {detailLevel !== null && (
                  <StepBlock
                    active={activeStep === 'tone'}
                    question="What tone fits best?"
                    hint="Choose the voice your presentation should speak in."
                    questionId={qid('tone')}
                  >
                    {activeStep === 'tone' ? (
                      <div className="flex flex-col gap-3">
                        <OptionCards
                          options={TONE_OPTIONS}
                          selected={tone}
                          onSelect={(value) => answer({ tone: value })}
                        />
                        {editing === 'tone' && (
                          <button
                            type="button"
                            onClick={() => setEditing(null)}
                            className={`self-start ${subtleButton}`}
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    ) : (
                      <AnswerPill onEdit={editHandler('tone')} editLabel="Edit the tone">
                        {TONE_OPTIONS.find((o) => o.value === tone)?.label}
                      </AnswerPill>
                    )}
                  </StepBlock>
                )}

                {tone !== null && (
                  <StepBlock
                    active={activeStep === 'guidance'}
                    question="Anything to focus on — or steer clear of?"
                    hint="Optional. A hard constraint that overrides the agent's general content rules."
                    questionId={qid('guidance')}
                  >
                    {activeStep === 'guidance' ? (
                      <form
                        onSubmit={(e: FormEvent) => {
                          e.preventDefault()
                          answer({ guidance: guidanceDraft.trim() }, { generate: editing === null })
                        }}
                        className="flex w-full flex-col gap-3"
                      >
                        <Textarea
                          rows={2}
                          autoFocus
                          aria-labelledby={qid('guidance')}
                          placeholder="e.g. don't make up statistics, stick to the facts I gave you; or emphasize the pricing story"
                          value={guidanceDraft}
                          onChange={(e) => setGuidanceDraft(e.target.value)}
                        />
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          {editing === 'guidance' ? (
                            <Button variant="ghost" type="button" onClick={() => setEditing(null)}>
                              Cancel
                            </Button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => answer({ guidance: '' }, { generate: true })}
                              className={subtleButton}
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
                      <AnswerPill onEdit={editHandler('guidance')} editLabel="Edit the guidance">
                        {guidance || 'None'}
                      </AnswerPill>
                    )}
                  </StepBlock>
                )}

                {phase === 'generating' && (
                  <div className="create-step-in mt-3 flex items-center gap-3 rounded-app border border-app-border bg-app-surface/50 p-4 sm:p-5">
                    <Spinner className="size-4 shrink-0 text-app-accent-text" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-app-foreground">
                        Generating your presentation…
                      </p>
                      <p className="mt-0.5 text-xs tabular-nums text-app-muted">
                        Writing slides from your brief · {elapsed}s
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => abortRef.current?.abort()}
                      className={`shrink-0 ${subtleButton}`}
                    >
                      Cancel
                    </button>
                  </div>
                )}

                {phase === 'failed' && error && (
                  <div className="mt-3 flex flex-col gap-3">
                    <Alert tone="error">{error}</Alert>
                    <Button
                      variant="primary"
                      className="self-start"
                      onClick={() => void startGeneration(answers)}
                    >
                      Try again
                    </Button>
                  </div>
                )}

                {/* Reachable after cancelling or editing once the brief is complete. */}
                {phase === 'answering' && answeredAll && editing === null && (
                  <div className="mt-4 flex justify-end border-t border-app-border pt-4">
                    <Button variant="primary" onClick={() => void startGeneration(answers)}>
                      Generate presentation
                    </Button>
                  </div>
                )}

                {phase === 'done' && (
                  <div className="mt-3 flex items-center gap-2.5 rounded-app border border-app-border bg-app-surface/50 p-4 sm:p-5">
                    <CheckIcon className="size-4 shrink-0 text-app-accent-text" />
                    <p className="text-sm text-app-foreground">
                      All set — taking you to your presentation…
                    </p>
                  </div>
                )}

                {/* Blank-canvas failures surface here too, not just at step one. */}
                {phase !== 'failed' && error && (
                  <div className="mt-3">
                    <Alert tone="error">{error}</Alert>
                  </div>
                )}
              </>
            )}

            <div ref={bottomRef} />
          </div>
        </div>
      </div>

      {confirmLeave && (
        <Modal title="Cancel this generation?" onClose={() => setConfirmLeave(false)}>
          <p className="text-sm text-app-muted">
            Your presentation is still being generated. Leaving now cancels it — your brief is
            saved under Drafts, so you can come back and run it again.
          </p>
          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmLeave(false)}>
              Keep waiting
            </Button>
            <Button variant="danger" onClick={cancelAndLeave}>
              Cancel and go home
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}
