import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { supabase } from '@/lib/supabaseClient'
import { signVideo, supabasePorts, type VideoView } from '@/video/storage'
import type { VideoRecord } from '@/video/videoRecord'
import { videoLength } from '@/video/library'

const PRIMARY_LINK =
  'inline-flex items-center justify-center gap-2 rounded-app-sm border-[1.5px] border-app-accent bg-app-accent px-4 py-2 text-sm font-bold text-app-accent-foreground transition-[filter] duration-150 hover:brightness-105 active:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent'

/**
 * Plays one deck's video from the Videos page. The links are signed here, when it opens, not for
 * every card on the page: a signed link lasts an hour and most videos on the page are never played.
 * It starts playing because the person pressed Play; nothing plays on to another video.
 */
export function VideoPlayerModal({
  title,
  record,
  onOpenDeck,
  onClose,
}: {
  title: string
  record: VideoRecord
  onOpenDeck: () => void
  onClose: () => void
}) {
  const [view, setView] = useState<VideoView | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const client = supabase
    if (!client) return
    let cancelled = false
    void signVideo(supabasePorts(client), record, title || 'presentation').then((v) => {
      if (!cancelled) setView(v)
    })
    return () => {
      cancelled = true
    }
  }, [record, title, attempt])

  const failed = view !== null && view.url === null

  return (
    <Modal title={title || 'Untitled presentation'} onClose={onClose} maxWidth="max-w-4xl">
      <div className="overflow-hidden rounded-app-sm bg-black">
        {view?.url ? (
          <video controls autoPlay src={view.url} aria-label={`Video of ${title}`} className="aspect-video w-full bg-black" />
        ) : (
          <div className="grid aspect-video w-full place-items-center p-6 text-center text-sm text-white/80">
            {failed ? (
              <div className="flex flex-col items-center gap-3">
                <p>This video could not be loaded.</p>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setView(null)
                    setAttempt((n) => n + 1)
                  }}
                >
                  Try again
                </Button>
              </div>
            ) : (
              <span className="flex items-center gap-2">
                <Spinner /> Loading video…
              </span>
            )}
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-app-muted">
          <span className="font-semibold text-app-foreground tabular-nums">{videoLength(record.durationSeconds)}</span>
          {' · '}Made {new Date(record.generatedAt).toLocaleString()}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={onOpenDeck}>
            Open deck
          </Button>
          {view?.downloadUrl ? (
            <a href={view.downloadUrl} className={PRIMARY_LINK}>
              Download
            </a>
          ) : (
            <Button variant="primary" disabled>
              Download
            </Button>
          )}
        </div>
      </div>
    </Modal>
  )
}
