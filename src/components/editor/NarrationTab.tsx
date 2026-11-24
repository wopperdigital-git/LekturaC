import { useEffect, useState, type ReactNode } from 'react'
import { usePresentationStore } from '@/store/presentationStore'
import { PROVIDER_CHAIN } from '@/ai/fallbackProvider'
import { hasValidTargets, isResettable, narrationStatus, type NarrationStatus } from '@/engine/narration'
import { INTRO, OUTRO, stepSpot, type ScriptSpot } from '@/engine/scriptSpots'
import { headingTextOf } from '@/engine/contentBlocks'
import { startNarrationJob } from '@/jobs/start'
import { useJobsStore } from '@/jobs/jobsStore'
import { formatDuration, speakingSeconds, wordCount } from '@/lib/speakingTime'
import { useBookendsStore } from '@/avatar/bookendsStore'
import { EMPTY_BOOKENDS, starterIntro, starterOutro } from '@/avatar/bookends'
import { Spinner } from '@/components/ui/Spinner'
import { GenerateScriptsModal } from '@/components/narrate/GenerateScriptsModal'
import { bookendMeta } from '@/avatar/costLine'
import { CloneVoiceModal } from '@/components/voice/CloneVoiceModal'
import { isCartesiaConfigured } from '@/voice/cartesia'
import { AI_NOT_SET_UP, VOICE_NOT_SET_UP, warnMissingKey } from '@/lib/setupCopy'
import type { VideoStep } from '@/video/steps'
import type { Card } from '@/engine/contentBlocks'

const STATUS_LABEL: Record<NarrationStatus, string> = {
  empty: 'No script yet',
  generated: 'Generated',
  edited: 'Edited by you',
}

// A chip per state: generated is plain stock, edited is the teal of "yours", empty is a dashed outline.
const STATUS_CHIP: Record<NarrationStatus, string> = {
  empty: 'border border-dashed border-app-muted/60 text-app-muted',
  generated: 'bg-app-surface text-app-foreground ring-1 ring-app-border',
  edited: 'bg-app-highlight/12 text-app-highlight-text ring-1 ring-app-highlight/40',
}

const BOOKEND_COPY = { intro: 'Intro', outro: 'Outro' } as const

/**
 * The Narration tab of the editor's right panel: the whole narration in the order the video plays
 * it, intro → every slide → outro, one stop at a time. A navigator at the top steps along it (Previous,
 * Next, and a map of every stop with the scripted ones filled); the box below edits the
 * stop it is on. Stepping to a slide moves the editor to that slide (`onGoToCard`), and pressing a slide
 * on the canvas brings the tab back to it, so the canvas stays the viewer.
 *
 * Writing scripts is a background job (`jobs/narrationJob.ts`), so leaving the editor or switching tabs
 * never cancels it; this tab starts it, shows it while it runs on this deck (the corner panel leaves it to
 * the tab here) with Cancel, and shows a failure with Try again. It still owns the choose-slides dialog,
 * which asks before overwriting a hand-edited script.
 *
 * `cards` must already be sorted by `orderIndex`.
 */
