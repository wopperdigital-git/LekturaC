import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { flushScheduledSaves, usePresentationStore } from '@/store/presentationStore'
import { ThemeProvider } from '@/components/theme/ThemeProvider'
import { SlideStage } from '@/components/theme/SlideStage'
import { SlideViewer } from '@/components/narrate/SlideViewer'
import { Button } from '@/components/ui/Button'

export function NarratePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const store = usePresentationStore()
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (id) void store.loadDeck(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // A script is debounced 500ms after the last keystroke; leaving the page
  // sooner than that would drop the last sentence typed.
  useEffect(() => {
    return () => {
      void flushScheduledSaves()
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

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // The script textarea lives on the same page: without this, typing a
      // space or an arrow inside it would step the slide instead.
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return

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
                    is the same arrangement EditorPage uses. */}
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

        <aside className="w-96 shrink-0 border-l border-app-border bg-app-surface p-4">
          <p className="text-sm text-app-muted">Script panel goes here.</p>
        </aside>
      </div>
    </div>
  )
}
