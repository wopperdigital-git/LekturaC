import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { usePresentationStore } from '@/store/presentationStore'
import { PROVIDER_CHAIN } from '@/ai/fallbackProvider'
import { DEFAULT_TONE } from '@/ai/prompts'
import { startDeckJob } from '@/jobs/start'
import { useJobsStore } from '@/jobs/jobsStore'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Input'
import { TrackBand } from '@/components/ui/Programme'
import { BadgePreview, type BadgeMetaPart } from '@/components/create/BadgePreview'
import { BriefSection, ChoiceChips } from '@/components/create/BriefParts'
import { ArrowLeftIcon } from '@/components/create/icons'
import { prefersReducedMotion, printBand, rise, riseInRef, riseList, sendOff, useMotion } from '@/lib/motion'
import {
  STEP_ORDER,
  deleteDraft,
  emptyDraft,
  getDraft,
  saveDraft,
  type Answers,
  type BriefDraft,
  type DetailLevel,
  type StepKey,
} from '@/lib/briefDrafts'
import { restorePending } from '@/lib/resumePending'
import { DEFAULT_SLIDE_COUNT, MAX_SLIDES } from '@/lib/slideCount'

/**
 * Preset audiences, with an escape hatch to anything else.
 *
 * `audience` stays a free-text string in `Answers` and in `GenerationBrief`;
 * the presets only write a fixed phrase into it, so the prompt, the drafts and
 * the store are untouched by their existence. `custom` carries no text of its
 * own; picking it reveals a field.
 */
const AUDIENCE_PRESETS = [
  { value: 'general', label: 'General' },
  { value: 'student', label: 'Students' },
  { value: 'custom', label: 'Someone else' },
] as const

type AudienceChoice = (typeof AUDIENCE_PRESETS)[number]['value']

const AUDIENCE_TEXT: Record<Exclude<AudienceChoice, 'custom'>, string> = {
  general: 'a general audience',
  student: 'students',
}

const AUDIENCE_BADGE: Record<Exclude<AudienceChoice, 'custom'>, string> = {
  general: 'General audience',
  student: 'Students',
}

/** Which chip to light for an audience already answered. */
function audienceChoiceFor(audience: string | null): AudienceChoice | null {
  if (audience === null) return null
  const preset = Object.entries(AUDIENCE_TEXT).find(([, text]) => text === audience)
  return preset ? (preset[0] as AudienceChoice) : 'custom'
}

const DETAIL_OPTIONS: { value: DetailLevel; label: string; description: string }[] = [
  { value: 'simplified', label: 'Simplified', description: 'Quick and easy to skim.' },
  { value: 'balanced', label: 'Balanced', description: 'Clear, with real substance.' },
  { value: 'detailed', label: 'Detailed', description: 'Fuller slides: the facts and the why.' },
]

const SLIDE_OPTIONS: { value: number | 'auto'; label: string; narrow?: boolean; breakBefore?: boolean }[] = [
  ...Array.from({ length: MAX_SLIDES }, (_, i) => ({ value: i + 1, label: String(i + 1), narrow: true })),
  // Its own row: the alternative to a number, not an eighth number.
  { value: 'auto', label: 'Let AI decide', breakBefore: true },
]