export function NarrationTab({
  cards,
  cardId,
  openVoice,
  onVoiceOpened,
  onGoToCard,
}: {
  cards: Card[]
  cardId: string | null
  /** Set when the page asks for the video dialog, at the step it should open on (the Create & export menu, or the corner panel's "View Video"). */
  openVoice?: VideoStep | null
  onVoiceOpened?: () => void
  /** Moves the editor to a slide. Without it the navigator steps only between the intro and the outro. */
  onGoToCard?: (cardId: string) => void
}) {
  const presentationId = usePresentationStore((s) => s.presentationId)
  const theme = usePresentationStore((s) => s.theme)
  const textStyle = usePresentationStore((s) => s.textStyle)
  const title = usePresentationStore((s) => s.title)
  const status = usePresentationStore((s) => s.status)
  const errorMessage = usePresentationStore((s) => s.errorMessage)
  const setNarrationText = usePresentationStore((s) => s.setNarrationText)
  const resetNarration = usePresentationStore((s) => s.resetNarration)
  // The scripts job, when it is this deck's: running, or failed with its reason.
  const job = useJobsStore((s) => (s.jobs.narration && s.jobs.narration.deckId === presentationId ? s.jobs.narration : null))
  const generating = job?.status === 'running'

  // The intro and outro text for the open deck. Until this deck's text has loaded, show the
  // starters read-only: an edit then would have nowhere to go.
  const bookendsDeckId = useBookendsStore((s) => s.deckId)
  const bookendsLoaded = useBookendsStore((s) => s.loaded)
  const storedBookends = useBookendsStore((s) => s.bookends)
  const bookendsWarning = useBookendsStore((s) => s.warning)
  const bookendsMine = bookendsDeckId === presentationId
  const bookends = bookendsMine ? storedBookends : EMPTY_BOOKENDS
  const bookendsEditable = bookendsMine && bookendsLoaded
  const introValue = bookends.intro ?? starterIntro(title)
  const outroValue = bookends.outro ?? starterOutro(title)

  const [error, setError] = useState<string | null>(null)
  const [choosing, setChoosing] = useState(false)
  const [voiceStep, setVoiceStep] = useState<VideoStep | null>(null)

  // Showing the intro or the outro is this tab's own state; a slide is the editor's. A new slide from
  // the editor (a press on the canvas or the outline) wins over either, so the tab follows the canvas.
  const [bookendShown, setBookendShown] = useState<'intro' | 'outro' | null>(null)
  const [seenCardId, setSeenCardId] = useState(cardId)
  if (seenCardId !== cardId) {
    setSeenCardId(cardId)
    setBookendShown(null)
  }

  // Finished scripts are already in the boxes; the job has nothing more to say here.
  useEffect(() => {
    if (job?.status === 'done') useJobsStore.getState().dismiss('narration')
  }, [job?.status])

  useEffect(() => {
    if (presentationId) void useBookendsStore.getState().load(presentationId)
  }, [presentationId])

  // `beforeunload` does not fire when the user only navigates away inside the app, so an
  // edit made just before leaving would wait on the 500 ms timer.
  useEffect(
    () => () => {
      void useBookendsStore.getState().flush()
    },
    [],
  )

  useEffect(() => {
    if (!openVoice) return
    setVoiceStep(openVoice)
    onVoiceOpened?.()
  }, [openVoice, onVoiceOpened])

  const index = cardId === null ? -1 : cards.findIndex((c) => c.id === cardId)
  const card = index >= 0 ? cards[index] : undefined
  const narration = card?.narration
  const text = narration?.text ?? ''
  const words = wordCount(text)
  const scriptStatus = narrationStatus(narration)
  const voiceReady = isCartesiaConfigured()

  const texts = cards.map((c) => c.narration?.text ?? '')

  const spot: ScriptSpot | null = bookendShown
    ? { kind: bookendShown }
    : card
      ? { kind: 'slide', index }
      : null

  function canReach(to: ScriptSpot | null): to is ScriptSpot {
    return to !== null && (to.kind !== 'slide' || onGoToCard !== undefined)
  }

  function goTo(to: ScriptSpot) {
    if (to.kind === 'slide') {
      const target = cards[to.index]
      if (!target || !onGoToCard) return
      setBookendShown(null)
      onGoToCard(target.id)
    } else {
      setBookendShown(to.kind)
    }
  }

  // With nothing on screen yet, Previous starts at the intro and Next at slide 1.
  const prevSpot = spot ? stepSpot(spot, -1, cards.length) : INTRO
  const nextSpot = spot ? stepSpot(spot, 1, cards.length) : cards.length > 0 ? { kind: 'slide' as const, index: 0 } : OUTRO

  /**
   * Starts the scripts job over an explicit set of 0-based slide positions, handed to the
   * job as card ids (see `narrationJob.ts`). The set is the whole of the user's intent:
   * the job asks the model only about those slides and writes nowhere else.
   */
  function runGeneration(targets: Set<number>) {
    // A position can go stale between the click and here (an undo behind an open dialog).
    if (!hasValidTargets(targets, cards.length) || !presentationId) return
    if (PROVIDER_CHAIN.length === 0) {
      warnMissingKey('Script writing', 'VITE_ANTHROPIC_API_KEY, VITE_GROQ_API_KEY or VITE_GEMINI_API_KEY')
      setError(AI_NOT_SET_UP)
      return
    }
    setError(null)
    const targetIds = cards.filter((_, i) => targets.has(i)).map((c) => c.id)
    if (!startNarrationJob({ presentationId, title, targetIds })) {
      setError('Scripts are already being written for another deck. Wait for them to finish, then try again.')
    }
  }

  // A narration script is typed by hand and can never be regenerated the way a
  // deck can, so a save that fails silently is the worst outcome here: the text
  // looks saved, and it is gone on reload with nothing said. It is also how a
  // missing migration 0008 announces itself. Save failure first: it describes
  // work already done and unrecoverable, so it outranks a stale generation error
  // (`error` is only cleared when the NEXT generation starts).
  const saveError = status === 'error' ? (errorMessage ?? 'Your changes could not be saved.') : null
  const jobError = job?.status === 'failed' ? job.error : null
  const shownError = saveError ?? jobError ?? error

  return (
    <div className="flex h-full flex-col">
      {generating && (
        <div role="status" className="flex shrink-0 items-center gap-2 border-b border-app-border bg-app-surface px-3 py-2">
          <Spinner className="size-3.5 shrink-0 text-app-accent-text" />
          <p className="min-w-0 flex-1 text-[11px] text-app-foreground">Writing narration…</p>
          <PanelButton
            label="Cancel"
            disabled={!job?.cancellable}
            onClick={() => useJobsStore.getState().cancel('narration')}
          >
            Cancel
          </PanelButton>
        </div>
      )}
      {shownError && (
        <div role="alert" className="shrink-0 border-b border-app-danger/30 bg-app-danger/10 px-3 py-2">
          <p className="text-xs font-medium text-app-danger-text">{shownError}</p>
          {jobError && !saveError && (
            <div className="mt-2 flex gap-1.5">
              <PanelButton label="Try again" onClick={() => useJobsStore.getState().retry('narration')}>
                Try again
              </PanelButton>
              <PanelButton label="Dismiss" quiet onClick={() => useJobsStore.getState().dismiss('narration')}>
                Dismiss
              </PanelButton>
            </div>
          )}
        </div>
      )}

      {/* ---- Navigator: where you are in the narration, and the way along it ---- */}
      <nav aria-label="Narration scripts" className="shrink-0 border-b border-app-border px-3 pt-2.5 pb-2">
        <div className="flex items-center gap-2">
          <StepArrow dir="prev" disabled={!canReach(prevSpot)} onClick={() => canReach(prevSpot) && goTo(prevSpot)} />
          <h2
            className="min-w-0 flex-1 truncate text-center text-[13px] font-semibold text-app-foreground tabular-nums"
            aria-live="polite"
            title={card && !bookendShown ? headingTextOf(card, index) : undefined}
          >
            {spot === null
              ? cards.length === 0
                ? 'No slides'
                : 'No slide selected'
              : spot.kind === 'slide'
                ? `Slide ${spot.index + 1} of ${cards.length}`
                : BOOKEND_COPY[spot.kind]}
          </h2>
          <StepArrow dir="next" disabled={!canReach(nextSpot)} onClick={() => canReach(nextSpot) && goTo(nextSpot)} />
        </div>

        <ScriptMap
          texts={texts}
          spot={spot}
          introFilled={introValue.trim() !== ''}
          outroFilled={outroValue.trim() !== ''}
          canGoToSlides={onGoToCard !== undefined}
          onGo={goTo}
        />

      </nav>

      {/* ---- The box for the stop the navigator is on ---- */}
      {spot?.kind === 'intro' || spot?.kind === 'outro' ? (
        <ScriptBox
          key={spot.kind}
          value={spot.kind === 'intro' ? introValue : outroValue}
          label={BOOKEND_COPY[spot.kind]}
          placeholder="Empty means no clip."
          disabled={!bookendsEditable}
          onChange={(value) => useBookendsStore.getState().set(spot.kind === 'intro' ? { intro: value } : { outro: value })}
          footer={<p className="text-[11px] text-app-muted tabular-nums">{bookendMeta(spot.kind === 'intro' ? introValue : outroValue)}</p>}
        />
      ) : card ? (
        <ScriptBox
          chip={
            <span className={`inline-flex items-center rounded-[4px] px-1.5 py-0.5 text-[11px] font-semibold ${STATUS_CHIP[scriptStatus]}`}>
              {STATUS_LABEL[scriptStatus]}
            </span>
          }
          action={
            isResettable(narration) && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => resetNarration(card.id)}
                className="cursor-pointer rounded-app-sm text-[11px] text-app-muted underline underline-offset-2 transition-colors hover:text-app-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent"
                title="Put the AI's version back"
              >
                Reset to generated
              </button>
            )
          }
          value={text}
          label={`Script for slide ${index + 1}`}
          placeholder="What the narrator says on this slide."
          disabled={false}
          onChange={(value) => setNarrationText(card.id, value)}
          footer={
            <p className="text-[11px] text-app-muted tabular-nums">
              {words} {words === 1 ? 'word' : 'words'} · ~{formatDuration(speakingSeconds(text))}
            </p>
          }
        />
      ) : (
        <p className="flex min-h-0 flex-1 items-center justify-center px-6 text-center text-xs text-app-muted">
          {cards.length === 0 ? 'This deck has no slides yet.' : 'Select a slide to write its script.'}
        </p>
      )}

      {/* A failed intro/outro save is shown whichever stop is on screen. It is not in `shownError`, so the
          save > job > generation order stays true and a job's Try again is never hidden by it. */}
      {bookendsWarning && <p className="shrink-0 px-3 pb-2 text-xs font-medium text-app-danger-text">{bookendsWarning}</p>}

      {/* Neither depends on the selected slide: the AI button opens a picker over the whole deck, and
          the voice belongs to the user. */}
      <div className="grid shrink-0 grid-cols-2 gap-1.5 border-t border-app-border px-3 py-2">
        <PanelButton
          label="Write with AI"
          title="Choose slides and write their scripts with AI"
          disabled={generating || cards.length === 0}
          onClick={() => setChoosing(true)}
        >
          <SparkleIcon />
          Write with AI
        </PanelButton>
        <PanelButton
          label="Voice & video"
          title={voiceReady ? 'Pick a voice and make a narrated video of the deck' : VOICE_NOT_SET_UP}
          disabled={!voiceReady}
          onClick={() => setVoiceStep('voice')}
        >
          <MicIcon />
          Voice &amp; video
        </PanelButton>
      </div>

      {choosing && (
        <GenerateScriptsModal
          cards={cards}
          onClose={() => setChoosing(false)}
          onGenerate={(targets) => {
            setChoosing(false)
            runGeneration(targets)
          }}
        />
      )}

      {voiceStep && (
        <CloneVoiceModal
          deck={{ presentationId, title, cards, theme, textStyle }}
          initialStep={voiceStep}
          onClose={() => setVoiceStep(null)}
        />
      )}
    </div>
  )
}

