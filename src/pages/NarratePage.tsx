import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { describeError, flushScheduledSaves, usePresentationStore } from '@/store/presentationStore'
import { ThemeProvider } from '@/components/theme/ThemeProvider'
import { SlideStage } from '@/components/theme/SlideStage'
import { SlideViewer } from '@/components/narrate/SlideViewer'
import { ScriptPanel } from '@/components/narrate/ScriptPanel'
import { Button } from '@/components/ui/Button'
import { FallbackProvider, PROVIDER_CHAIN } from '@/ai/fallbackProvider'
import { narrationSlides } from '@/ai/narrationPrompt'

export function NarratePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const store = usePresentationStore()
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (id) void store.loadDeck(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  /*
    A script is debounced 500ms after the last keystroke, so it is in memory
    immediately but not in the database until that timer fires. Two exits, both
    covered the same way EditorPage covers them:
    - client-side navigation (Back to editor, Escape) unmounts this component,
      which the cleanup below flushes; and
    - closing the tab or reloading unmounts nothing, which is what the
      `beforeunload` listener is for. It is best-effort only — the browser does
      not wait for it — but a narration script is hand-typed and can never be
      regenerated, so this page needs the guard more than most.
  */
  useEffect(() => {
    const flush = () => void flushScheduledSaves()
    window.addEventListener('beforeunload', flush)
    return () => {
      window.removeEventListener('beforeunload', flush)
      flush()
    }
  }, [])

  const sorted = [...store.cards].sort((a, b) => a.orderIndex - b.orderIndex)
  const count = sorted.length

  const goTo = useCallback(
    (next: number) => {
      setIndex((current) => (count > 0 ? Math.min(Math.max(next, 0), count - 1) : current))
    },
    [count],
  )

  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Cancelling has to stop the request, not just stop listening to it —
  // otherwise scripts the user walked away from land and overwrite the deck.
  useEffect(() => {
    return () => abortRef.current?.abort()
  }, [])

  async function handleGenerate() {
    if (PROVIDER_CHAIN.length === 0) {
      setError('No AI provider is configured. Add VITE_GROQ_API_KEY or VITE_GEMINI_API_KEY to your .env file.')
      return
    }

    const slides = narrationSlides(sorted)
    if (slides.every((s) => s.existingScript)) {
      // Every slide is hand-edited, so there is nothing this call could write —
      // and asking anyway is worse than a no-op: the model's correct answer is an
      // empty array, which the response schema rejects, so the user would pay two
      // round-trips to be told the response could not be parsed.
      setError('Every slide already has a script you wrote. Clear one to have it rewritten.')
      return
    }

    const controller = new AbortController()
    abortRef.current = controller
    setGenerating(true)
    setError(null)

    try {
      const provider = new FallbackProvider(PROVIDER_CHAIN)
      const response = await provider.generateNarration(store.title, slides, controller.signal)
      if (controller.signal.aborted) return
      store.applyGeneratedNarration(response.scripts)
    } catch (err) {
      // A cancel is a return to the panel, not a failure to report.
      if (controller.signal.aborted) return
      setError(describeError(err))
    } finally {
      if (abortRef.current === controller) abortRef.current = null
      setGenerating(false)
    }
  }

  // A narration script is typed by hand and can never be regenerated the way
  // a deck can, so a save that fails silently is the worst outcome on this
  // page: the text looks saved, and it is gone on reload with nothing said.
  // Reuse the same error channel generation failures already surface.
  const saveError = store.status === 'error' ? (store.errorMessage ?? 'Your changes could not be saved.') : null

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // The script textarea lives on the same page: without this, typing a
      // space or an arrow inside it would step the slide instead. BUTTON is
      // included too — "Generate all scripts" and the slide-list rows are
      // buttons, not inputs, and this handler's own preventDefault() on Space
      // would otherwise steal activation from whichever one is focused,
      // breaking keyboard operation of the page's main control.
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'BUTTON' ||
          target.isContentEditable)
      )
        return

      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault()
        goTo(index + 1)
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        goTo(index - 1)
      } else if (e.key === 'Escape') {
        void navigate(`/deck/${id}`)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [index, goTo, navigate, id])

  if (!id || store.status === 'loading') {
    return <div className="p-8 text-app-muted">Loading…</div>
  }

  const card = sorted[Math.min(index, Math.max(count - 1, 0))]

  return (
    <div className="flex h-screen flex-col bg-app-background">
      <div className="flex items-center justify-between border-b border-app-border px-4 py-3">
        <div className="flex items-center gap-3">
          <Link
            to={`/deck/${id}`}
            className="rounded-app-sm text-sm text-app-muted transition-colors hover:text-app-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent"
          >
            ← Back to editor
          </Link>
          <span className="text-base font-semibold text-app-foreground">{store.title}</span>
        </div>
        <span className="text-xs text-app-muted">Narration</span>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          {count === 0 ? (
            <div className="flex flex-1 items-center justify-center p-8 text-app-muted">
              This deck has no slides yet.
            </div>
          ) : (
            <>
              {/* The deck's theme is scoped to the slide alone — the script
                  panel beside it is app chrome and stays on `app-*` tokens. */}
              <ThemeProvider theme={store.theme}>
                {/* SlideStage hardcodes `overflow-hidden` and must not scroll —
                    the backdrop's orbits and stars are percentages, so letting
                    the stage grow to the content height stretches every circle
                    into an ellipse. The scroll container goes INSIDE it, which
                    is the same arrangement PresentPage uses. */}
                <SlideStage className="min-h-0 flex-1">
                  <div className="scrollbar-subtle h-full overflow-y-auto p-6 sm:p-10">
                    <div className="flex min-h-full items-center justify-center">
                      <SlideViewer card={card} isFirstCard={index === 0} />
                    </div>
                  </div>
                </SlideStage>
              </ThemeProvider>

              <div className="flex items-center justify-center gap-4 border-t border-app-border py-3">
                <Button variant="secondary" onClick={() => goTo(index - 1)} disabled={index === 0}>
                  ‹ Previous
                </Button>
                <span className="text-xs tabular-nums text-app-muted">
                  {index + 1} / {count}
                </span>
                <Button
                  variant="secondary"
                  onClick={() => goTo(index + 1)}
                  disabled={index >= count - 1}
                >
                  Next ›
                </Button>
              </div>
            </>
          )}
        </div>

        <aside className="w-96 shrink-0 border-l border-app-border bg-app-surface">
          <ScriptPanel
            cards={sorted}
            index={index}
            onSelect={goTo}
            onGenerate={() => void handleGenerate()}
            generating={generating}
            onCancel={() => abortRef.current?.abort()}
            // Save failure first: it describes work the user has already done
            // and cannot recover, so it must outrank a stale generation error
            // from a request the user has already moved on from — `error` is
            // only cleared when the NEXT generation starts, so without this a
            // failed generation followed by hand-typing and a failed save would
            // still show the old generation message while every keystroke since
            // silently failed to persist.
            error={saveError ?? error}
          />
        </aside>
      </div>
    </div>
  )
}
