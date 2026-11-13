import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DashboardShell } from '@/components/home/DashboardShell'
import { DeckGridSkeleton } from '@/components/home/DeckCardSkeleton'
import { VideoCard } from '@/components/videos/VideoCard'
import { VideoPlayerModal } from '@/components/videos/VideoPlayerModal'
import { Button } from '@/components/ui/Button'
import { listVideoDecks, type DeckSummary } from '@/store/presentationStore'
import { filterVideos, videoLibrary, type VideoEntry } from '@/video/library'
import { useJobsStore } from '@/jobs/jobsStore'
import { clearNew } from '@/jobs/newItems'
import { riseList, useMotion } from '@/lib/motion'

/**
 * Every narrated video the user has made, one per deck (a deck's video is replaced each time it
 * is made), newest first. Before this page a video was only reachable by opening its deck and the
 * Narrated video dialog, so finding one meant remembering which deck it came from.
 *
 * It only reads: making and replacing a video stay in the deck's dialog, and a video is deleted
 * with its deck. Playing one signs its links then (`VideoPlayerModal`), not for every card.
 */
export function VideosPage() {
  const navigate = useNavigate()
  const [entries, setEntries] = useState<VideoEntry<DeckSummary>[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [query, setQuery] = useState('')
  const [playing, setPlaying] = useState<VideoEntry<DeckSummary> | null>(null)

  // Only the newest read may land: an older, slower one must not overwrite it.
  const readRef = useRef(0)
  // Nothing is set before the read returns, so a list already on screen stays while a finished
  // video's re-read runs (Try again clears the error itself, see `retry`).
  const refresh = useCallback(async () => {
    const read = ++readRef.current
    try {
      const decks = await listVideoDecks()
      if (read !== readRef.current) return
      setFailed(false)
      setEntries(videoLibrary(decks))
    } catch (err) {
      if (read !== readRef.current) return
      console.warn('[videos] could not list videos:', err)
      setFailed(true)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // A video that finishes while the page is open joins the list. One already finished when the
  // page opened is in the first read, so it does not trigger a second one.
  const finishedVideoDeck = useJobsStore((s) => (s.jobs.video?.status === 'done' ? s.jobs.video.resultDeckId : null))
  const seenFinishedRef = useRef(finishedVideoDeck)
  useEffect(() => {
    if (!finishedVideoDeck || finishedVideoDeck === seenFinishedRef.current) return
    seenFinishedRef.current = finishedVideoDeck
    void refresh()
  }, [finishedVideoDeck, refresh])

  function retry() {
    setFailed(false)
    setEntries(null)
    void refresh()
  }

  const loading = entries === null && !failed
  const visible = useMemo(() => filterVideos(entries ?? [], query), [entries, query])
  const count = entries?.length ?? 0

  const listRef = useMotion<HTMLDivElement>(
    ({ reduce, root }) => {
      riseList(root.querySelectorAll('[data-motion=videos] > *'), reduce)
    },
    [loading],
  )

  function play(entry: VideoEntry<DeckSummary>) {
    clearNew(entry.deck.id, 'video')
    setPlaying(entry)
  }

  return (
    <DashboardShell
      title="Videos"
      subtitle={
        loading
          ? 'Loading your videos…'
          : count > 0
            ? `${count} narrated ${count === 1 ? 'video' : 'videos'} · One per deck, replaced when you make it again`
            : 'Narrated videos of your decks, read aloud in the voice you chose'
      }
      query={query}
      onQueryChange={setQuery}
    >
      <div ref={listRef}>
        {failed ? (
          <div role="alert" className="flex flex-col items-center rounded-app border border-app-border bg-app-background px-6 py-16 text-center">
            <h2 className="text-lg font-semibold text-app-foreground">Your videos could not be loaded</h2>
            <p className="mt-2 max-w-sm text-sm text-app-muted">Check your connection, then try again.</p>
            <Button variant="secondary" onClick={retry} className="mt-6">
              Try again
            </Button>
          </div>
        ) : loading ? (
          <DeckGridSkeleton view="grid" />
        ) : count === 0 ? (
          <div className="flex flex-col items-center rounded-app border border-app-border bg-app-background px-6 py-16 text-center">
            <h2 className="text-lg font-semibold text-app-foreground">No videos yet</h2>
            <ol className="mt-3 max-w-md list-decimal space-y-1 pl-5 text-left text-sm text-app-muted">
              <li>Open a deck.</li>
              <li>
                Choose <span className="font-semibold text-app-foreground">Create &amp; export → Narrated video</span>.
              </li>
              <li>Pick a voice and press Generate video. It shows up here when it is done.</li>
            </ol>
            <Button variant="primary" onClick={() => void navigate('/')} className="mt-6">
              Go to your presentations
            </Button>
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center rounded-app border border-app-border bg-app-background px-6 py-16 text-center">
            <h2 className="text-lg font-semibold text-app-foreground">No videos match “{query.trim()}”</h2>
            <Button variant="secondary" onClick={() => setQuery('')} className="mt-5">
              Clear search
            </Button>
          </div>
        ) : (
          <div data-motion="videos" className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((entry) => (
              <VideoCard
                key={entry.deck.id}
                deck={entry.deck}
                record={entry.record}
                onPlay={() => play(entry)}
                onOpenDeck={() => void navigate(`/deck/${entry.deck.id}`)}
              />
            ))}
          </div>
        )}
      </div>

      {playing && (
        <VideoPlayerModal
          title={playing.deck.title}
          record={playing.record}
          onOpenDeck={() => void navigate(`/deck/${playing.deck.id}`)}
          onClose={() => setPlaying(null)}
        />
      )}
    </DashboardShell>
  )
}