/** The editing box for one stop: a status chip (and an optional action) above, the textarea, a line below. */
function ScriptBox({
  chip,
  action,
  value,
  label,
  placeholder,
  disabled,
  onChange,
  footer,
}: {
  chip?: ReactNode
  action?: ReactNode
  value: string
  label: string
  placeholder: string
  disabled: boolean
  onChange: (value: string) => void
  footer: ReactNode
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 px-3 pt-2.5 pb-2">
      {(chip || action) && (
        <div className="flex min-h-5 items-center justify-between gap-2">
          {chip}
          {action}
        </div>
      )}
      <textarea
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        placeholder={placeholder}
        className="scrollbar-subtle min-h-24 flex-1 resize-none rounded-app border border-app-border bg-app-background p-3 text-sm leading-relaxed text-app-foreground outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-app-muted hover:border-app-muted/60 focus:border-app-accent focus:ring-3 focus:ring-app-accent/20 disabled:opacity-60"
      />
      {footer}
    </div>
  )
}

/**
 * Every stop on one line: Intro, a tick per slide, Outro. A filled tick has a script; the orange one is
 * where you are. The ticks are a pointer shortcut (a deck can have two dozen, too many to tab through);
 * the arrows and "Next empty" are the keyboard's way along, and Intro and Outro are real buttons.
 */
