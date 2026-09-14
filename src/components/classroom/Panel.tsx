import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'

/** The dashboard's bordered working surface, with an optional toolbar strip. */
export function Panel({ toolbar, children }: { toolbar?: ReactNode; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-app border border-app-border bg-app-background shadow-md">
      {toolbar && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-app-border px-4 py-3 sm:px-5">
          {toolbar}
        </div>
      )}
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  )
}

/** A centred empty/zero-result/error message inside a panel. */
export function PanelMessage({ title, body, action }: { title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      <h2 className="text-lg font-semibold text-app-foreground">{title}</h2>
      {body && <p className="mt-2 max-w-sm text-sm text-app-muted">{body}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}

export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <PanelMessage
      title="Couldn't load this page"
      body={message}
      action={
        <Button variant="secondary" onClick={onRetry}>
          Retry
        </Button>
      }
    />
  )
}

/** Row-shaped placeholders, so the list does not jolt when data arrives. */
export function RowsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-2" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-app-sm border border-app-border px-4 py-3">
          <div className="dash-skeleton h-4 w-2/5 rounded-app-sm bg-app-surface" />
          <div className="dash-skeleton ml-auto h-3 w-16 rounded-app-sm bg-app-surface" />
          <div className="dash-skeleton h-3 w-16 rounded-app-sm bg-app-surface" />
        </div>
      ))}
    </div>
  )
}

/**
 * A class id that does not exist or is not visible to the caller. Deliberately
 * does not say which — "deleted" and "not yours" read the same from outside.
 */
export function ClassUnavailable({ backTo, backLabel }: { backTo: string; backLabel: string }) {
  const navigate = useNavigate()
  return (
    <Panel>
      <PanelMessage
        title="This class isn't available"
        body="It may have been deleted, or you may no longer have access to it."
        action={
          <Button variant="secondary" onClick={() => void navigate(backTo)}>
            {backLabel}
          </Button>
        }
      />
    </Panel>
  )
}
