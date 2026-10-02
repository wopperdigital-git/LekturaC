// src/components/jobs/JobRow.tsx
import { useState, type CSSProperties } from 'react'
import type { Job } from '@/jobs/jobsStore'
import type { JobActions } from './JobTray'

const VIEW_LABEL = { deck: 'View Slide', quiz: 'View Quiz', video: 'View Video' } as const
const KIND_LABEL = { deck: 'Generating slides', quiz: 'Generating quiz', video: 'Generating video' } as const

function Check() {
  return (
    <svg viewBox="0 0 16 16" className="job-check size-4 shrink-0 text-emerald-500" aria-hidden>
      <path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Bar({ value, label }: { value: number; label: string }) {
  const pct = Math.round(value * 100)
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="h-1 w-full overflow-hidden rounded-full bg-app-muted/20">
      <div className="h-full rounded-full bg-app-accent transition-[width] duration-500" style={{ width: `${pct}%` }} />
    </div>
  )
}

export function JobRow({ job, actions, fadeAfterMs }: { job: Job; actions: JobActions; fadeAfterMs?: number }) {
  const [confirming, setConfirming] = useState(false)
  if (job.status === 'done') {
    return (
      <div
        className={`flex items-center gap-2 rounded-app border border-app-border bg-app-background p-2 shadow-app ${fadeAfterMs ? 'job-fade-out' : ''}`}
        style={fadeAfterMs ? ({ '--job-fade-delay': `${fadeAfterMs}ms` } as CSSProperties) : undefined}
      >
        <Check />
        <button
          type="button"
          onClick={() => actions.view(job)}
          className="job-rise-in flex-1 rounded-app bg-app-accent px-3 py-1.5 text-left text-sm font-medium text-app-accent-foreground hover:opacity-90"
        >
          {VIEW_LABEL[job.kind]}
          <span className="ml-1 font-normal opacity-80">· {job.title}</span>
        </button>
        <button type="button" aria-label={`Dismiss ${job.title}`} onClick={() => actions.dismiss(job.kind)} className="px-1 text-app-muted hover:text-app-foreground">
          ×
        </button>
      </div>
    )
  }

  const failed = job.status === 'failed'
  const drawing = job.kind === 'video' && job.timeline.some((e) => e.id === 'rendering' && e.state === 'active')
  return (
    <div className={`rounded-app border bg-app-background p-3 shadow-app ${failed ? 'border-red-400' : 'border-app-border'}`}>
      <div className="mb-2 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-xs text-app-muted">{failed ? 'Failed' : KIND_LABEL[job.kind]}</div>
          <div className="truncate text-sm font-medium text-app-foreground">{job.title}</div>
        </div>
        {failed ? (
          <button type="button" aria-label={`Dismiss ${job.title}`} onClick={() => actions.dismiss(job.kind)} className="px-1 text-app-muted hover:text-app-foreground">
            ×
          </button>
        ) : confirming && job.cancellable ? (
          <div className="flex items-center gap-1 text-xs">
            <span className="text-app-muted">Stop generating?</span>
            <button type="button" onClick={() => actions.cancel(job.kind)} className="rounded-app px-1.5 py-0.5 font-medium text-red-600 hover:bg-red-500/10 dark:text-red-400">
              Stop
            </button>
            <button type="button" onClick={() => setConfirming(false)} className="rounded-app px-1.5 py-0.5 text-app-foreground hover:bg-app-muted/10">
              Keep going
            </button>
          </div>
        ) : (
          <button
            type="button"
            aria-label={`Cancel ${job.title}`}
            disabled={!job.cancellable}
            title={job.cancellable ? 'Cancel' : 'Saving — this step cannot be cancelled'}
            onClick={() => setConfirming(true)}
            className="px-1 text-app-muted hover:text-app-foreground disabled:opacity-40"
          >
            ×
          </button>
        )}
      </div>
      {failed ? (
        <>
          <p className="mb-2 text-xs font-medium text-red-600 dark:text-red-400">{job.error}</p>
          <div className="flex gap-2">
            {job.editHref && (
              <button type="button" onClick={() => actions.editBrief(job)} className="rounded-app border border-app-border px-2 py-1 text-xs text-app-foreground hover:bg-app-muted/10">
                Edit brief
              </button>
            )}
            <button type="button" onClick={() => actions.retry(job.kind)} className="rounded-app bg-app-accent px-2 py-1 text-xs font-medium text-app-accent-foreground hover:opacity-90">
              Try again
            </button>
          </div>
        </>
      ) : (
        <>
          <Bar value={job.progress} label={`${KIND_LABEL[job.kind]}: ${job.title}`} />
          <ol className="mt-2 space-y-0.5 text-xs">
            {job.timeline.map((e) => (
              <li
                key={e.id}
                className={`flex items-center gap-1.5 ${e.state === 'active' ? 'font-medium text-app-foreground' : e.state === 'done' ? 'text-app-muted' : 'text-app-muted opacity-60'}`}
              >
                <span aria-hidden className="inline-flex w-3 justify-center">
                  {e.state === 'done' ? '✓' : e.state === 'active' ? <span className="size-2.5 animate-spin motion-reduce:animate-none rounded-full border border-current border-t-transparent" /> : '·'}
                </span>
                {e.label}
              </li>
            ))}
          </ol>
          {drawing && <p className="mt-2 text-xs text-app-muted">Keep this tab open while slides are drawn.</p>}
        </>
      )}
    </div>
  )
}