function ScriptMap({
  texts,
  spot,
  introFilled,
  outroFilled,
  canGoToSlides,
  onGo,
}: {
  texts: string[]
  spot: ScriptSpot | null
  introFilled: boolean
  outroFilled: boolean
  canGoToSlides: boolean
  onGo: (spot: ScriptSpot) => void
}) {
  return (
    <div className="mt-2 flex items-center gap-1.5">
      <MapEnd label="Intro" filled={introFilled} current={spot?.kind === 'intro'} onClick={() => onGo(INTRO)} />
      <div className="flex h-5 min-w-0 flex-1 items-center gap-[2px]" role="group" aria-label="Slides">
        {texts.length === 0 && <span className="h-px flex-1 bg-app-border" aria-hidden="true" />}
        {texts.map((t, i) => {
          const current = spot?.kind === 'slide' && spot.index === i
          const filled = t.trim() !== ''
          const name = `Slide ${i + 1}, ${filled ? 'scripted' : 'no script'}`
          return (
            <button
              key={i}
              type="button"
              tabIndex={-1}
              aria-label={name}
              aria-current={current ? 'step' : undefined}
              title={name}
              disabled={!canGoToSlides}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onGo({ kind: 'slide', index: i })}
              className="group flex h-full max-w-6 min-w-0 flex-1 cursor-pointer items-center disabled:cursor-default"
            >
              <span
                className={`block w-full rounded-full transition-[height,background-color] duration-150 ${
                  current
                    ? 'h-3 bg-app-accent'
                    : filled
                      ? 'h-1.5 bg-app-foreground/80 group-hover:h-2.5 group-hover:bg-app-foreground'
                      : 'h-1.5 bg-app-border group-hover:h-2.5 group-hover:bg-app-muted'
                }`}
              />
            </button>
          )
        })}
      </div>
      <MapEnd label="Outro" filled={outroFilled} current={spot?.kind === 'outro'} onClick={() => onGo(OUTRO)} />
    </div>
  )
}