/** "a, b and c" */
function listPhrase(items: string[]): string {
  return items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

/**
 * `/new`: the brief as one proposal sheet, every question visible and
 * answerable in any order, with the deck's dashboard badge filling in beside
 * it. Generation is a background job (`startDeckJob`); this page only writes
 * the brief, keeps it as a draft on every keystroke and hands it off.
 */
export function CreatePage() {
  const navigate = useNavigate()
  const { createDeck } = usePresentationStore()

  const uid = useId()
  const id = (part: string) => `${uid}-${part}`

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
  const saved = resumed.answers

  // Drafts from the one-question-at-a-time brief kept text typed into the open
  // question as `pendingText`; it belongs to the first unanswered step (a chip
  // step takes it only if it reads as an option, else it goes to guidance).
  const resumedStep: StepKey | null = STEP_ORDER.find((step) => saved[step] === null) ?? null
  const pending = restorePending(resumedStep, resumed.pendingText)
  const initialAudience = audienceChoiceFor(saved.audience) ?? (pending.audience ? 'custom' : null)

  const [topicText, setTopicText] = useState(() => saved.topic ?? pending.topic ?? '')
  const [slideCount, setSlideCount] = useState<number | 'auto'>(
    () => saved.slideCount ?? pending.slideCount ?? DEFAULT_SLIDE_COUNT,
  )
  const [audienceChoice, setAudienceChoice] = useState<AudienceChoice | null>(initialAudience)
  const [audienceText, setAudienceText] = useState(() =>
    initialAudience === 'custom' ? (saved.audience ?? pending.audience ?? '') : '',
  )
  const [detailLevel, setDetailLevel] = useState<DetailLevel | null>(saved.detailLevel ?? pending.detailLevel ?? null)
  const [guidanceText, setGuidanceText] = useState(() => saved.guidance ?? pending.guidance ?? '')

  const [leaving, setLeaving] = useState(false)
  const [showMissing, setShowMissing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [skipping, setSkipping] = useState(false)

  const topicRef = useRef<HTMLTextAreaElement>(null)
  const audienceRef = useRef<HTMLDivElement>(null)
  const audienceInputRef = useRef<HTMLInputElement>(null)
  const detailRef = useRef<HTMLDivElement>(null)
  const badgeRef = useRef<HTMLDivElement>(null)

  const deckRunning = useJobsStore((s) => s.jobs.deck?.status === 'running')
  // Checked up front: one key is enough, the chain then has one link.
  const missingKey = PROVIDER_CHAIN.length === 0

  const topic = topicText.trim() || null
  const audience =
    audienceChoice === 'custom'
      ? audienceText.trim() || null
      : audienceChoice
        ? AUDIENCE_TEXT[audienceChoice]
        : null
  const guidance = guidanceText.trim() || null

  // The slide count always has a value on screen, so it only counts as an
  // answer once something else does; otherwise every visit to /new would leave
  // a draft behind.
  const touched = topic !== null || audienceChoice !== null || detailLevel !== null || guidance !== null
  const answers: Answers = {
    topic,
    slideCount: touched ? slideCount : null,
    audience,
    detailLevel,
    guidance,
  }

  const missing: { label: string; focus: () => void }[] = []
  if (topic === null) missing.push({ label: 'a topic', focus: () => topicRef.current?.focus() })
  if (audience === null)
    missing.push({
      label: 'an audience',
      focus: () =>
        (audienceChoice === 'custom'
          ? audienceInputRef.current
          : audienceRef.current?.querySelector<HTMLInputElement>('input'))?.focus(),
    })
  if (detailLevel === null)
    missing.push({ label: 'a detail level', focus: () => detailRef.current?.querySelector('input')?.focus() })

  // Persist on every keystroke, so leaving costs nothing; there is no prompt on
  // the way out for exactly this reason.
  const draftSlideCount = answers.slideCount
  useEffect(() => {
    if (leaving) return
    saveDraft({
      id: draftId,
      answers: { topic, slideCount: draftSlideCount, audience, detailLevel, guidance },
      pendingText: '',
      savedAt: Date.now(),
    })
  }, [draftId, leaving, topic, draftSlideCount, audience, detailLevel, guidance])

  const pageRef = useMotion<HTMLDivElement>(({ reduce, root }) => {
    printBand(root.querySelectorAll('[data-motion=band] > span'), reduce)
    rise(root.querySelectorAll('[data-motion=head]'), reduce, { delay: reduce ? 0 : 0.1, stagger: 0.05 })
    riseList(root.querySelectorAll('[data-motion=section]'), reduce, { delay: reduce ? 0 : 0.18 })
    rise(root.querySelectorAll('[data-motion=aside]'), reduce, { delay: reduce ? 0 : 0.26, y: 16, duration: 0.5 })
  })

  function generate() {
    if (leaving || deckRunning) return
    setError(null)
    if (topic === null || audience === null || detailLevel === null) {
      setShowMissing(true)
      missing[0]?.focus()
      return
    }
    const brief: Answers = { topic, slideCount, audience, detailLevel, guidance: guidance ?? '' }
    // Saved complete now: the page leaves before the autosave would run, and
    // the draft is what "Edit brief" comes back to if the job fails.
    saveDraft({ id: draftId, answers: brief, pendingText: '', savedAt: Date.now() })
    const started = startDeckJob({
      topic,
      requestedCount: slideCount,
      draftId,
      brief: {
        slideCount,
        audience,
        detailLevel,
        // The brief no longer asks for a tone; every deck is generated with the default.
        tone: DEFAULT_TONE,
        guidance: guidance ?? '',
      },
    })
    if (!started) {
      setError('A deck is already generating. Wait for it to finish, then try again.')
      return
    }
    setLeaving(true)
    // The badge is sent off to the dashboard, then the page follows it.
    sendOff(badgeRef.current, prefersReducedMotion(), () => void navigate('/'))
  }

  async function handleSkip() {
    setSkipping(true)
    setError(null)
    try {
      const deckId = await createDeck()
      deleteDraft(draftId)
      void navigate(`/deck/${deckId}`)
    } catch (err) {
      setSkipping(false)
      setError(err instanceof Error ? err.message : 'Could not create a blank presentation.')
    }
  }

  function handleFormKeyDown(e: KeyboardEvent<HTMLFormElement>) {
    // ⌘/Ctrl+Enter generates from anywhere in the brief.
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      generate()
    }
  }

  const badgeMeta: BadgeMetaPart[] = [
    { text: slideCount === 'auto' ? 'AI picks the length' : `${slideCount} ${slideCount === 1 ? 'slide' : 'slides'}` },
    audienceChoice === 'custom'
      ? audience
        ? { text: audience.charAt(0).toUpperCase() + audience.slice(1) }
        : { text: 'Audience not set', missing: true }
      : audienceChoice
        ? { text: AUDIENCE_BADGE[audienceChoice] }
        : { text: 'Audience not set', missing: true },
    detailLevel
      ? { text: DETAIL_OPTIONS.find((o) => o.value === detailLevel)?.label ?? '' }
      : { text: 'Detail not set', missing: true },
  ]

  const flag = (missingNow: boolean) => showMissing && missingNow
  const topicError = flag(topic === null) ? 'Add a topic.' : null
  const audienceError = flag(audience === null)
    ? audienceChoice === 'custom'
      ? 'Describe the audience.'
      : 'Pick an audience.'
    : null
  const detailError = flag(detailLevel === null) ? 'Pick a detail level.' : null
  const describe = (...ids: (string | false)[]) => ids.filter(Boolean).join(' ') || undefined

  const subtleLink =
    'cursor-pointer rounded-app-sm text-sm text-app-muted underline underline-offset-3 transition-colors hover:text-app-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent disabled:cursor-not-allowed disabled:opacity-50'

  const skipButton = (
    <button type="button" onClick={() => void handleSkip()} disabled={skipping || leaving} className={subtleLink}>
      {skipping ? 'Creating a blank deck…' : 'Start with a blank deck instead'}
    </button>
  )

  let status: { text: string; tone: 'muted' | 'danger' }
  if (leaving) status = { text: 'Generating in the background. Taking you to your dashboard…', tone: 'muted' }
  else if (deckRunning)
    status = {
      text: 'A deck is generating right now. This brief waits in Drafts until it finishes.',
      tone: 'muted',
    }
  else if (showMissing && missing.length > 0)
    status = { text: `Add ${listPhrase(missing.map((m) => m.label))} first.`, tone: 'danger' }
  else
    status = {
      text: 'Lektura researches, writes and lays out the deck in the background. It appears on your dashboard.',
      tone: 'muted',
    }

  return (
    <div ref={pageRef} className="min-h-screen bg-app-canvas">
      <div className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-8 lg:px-10">
        <div className="mb-8 flex items-center justify-between gap-4">
          <Link
            to="/"
            className="group inline-flex items-center gap-1.5 rounded-app-sm border-[1.5px] border-app-foreground bg-app-background px-3 py-1.5 text-sm font-bold text-app-foreground transition-colors hover:bg-app-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent"
          >
            <ArrowLeftIcon className="size-3.5 transition-transform duration-150 group-hover:-translate-x-0.5 motion-reduce:transform-none" />
            Home
          </Link>
          {touched && !missingKey && (
            <Link to="/drafts" className="text-xs text-app-muted underline-offset-3 hover:text-app-foreground hover:underline">
              Saved to Drafts
            </Link>
          )}
        </div>

        <TrackBand className="mb-6 h-2" motionId="band" />
        <h1 data-motion="head" className="display text-[2rem] leading-[1.05] font-extrabold text-app-foreground sm:text-[2.75rem]">
          New presentation
        </h1>
        <p data-motion="head" className="mt-2 text-base text-app-muted">
          Fill in the brief. The preview badge shows roughly how the deck will sit on your dashboard.
        </p>

        {missingKey ? (
          <div className="mt-8 flex max-w-2xl flex-col items-start gap-4">
            {/* For whoever runs the site, so the variable names are the point. */}
            <Alert tone="error">
              No AI key configured. Add <code className="font-mono text-xs">VITE_ANTHROPIC_API_KEY</code>,{' '}
              <code className="font-mono text-xs">VITE_GROQ_API_KEY</code>, or{' '}
              <code className="font-mono text-xs">VITE_GEMINI_API_KEY</code> to your{' '}
              <code className="font-mono text-xs">.env</code> file and restart the dev server.
            </Alert>
            {skipButton}
            {error && <Alert tone="error">{error}</Alert>}
          </div>
        ) : (
          <form
            noValidate
            onSubmit={(e: FormEvent) => {
              e.preventDefault()
              generate()
            }}
            onKeyDown={handleFormKeyDown}
            className="mt-8 grid grid-cols-[minmax(0,1fr)] items-start gap-8 lg:grid-cols-[minmax(0,1fr)_22.5rem] lg:gap-12 xl:gap-14"
          >
            <div className="rounded-app border border-app-border bg-app-background">
              <BriefSection
                label="Topic"
                labelId={id('topic-label')}
                htmlFor={id('topic')}
                hintId={id('topic-hint')}
                hint="A sentence or two. The more specific, the better the deck."
                error={topicError}
                errorId={id('topic-error')}
              >
                <Textarea
                  ref={topicRef}
                  id={id('topic')}
                  rows={3}
                  autoFocus={topic === null}
                  aria-describedby={describe(Boolean(topicError) && id('topic-error'), id('topic-hint'))}
                  invalid={Boolean(topicError)}
                  placeholder="e.g. a pitch for a solar panel startup called Helios"
                  value={topicText}
                  onChange={(e) => setTopicText(e.target.value)}
                  className="text-base"
                />
              </BriefSection>

              <BriefSection
                label="Slides"
                labelId={id('slides-label')}
                hintId={id('slides-hint')}
                hint={`Up to ${MAX_SLIDES} for now. Not sure? Let AI pick a length that fits.`}
              >
                <ChoiceChips
                  name={id('slides')}
                  labelledBy={id('slides-label')}
                  describedBy={id('slides-hint')}
                  options={SLIDE_OPTIONS}
                  value={slideCount}
                  onChange={setSlideCount}
                />
              </BriefSection>

              <BriefSection
                label="Audience"
                labelId={id('audience-label')}
                hintId={id('audience-hint')}
                hint="Who's in the room? This sets the language and the level it pitches at."
                error={audienceError}
                errorId={id('audience-error')}
              >
                <div ref={audienceRef}>
                  <ChoiceChips
                    name={id('audience')}
                    labelledBy={id('audience-label')}
                    describedBy={describe(Boolean(audienceError) && id('audience-error'), id('audience-hint'))}
                    invalid={Boolean(audienceError) && audienceChoice !== 'custom'}
                    options={AUDIENCE_PRESETS.map((o) => ({ ...o }))}
                    value={audienceChoice}
                    onChange={(value) => {
                      setAudienceChoice(value)
                      if (value === 'custom') requestAnimationFrame(() => audienceInputRef.current?.focus())
                    }}
                  />
                </div>
                {audienceChoice === 'custom' && (
                  <div ref={riseInRef} className="mt-3 max-w-md">
                    <Input
                      ref={audienceInputRef}
                      aria-label="Describe the audience"
                      invalid={Boolean(audienceError)}
                      aria-describedby={audienceError ? id('audience-error') : undefined}
                      placeholder="e.g. investors, new hires, my team"
                      value={audienceText}
                      onChange={(e) => setAudienceText(e.target.value)}
                      // Enter here would submit the whole brief.
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !(e.metaKey || e.ctrlKey)) e.preventDefault()
                      }}
                    />
                  </div>
                )}
              </BriefSection>

              <BriefSection
                label="Detail"
                labelId={id('detail-label')}
                hintId={id('detail-hint')}
                hint={
                  DETAIL_OPTIONS.find((o) => o.value === detailLevel)?.description ??
                  'How deep each slide digs into the material.'
                }
                error={detailError}
                errorId={id('detail-error')}
              >
                <div ref={detailRef}>
                  <ChoiceChips
                    name={id('detail')}
                    labelledBy={id('detail-label')}
                    describedBy={describe(Boolean(detailError) && id('detail-error'), id('detail-hint'))}
                    invalid={Boolean(detailError)}
                    options={DETAIL_OPTIONS}
                    value={detailLevel}
                    onChange={setDetailLevel}
                  />
                </div>
              </BriefSection>

              <BriefSection
                label="Focus"
                optional
                labelId={id('guidance-label')}
                htmlFor={id('guidance')}
                hintId={id('guidance-hint')}
                // The second example matches `isUserMaterialOnly`, which skips web research: it is the way to say so.
                hint="The AI follows this ahead of its own choices. For example: “Focus on the water cycle” or “Only use the facts I paste here.”"
              >
                <Textarea
                  id={id('guidance')}
                  rows={2}
                  aria-describedby={id('guidance-hint')}
                  placeholder="What to focus on, or steer clear of"
                  value={guidanceText}
                  onChange={(e) => setGuidanceText(e.target.value)}
                />
              </BriefSection>
            </div>

            <aside data-motion="aside" className="lg:sticky lg:top-8">
              <p className="caps mb-2.5 text-[11px] text-app-muted">Preview</p>
              <div className="mx-auto max-w-sm lg:max-w-none">
                <BadgePreview ref={badgeRef} topic={topic ?? ''} meta={badgeMeta} />
              </div>
              <Button
                type="submit"
                variant="primary"
                className="mt-6 w-full py-2.5 text-[0.9375rem] pointer-coarse:min-h-11"
                disabled={deckRunning || leaving}
                title={deckRunning ? 'A deck is already generating' : undefined}
                aria-describedby={id('status')}
              >
                {leaving ? 'Generating…' : 'Generate presentation'}
              </Button>
              <p
                id={id('status')}
                aria-live="polite"
                className={`mt-3 text-xs ${status.tone === 'danger' ? 'text-app-danger-text' : 'text-app-muted'}`}
              >
                {status.text}
                {!leaving && !deckRunning && !(showMissing && missing.length > 0) && (
                  <span className="mt-1 block pointer-coarse:hidden">⌘ / Ctrl + Enter generates from any field.</span>
                )}
              </p>
              {error && (
                <div ref={riseInRef} className="mt-3">
                  <Alert tone="error">{error}</Alert>
                </div>
              )}
              <div className="mt-5 border-t border-app-border pt-4 text-center">{skipButton}</div>
            </aside>
          </form>
        )}
      </div>
    </div>
  )
}
