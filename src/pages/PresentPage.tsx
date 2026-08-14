import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { usePresentationStore } from '@/store/presentationStore'
import { ThemeProvider } from '@/components/theme/ThemeProvider'
import { LayoutRenderer } from '@/components/layouts/LayoutRenderer'

export function PresentPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const store = usePresentationStore()
  const [index, setIndex] = useState(0)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (id) void store.loadDeck(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const sorted = [...store.cards].sort((a, b) => a.orderIndex - b.orderIndex)
  const count = sorted.length

  const goTo = useCallback((next: number) => {
    setIndex((current) => {
      const clamped = Math.min(Math.max(next, 0), count - 1)
      return count > 0 ? clamped : current
    })
  }, [count])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault()
        goTo(index + 1)
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        goTo(index - 1)
      } else if (e.key === 'Escape' && !document.fullscreenElement) {
        void navigate(`/deck/${id}`)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [index, goTo, navigate, id])

  // Not JS-measured: the track's width/offset are plain CSS percentages, so
  // they stay correct across the viewport resize that fullscreen triggers
  // without any recomputation.
  useEffect(() => {
    function handleFullscreenChange() {
      setIsFullscreen(document.fullscreenElement === containerRef.current)
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  useEffect(() => {
    return () => {
      if (document.fullscreenElement) void document.exitFullscreen()
    }
  }, [])

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {})
    } else {
      containerRef.current?.requestFullscreen().catch(() => {})
    }
  }

  if (!id || store.status === 'loading') {
    return <div className="p-8 text-app-muted">Loading…</div>
  }

  if (count === 0) {
    return <div className="p-8 text-app-muted">No slides to present.</div>
  }

  return (
    <ThemeProvider theme={store.theme}>
      <div ref={containerRef} className="relative h-screen w-screen overflow-hidden bg-slide-canvas">
        <div
          className="flex h-full transition-transform duration-300 ease-in-out"
          style={{ width: `${count * 100}%`, transform: `translateX(-${(index * 100) / count}%)` }}
        >
          {sorted.map((card, i) => (
            <div
              key={card.id}
              className="flex h-full shrink-0 items-center justify-center overflow-y-auto px-6 py-10 sm:px-10"
              style={{ width: `${100 / count}%` }}
            >
              <div className="w-full max-w-5xl rounded-slide bg-slide-background p-8 shadow-slide sm:p-10">
                <LayoutRenderer card={card} context={{ isFirstCard: i === 0 }} />
              </div>
            </div>
          ))}
        </div>

        {index > 0 && (
          <button
            onClick={() => goTo(index - 1)}
            aria-label="Previous slide"
            className="absolute left-4 top-1/2 flex h-10 w-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-black/60 text-2xl text-white hover:bg-black/80"
          >
            ‹
          </button>
        )}
        {index < count - 1 && (
          <button
            onClick={() => goTo(index + 1)}
            aria-label="Next slide"
            className="absolute right-4 top-1/2 flex h-10 w-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-black/60 text-2xl text-white hover:bg-black/80"
          >
            ›
          </button>
        )}

        <div className="absolute right-4 top-4 flex gap-2">
          <button
            onClick={() => navigate(`/deck/${id}`)}
            aria-label="Exit presentation"
            className="cursor-pointer rounded-full bg-black/60 px-3 py-1.5 text-xs text-white hover:bg-black/80"
          >
            Exit present
          </button>
          <button
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? 'Exit full screen' : 'Enter full screen'}
            className="cursor-pointer rounded-full bg-black/60 px-3 py-1.5 text-xs text-white hover:bg-black/80"
          >
            {isFullscreen ? 'Exit full screen' : 'Full screen'}
          </button>
        </div>

        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs text-white">
          {index + 1} / {count}
        </div>
      </div>
    </ThemeProvider>
  )
}
