import { useEffect, useState, type CSSProperties } from 'react'
import { useJobsStore, type Job } from '@/jobs/jobsStore'

/** "Quiz generated" shows this long, the last 600 ms of it fading. */
const DONE_MS = 3000

export function QuizJobStripView({ job, onCancel, onRetry, onDismiss, onView }: { job: Job; onCancel(): void; onRetry(): void; onDismiss(): void; onView(): void }) {
  const [confirming, setConfirming] = useState(false)
  if (job.status === 'done') {
    return (
      <div className="job-fade-out flex shrink-0 items-center gap-2 text-xs text-app-foreground" style={{ '--job-fade-delay': `${DONE_MS - 600}ms` } as CSSProperties}>
        <span className="font-medium">Quiz generated</span>
        <button type="button" onClick={onView} className="rounded-app bg-app-accent px-2 py-0.5 font-medium text-app-accent-foreground hover:opacity-90">View</button>
      </div>
    )
  }
  if (job.status === 'failed') {
    return (
      <div className="flex shrink-0 items-center gap-2 text-xs">
        <span className="font-medium text-red-600 dark:text-red-400">Quiz failed</span>
        {job.error && <span className="max-w-48 truncate text-app-muted" title={job.error}>{job.error}</span>}
        <button type="button" onClick={onRetry} className="text-app-accent-text hover:underline">Try again</button>
        <button type="button" aria-label="Dismiss" onClick={onDismiss} className="text-app-muted hover:text-app-foreground">×</button>
      </div>
    )
  }
  const pct = Math.round(job.progress * 100)
  return (
    <div className="flex shrink-0 items-center gap-2 text-xs text-app-muted">
      <span>Generating quiz</span>
      <div role="progressbar" aria-label="Generating quiz" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="h-1 w-24 overflow-hidden rounded-full bg-app-muted/20">
        <div className="h-full bg-app-accent transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>
      {confirming && job.cancellable ? (
        <>
          <span>Stop generating?</span>
          <button type="button" onClick={onCancel} className="rounded-app px-1.5 py-0.5 font-medium text-red-600 hover:bg-red-500/10 dark:text-red-400">Stop</button>
          <button type="button" onClick={() => setConfirming(false)} className="rounded-app px-1.5 py-0.5 text-app-foreground hover:bg-app-muted/10">Keep going</button>
        </>
      ) : (
        <button type="button" aria-label="Cancel quiz" disabled={!job.cancellable} onClick={() => setConfirming(true)} className="hover:text-app-foreground disabled:opacity-40">×</button>
      )}
    </div>
  )
}

/** The editor's quiz progress, for the deck that is open only. */
export function QuizJobStrip({ deckId, onView }: { deckId: string; onView(): void }) {
  const job = useJobsStore((s) => s.jobs.quiz)
  const doneId = job?.status === 'done' && job.deckId === deckId ? job.id : null
  useEffect(() => {
    if (!doneId) return
    const t = setTimeout(() => {
      if (useJobsStore.getState().jobs.quiz?.id === doneId) useJobsStore.getState().dismiss('quiz')
    }, DONE_MS)
    return () => clearTimeout(t)
  }, [doneId])
  if (!job || job.deckId !== deckId) return null
  const { cancel, retry, dismiss } = useJobsStore.getState()
  return (
    <QuizJobStripView
      job={job}
      onCancel={() => cancel('quiz')}
      onRetry={() => retry('quiz')}
      onDismiss={() => dismiss('quiz')}
      onView={() => {
        dismiss('quiz')
        onView()
      }}
    />
  )
}
