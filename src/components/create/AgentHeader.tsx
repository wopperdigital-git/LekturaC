import { SparkIcon } from './icons'

/**
 * Identity + progress strip for the brief.
 *
 * Deliberately rendered *outside* the conversation's `role="log"` region: the
 * step counter changes on every answer, and inside a live region that would be
 * re-announced after each question instead of just the new question itself.
 */
export function AgentHeader({
  completed,
  total,
  showProgress = true,
}: {
  completed: number
  total: number
  showProgress?: boolean
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-app-border px-5 py-4 sm:px-6">
      <div className="flex items-center gap-3">
        <span
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-app-accent/12 text-app-accent-text"
          aria-hidden="true"
        >
          <SparkIcon />
        </span>
        <div className="min-w-0">
          <h1 className="text-sm font-semibold text-app-foreground">Presentation Agent</h1>
          <p className="mt-0.5 text-xs text-app-muted">
            Let&rsquo;s build a presentation tailored to your needs.
          </p>
        </div>
      </div>

      {showProgress && (
        <div className="flex items-center gap-2.5">
          <span className="flex items-center gap-1" aria-hidden="true">
            {Array.from({ length: total }, (_, i) => (
              <span
                key={i}
                className={`size-1.5 rounded-full transition-colors duration-200 ${
                  i < completed ? 'bg-app-accent' : 'bg-app-border'
                }`}
              />
            ))}
          </span>
          <span className="text-xs tabular-nums text-app-muted">
            {completed} of {total}
          </span>
        </div>
      )}
    </div>
  )
}
