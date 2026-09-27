import { useEffect, useRef, useState, type ReactNode } from 'react'
import { describeError, usePresentationStore } from '@/store/presentationStore'
import { FallbackProvider, PROVIDER_CHAIN } from '@/ai/fallbackProvider'
import { narrationSlides } from '@/ai/narrationPrompt'
import {
  hasValidTargets,
  isResettable,
  narrationStatus,
  sameSlides,
  type NarrationStatus,
} from '@/engine/narration'
import { formatDuration, speakingSeconds, wordCount } from '@/lib/speakingTime'
import { Button } from '@/components/ui/Button'
import { GenerateScriptsModal } from '@/components/narrate/GenerateScriptsModal'
import { CloneVoiceModal } from '@/components/voice/CloneVoiceModal'
import { isCartesiaConfigured } from '@/voice/cartesia'
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

/** The slide ids in deck order, read fresh from the store (not from a render's closure). */
function currentSlideIds(): string[] {
  return [...usePresentationStore.getState().cards]
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((c) => c.id)
}

/**
 * The Narration tab of the editor's right panel: one slide's spoken script, an AI icon
 * that opens the slide picker, and a Clone voice button. It writes for the slide the
 * editor is on (`cardId`), so there is no slide stepper here — the canvas beside it is
 * the viewer.
 *
 * It owns everything the old narration page owned: the generation request and its
 * `AbortController`, and the choose-slides dialog (which asks before overwriting a
 * hand-edited script). It must stay mounted while the panel shows another tab
 * (`ToolsPanel` keeps it mounted, hidden), or switching tabs would abort a request the
 * user only looked away from.
 *
 * `cards` must already be sorted by `orderIndex`.
 */
export function NarrationTab({ cards, cardId }: { cards: Card[]; cardId: string | null }) {
  const presentationId = usePresentationStore((s) => s.presentationId)
  const theme = usePresentationStore((s) => s.theme)
  const textStyle = usePresentationStore((s) => s.textStyle)
  const title = usePresentationStore((s) => s.title)
  const status = usePresentationStore((s) => s.status)
  const errorMessage = usePresentationStore((s) => s.errorMessage)
  const setNarrationText = usePresentationStore((s) => s.setNarrationText)
  const resetNarration = usePresentationStore((s) => s.resetNarration)
  const applyGeneratedNarration = usePresentationStore((s) => s.applyGeneratedNarration)

  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [choosing, setChoosing] = useState(false)
  const [voiceOpen, setVoiceOpen] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  // Cancelling has to stop the request, not just stop listening to it —
  // otherwise scripts the user walked away from land and overwrite the deck.
  useEffect(() => {
    return () => abortRef.current?.abort()
  }, [])

  const index = cardId === null ? -1 : cards.findIndex((c) => c.id === cardId)
  const card = index >= 0 ? cards[index] : undefined
  const narration = card?.narration
  const text = narration?.text ?? ''
  const words = wordCount(text)
  const scriptStatus = narrationStatus(narration)
  const voiceReady = isCartesiaConfigured()

  /**
   * Runs one generation over an explicit set of 0-based slide positions.
   *
   * The set is the whole of the user's intent and travels all the way through:
   * `narrationSlides` marks everything outside it SKIP so the model still sees
   * the deck for continuity but is asked for nothing else, and
   * `applyGeneratedNarration` refuses to write outside it whatever comes back.
   * One slide or twenty is the same code path — the only difference is the size
   * of the set.
   *
   * The editor stays live while this runs, and the set is *positions*. If a slide
   * is added, deleted or moved before the reply lands, position N is no longer the
   * slide the model was asked about, so nothing is applied (see `sameSlides`).
   */
  async function runGeneration(targets: Set<number>) {
    // A position can go stale between the click and here (an undo behind an open dialog).
    if (!hasValidTargets(targets, cards.length)) return
    if (PROVIDER_CHAIN.length === 0) {
      setError(
        'No AI provider is configured. Add VITE_ANTHROPIC_API_KEY, VITE_GROQ_API_KEY, or VITE_GEMINI_API_KEY to your .env file.',
      )
      return
    }

    const controller = new AbortController()
    abortRef.current = controller
    const startIds = cards.map((c) => c.id)
    setGenerating(true)
    setError(null)

    try {
      const provider = new FallbackProvider(PROVIDER_CHAIN)
      const response = await provider.generateNarration(
        title,
        narrationSlides(cards, targets),
        controller.signal,
      )
      if (controller.signal.aborted) return
      if (!sameSlides(startIds, currentSlideIds())) {
        setError(
          'Slides were added, removed or reordered while the scripts were being written, so nothing was applied. Try again.',
        )
        return
      }
      applyGeneratedNarration(response.scripts, targets)
    } catch (err) {
      // A cancel is a return to the panel, not a failure to report.
      if (controller.signal.aborted) return
      setError(describeError(err))
    } finally {
      if (abortRef.current === controller) abortRef.current = null
      setGenerating(false)
    }
  }

  // A narration script is typed by hand and can never be regenerated the way a
  // deck can, so a save that fails silently is the worst outcome here: the text
  // looks saved, and it is gone on reload with nothing said. It is also how a
  // missing migration 0008 announces itself. Save failure first: it describes
  // work already done and unrecoverable, so it outranks a stale generation error
  // (`error` is only cleared when the NEXT generation starts).
  const saveError = status === 'error' ? (errorMessage ?? 'Your changes could not be saved.') : null
  const shownError = saveError ?? error

  return (
    <div className="flex h-full flex-col">
      {(generating || shownError) && (
        <div className="border-b border-app-border px-3 py-2.5">
          {generating && (
            <>
              <Button variant="secondary" onClick={() => abortRef.current?.abort()} className="w-full">
                Cancel
              </Button>
              <p className="mt-2 text-xs text-app-muted">Writing narration…</p>
            </>
          )}
          {shownError && (
            <p className={`text-xs font-medium text-red-600 dark:text-red-400 ${generating ? 'mt-2' : ''}`}>
              {shownError}
            </p>
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

      {/* The AI icon on the left and Clone voice on the right, under the script box. Neither
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
          label="Clone voice"
          title={voiceReady ? 'Set up a narration voice' : 'Add VITE_CARTESIA_API_KEY to enable voice cloning'}
          disabled={!voiceReady}
          onClick={() => setVoiceOpen(true)}
        >
          <MicIcon />
          Clone voice
        </FooterButton>
      </div>

      {choosing && (
        <GenerateScriptsModal
          cards={cards}
          onClose={() => setChoosing(false)}
          onGenerate={(targets) => {
            setChoosing(false)
            void runGeneration(targets)
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
