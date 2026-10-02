// src/components/jobs/JobTray.tsx
import { useEffect, useState } from 'react'
import { matchPath, useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { useJobsStore, type Job, type JobKind } from '@/jobs/jobsStore'
import { RIGHT_PANEL_WIDTH_PX } from '@/components/editor/panelSize'
import { JobRow } from './JobRow'

/*
  The bottom-right panel for background jobs, mounted once beside the routes so it survives
  every page change. On a deck's editor it shrinks to pills (expand on click), and a quiz for
  the deck that is open is left to the top bar's strip.
*/

export interface JobActions {
  cancel(kind: JobKind): void
  retry(kind: JobKind): void
  dismiss(kind: JobKind): void
  view(job: Job): void
  editBrief(job: Job): void
}

export function viewHref(job: Job): string {
  const id = job.resultDeckId ?? job.deckId ?? ''
  if (job.kind === 'quiz') return `/deck/${id}?quiz=list`
  if (job.kind === 'video') return `/deck/${id}?video=1`
  return `/deck/${id}`
}

/** How long a finished video's View button stays before it fades (the card's dot still marks it). */
const VIDEO_FADE_MS = 6000

/** Where the tray sits: the open deck's editor (pills, clear of the tools panel), a hidden deck sub-route (presenter), or anywhere else (full panel). */
export function trayRoute(pathname: string): { editorDeckId: string | null; hidden: boolean } {
  const editor = matchPath('/deck/:id', pathname)
  if (editor) return { editorDeckId: editor.params.id ?? null, hidden: false }
  return { editorDeckId: null, hidden: matchPath('/deck/:id/*', pathname) !== null }
}

export function JobTrayView({
  jobs,
  minimized,
  expanded,
  onToggle,
  actions,
  rightOffsetPx,
}: {
  jobs: Job[]
  minimized: boolean
  expanded: boolean
  onToggle(): void
  actions: JobActions
  /** Extra distance from the right edge (the editor's tools panel). */
  rightOffsetPx?: number
}) {
  if (jobs.length === 0) return null
  const compact = minimized && !expanded
  return (
    <div
      className="pointer-events-none fixed right-4 bottom-4 z-40 flex w-80 max-w-[calc(100vw-2rem)] flex-col items-end gap-2"
      style={rightOffsetPx ? { right: 16 + rightOffsetPx } : undefined}
      aria-live="polite"
    >
      {minimized && (
        <button type="button" onClick={onToggle} className="pointer-events-auto rounded-full border border-app-border bg-app-background px-2 py-0.5 text-xs text-app-muted shadow-app hover:text-app-foreground">
          {expanded ? 'Minimize' : 'Show details'}
        </button>
      )}
      {jobs.map((job) =>
        compact && job.status === 'running' ? (
          <button
            key={job.id}
            type="button"
            onClick={onToggle}
            className="pointer-events-auto flex max-w-full items-center gap-2 rounded-full border border-app-border bg-app-background px-3 py-1.5 text-xs text-app-foreground shadow-app"
          >
            <span className="truncate">{job.title}</span>
            <span className="h-1 w-16 shrink-0 overflow-hidden rounded-full bg-app-muted/20">
              <span className="block h-full bg-app-accent" style={{ width: `${Math.round(job.progress * 100)}%` }} />
            </span>
            <span className="tabular-nums text-app-muted">{Math.round(job.progress * 100)}%</span>
          </button>
        ) : (
          <div key={job.id} className="pointer-events-auto w-full">
            <JobRow job={job} actions={actions} fadeAfterMs={job.kind === 'video' && job.status === 'done' ? VIDEO_FADE_MS : undefined} />
          </div>
        ),
      )}
    </div>
  )
}

export function JobTray() {
  const user = useAuthStore((s) => s.user)
  const jobsByKind = useJobsStore((s) => s.jobs)
  const { cancel, retry, dismiss } = useJobsStore.getState()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [expanded, setExpanded] = useState(false)

  const { editorDeckId, hidden } = trayRoute(pathname)
  useEffect(() => setExpanded(false), [editorDeckId])
  const jobs = (['deck', 'quiz', 'video'] as const)
    .map((k) => jobsByKind[k])
    .filter((j): j is Job => j !== null)
    .filter((j) => !(j.kind === 'quiz' && editorDeckId !== null && j.deckId === editorDeckId))

  const doneVideoId = jobsByKind.video?.status === 'done' ? jobsByKind.video.id : null
  useEffect(() => {
    if (!doneVideoId) return
    const t = setTimeout(() => {
      if (useJobsStore.getState().jobs.video?.id === doneVideoId) useJobsStore.getState().dismiss('video')
    }, VIDEO_FADE_MS + 600)
    return () => clearTimeout(t)
  }, [doneVideoId])

  if (!user || hidden) return null
  const actions: JobActions = {
    cancel,
    retry,
    dismiss,
    view: (job) => {
      dismiss(job.kind)
      void navigate(viewHref(job))
    },
    editBrief: (job) => {
      dismiss(job.kind)
      if (job.editHref) void navigate(job.editHref)
    },
  }
  return <JobTrayView jobs={jobs} minimized={editorDeckId !== null} rightOffsetPx={editorDeckId !== null ? RIGHT_PANEL_WIDTH_PX + 24 : undefined} expanded={expanded} onToggle={() => setExpanded((e) => !e)} actions={actions} />
}