function MapEnd({ label, filled, current, onClick }: { label: string; filled: boolean; current: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-current={current ? 'step' : undefined}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={`${label}${filled ? '' : ' (empty: no clip)'}`}
      className={`flex h-5 shrink-0 cursor-pointer items-center gap-1 rounded-[4px] px-1.5 text-[10px] font-bold uppercase tracking-[0.08em] transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-app-accent ${
        current ? 'bg-app-foreground text-app-background' : 'text-app-muted hover:bg-app-surface hover:text-app-foreground'
      }`}
    >
      <span
        aria-hidden="true"
        className={`size-1.5 rounded-full ${current ? 'bg-app-accent-on-foreground' : filled ? 'bg-app-foreground/80' : 'border border-app-muted'}`}
      />
      {label}
    </button>
  )
}

function StepArrow({ dir, disabled, onClick }: { dir: 'prev' | 'next'; disabled: boolean; onClick: () => void }) {
  const label = dir === 'prev' ? 'Previous script' : 'Next script'
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-app-sm border-[1.5px] border-app-foreground text-app-foreground transition-colors hover:bg-app-surface focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-app-accent disabled:cursor-not-allowed disabled:border-app-border disabled:text-app-muted disabled:hover:bg-transparent"
    >
      <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={dir === 'prev' ? 'M10 3.5 5.5 8l4.5 4.5' : 'M6 3.5 10.5 8 6 12.5'} />
      </svg>
    </button>
  )
}

/** A button in the panel's own style. Refuses focus on mousedown, like every button in the panel. */
function PanelButton({
  label,
  title,
  disabled = false,
  quiet = false,
  onClick,
  children,
}: {
  label: string
  title?: string
  disabled?: boolean
  quiet?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={title}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-app-sm px-2.5 text-[11px] font-semibold text-app-foreground transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-app-accent disabled:cursor-not-allowed disabled:opacity-40 ${
        quiet ? 'hover:bg-app-foreground/[0.06]' : 'bg-app-foreground/[0.06] hover:bg-app-foreground/10'
      }`}
    >
      {children}
    </button>
  )
}

function SparkleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M6.5 1.5 7.6 5a2 2 0 0 0 1.4 1.4l3.5 1.1-3.5 1.1A2 2 0 0 0 7.6 10L6.5 13.5 5.4 10a2 2 0 0 0-1.4-1.4L.5 7.5 4 6.4A2 2 0 0 0 5.4 5l1.1-3.5Z" />
      <path d="M12.5 1 13 2.5a1 1 0 0 0 .5.5l1.5.5-1.5.5a1 1 0 0 0-.5.5L12.5 6 12 4.5a1 1 0 0 0-.5-.5L10 3.5l1.5-.5a1 1 0 0 0 .5-.5L12.5 1Z" />
    </svg>
  )
}

function MicIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
      <rect x="5.5" y="1.5" width="5" height="8" rx="2.5" />
      <path d="M3 7.5a5 5 0 0 0 10 0M8 12.5V15" />
    </svg>
  )
}
