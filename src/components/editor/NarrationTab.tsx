import { useEffect, useRef, useState } from 'react'
import { describeError, usePresentationStore } from '@/store/presentationStore'
import { FallbackProvider, PROVIDER_CHAIN } from '@/ai/fallbackProvider'
import { narrationSlides } from '@/ai/narrationPrompt'
import { isResettable, narrationStatus, sameSlides, type NarrationStatus } from '@/engine/narration'
import { formatDuration, speakingSeconds, wordCount } from '@/lib/speakingTime'
import { Button } from '@/components/ui/Button'
import { GenerateScriptsModal } from '@/components/narrate/GenerateScriptsModal'
import { ConfirmReplaceModal } from '@/components/narrate/ConfirmReplaceModal'
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
 * The Narration tab of the editor's right panel: one slide's spoken script, and the
 * two ways to generate. It writes for the slide the editor is on (`cardId`), so there
 * is no slide stepper here — the canvas beside it is the viewer.
 *
 * It owns everything the old narration page owned: the generation request and its
 * `AbortController`, the choose-slides dialog and the confirm-replace dialog. It
 * must stay mounted while the panel shows another tab (`ToolsPanel` keeps it
 * mounted, hidden), or switching tabs would abort a request the user only looked
 * away from.
 *
 * `cards` must already be sorted by `orderIndex`.
 */
export function NarrationTab({ cards, cardId }: { cards: Card[]; cardId: string | null }) {
  const title = usePresentationStore((s) => s.title)
  const status = usePresentationStore((s) => s.status)
  const errorMessage = usePresentationStore((s) => s.errorMessage)
  const setNarrationText = usePresentationStore((s) => s.setNarrationText)
  const resetNarration = usePresentationStore((s) => s.resetNarration)
  const applyGeneratedNarration = usePresentationStore((s) => s.applyGeneratedNarration)

  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [choosing, setChoosing] = useState(false)
  const [confirmingOne, setConfirmingOne] = useState(false)
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
    if (targets.size === 0) return
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
      <div className="border-b border-app-border px-3 py-2.5">
        {generating ? (
          <>
            <Button variant="secondary" onClick={() => abortRef.current?.abort()} className="w-full">
              Cancel
            </Button>
            <p className="mt-2 text-xs text-app-muted">Writing narration…</p>
          </>
        ) : (
          <div className="flex flex-col gap-2">
            <Button
              variant="secondary"
              // One slide is just a one-element target set — same path, same
              // guarantees. The confirm is the same one the dialog uses: a
              // narrower action must not be the one that destroys hand-written
              // words silently.
              onClick={() => {
                if (!card) return
                if (narrationStatus(card.narration) === 'edited') setConfirmingOne(true)
                else void runGeneration(new Set([index]))
              }}
              disabled={!card}
              className="w-full"
              title="Write a script for the selected slide"
            >
              Generate script for this slide only
            </Button>
            <Button
              variant="primary"
              onClick={() => setChoosing(true)}
              disabled={cards.length === 0}
              className="w-full"
              title="Choose which slides to write"
            >
              Generate scripts for all slides
            </Button>
          </div>
        )}
        {shownError && (
          <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">{shownError}</p>
        )}
      </div>

      {card ? (
        <div className="flex min-h-0 flex-1 flex-col px-3 py-2.5">
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
        <p className="px-3 py-4 text-xs text-app-muted">
          {cards.length === 0 ? 'This deck has no slides yet.' : 'Select a slide to write its script.'}
        </p>
      )}

      {confirmingOne && (
        <ConfirmReplaceModal
          slides={[index + 1]}
          onBack={() => setConfirmingOne(false)}
          onClose={() => setConfirmingOne(false)}
          onConfirm={() => {
            setConfirmingOne(false)
            void runGeneration(new Set([index]))
          }}
        />
      )}

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
    </div>
  )
}
