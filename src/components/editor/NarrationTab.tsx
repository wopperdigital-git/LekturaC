import { useEffect, useState, type ReactNode } from 'react'
import { usePresentationStore } from '@/store/presentationStore'
import { PROVIDER_CHAIN } from '@/ai/fallbackProvider'
import { hasValidTargets, isResettable, narrationStatus, type NarrationStatus } from '@/engine/narration'
import { startNarrationJob } from '@/jobs/start'
import { useJobsStore } from '@/jobs/jobsStore'
import { formatDuration, speakingSeconds, wordCount } from '@/lib/speakingTime'
import { Button } from '@/components/ui/Button'
import { GenerateScriptsModal } from '@/components/narrate/GenerateScriptsModal'
import { CloneVoiceModal } from '@/components/voice/CloneVoiceModal'
import { isCartesiaConfigured } from '@/voice/cartesia'
import { AI_NOT_SET_UP, VOICE_NOT_SET_UP, warnMissingKey } from '@/lib/setupCopy'
import type { Card } from '@/engine/contentBlocks'

const STATUS_LABEL: Record<NarrationStatus, string> = {
  empty: 'No script yet',
  generated: 'Generated',
  edited: 'Edited by you',
}

const STATUS_CLASS: Record<NarrationStatus, string> = {
  empty: 'text-app-muted',
  generated: 'text-app-accent-text',
  edited: 'text-app-highlight-text',
}

/**
 * The Narration tab of the editor's right panel: one slide's spoken script, an AI icon
 * that opens the slide picker, and a Voice & video button. It writes for the slide the
 * editor is on (`cardId`), so there is no slide stepper here — the canvas beside it is
 * the viewer.
 *
 * Writing scripts is a background job (`jobs/narrationJob.ts`), so leaving the editor or
 * switching tabs never cancels it; this tab starts it, shows it while it runs on this deck
 * (the corner panel leaves it to the tab here) with Cancel, and shows a failure with Try
 * again. It still owns the choose-slides dialog, which asks before overwriting a
 * hand-edited script.
 *
 * `cards` must already be sorted by `orderIndex`.
 */
export function NarrationTab({
  cards,
  cardId,
  openVoice,
  onVoiceOpened,
}: {
  cards: Card[]
  cardId: string | null
  /** True when the page asks for the video dialog (the Create & export menu, or the corner panel's "View Video"). */
  openVoice?: boolean
  onVoiceOpened?: () => void
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

  const [error, setError] = useState<string | null>(null)
  const [choosing, setChoosing] = useState(false)
  const [voiceOpen, setVoiceOpen] = useState(false)

  // Finished scripts are already in the boxes; the job has nothing more to say here.
  useEffect(() => {
    if (job?.status === 'done') useJobsStore.getState().dismiss('narration')
  }, [job?.status])

  useEffect(() => {
    if (!openVoice) return
    setVoiceOpen(true)
    onVoiceOpened?.()
  }, [openVoice, onVoiceOpened])

  const index = cardId === null ? -1 : cards.findIndex((c) => c.id === cardId)
  const card = index >= 0 ? cards[index] : undefined
  const narration = card?.narration
  const text = narration?.text ?? ''
  const words = wordCount(text)
  const scriptStatus = narrationStatus(narration)
  const voiceReady = isCartesiaConfigured()

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
      {(generating || shownError) && (
        <div className="border-b border-app-border px-3 py-2.5">
          {generating && (
            <>
              <Button
                variant="secondary"
                onClick={() => useJobsStore.getState().cancel('narration')}
                disabled={!job?.cancellable}
                className="w-full"
              >
                Cancel
              </Button>
              <p className="mt-2 text-xs text-app-muted">
                Writing narration… You can leave the editor; it keeps going.
              </p>
            </>
          )}
          {shownError && (
            <p className={`text-xs font-medium text-red-600 dark:text-red-400 ${generating ? 'mt-2' : ''}`}>
              {shownError}
            </p>
          )}
          {jobError && !saveError && (
            <div className="mt-2 flex gap-2">
              <Button variant="secondary" className="px-2.5 py-1 text-xs" onClick={() => useJobsStore.getState().retry('narration')}>
                Try again
              </Button>
              <Button variant="ghost" className="px-2.5 py-1 text-xs" onClick={() => useJobsStore.getState().dismiss('narration')}>
                Dismiss
              </Button>
            </div>
          )}
        </div>
      )}

      {card ? (
        <div className="flex min-h-0 flex-1 flex-col px-3 pt-2.5">
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <h2 className="text-[11px] font-semibold text-app-foreground">Slide {index + 1} script</h2>
            {isResettable(narration) && (
              <button
                type="button"
                onClick={() => resetNarration(card.id)}
                className="rounded-app-sm text-[11px] text-app-muted underline transition-colors hover:text-app-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent"
                title="Put the AI's version back"
              >
                Reset to generated
              </button>
            )}
          </div>

          <p className={`mb-2 text-[11px] ${STATUS_CLASS[scriptStatus]}`}>{STATUS_LABEL[scriptStatus]}</p>

          <textarea
            value={text}
            onChange={(e) => setNarrationText(card.id, e.target.value)}
            aria-label={`Script for slide ${index + 1}`}
            placeholder="What the narrator says while this slide is on screen."
            className="scrollbar-subtle min-h-0 flex-1 resize-none rounded-app border border-app-border bg-app-background p-3 text-sm leading-relaxed text-app-foreground outline-none focus:border-app-accent"
          />

          <p className="mt-2 text-[11px] text-app-muted">
            {words} {words === 1 ? 'word' : 'words'} · ~{formatDuration(speakingSeconds(text))}
          </p>
        </div>
      ) : (
        <p className="min-h-0 flex-1 px-3 py-4 text-xs text-app-muted">
          {cards.length === 0 ? 'This deck has no slides yet.' : 'Select a slide to write its script.'}
        </p>
      )}

      {/* The AI icon on the left and Voice & video on the right, under the script box. Neither
          depends on the selected slide: the icon opens a picker over the whole deck, and the
          voice belongs to the user. */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-app-border px-3 py-2">
        <FooterButton
          label="Generate scripts with AI"
          title="Write scripts with AI"
          disabled={generating || cards.length === 0}
          onClick={() => setChoosing(true)}
          icon
        >
          <SparkleIcon />
        </FooterButton>
        <FooterButton
          label="Voice & video"
          title={voiceReady ? 'Pick a voice and make a narrated video of the deck' : VOICE_NOT_SET_UP}
          disabled={!voiceReady}
          onClick={() => setVoiceOpen(true)}
        >
          <MicIcon />
          Voice &amp; video
        </FooterButton>
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

      {voiceOpen && (
        <CloneVoiceModal
          deck={{ presentationId, title, cards, theme, textStyle }}
          onClose={() => setVoiceOpen(false)}
        />
      )}
    </div>
  )
}

/** A footer button in the panel's own style. Refuses focus on mousedown, like every button in the panel. */
function FooterButton({
  label,
  title,
  disabled,
  onClick,
  icon = false,
  children,
}: {
  label: string
  title: string
  disabled: boolean
  onClick: () => void
  icon?: boolean
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
      className={`flex h-7 cursor-pointer items-center justify-center gap-1.5 rounded-[5px] bg-app-foreground/[0.06] text-[11px] font-semibold text-app-foreground transition-colors hover:bg-app-foreground/10 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-app-accent disabled:cursor-not-allowed disabled:opacity-40 ${
        icon ? 'size-7' : 'px-2.5'
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
