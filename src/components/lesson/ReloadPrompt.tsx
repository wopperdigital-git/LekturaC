import { Button } from '@/components/ui/Button'

/**
 * What a lesson shows when the server will not take the next answer and asking again would only
 * be refused again: the server's sentence, why, and a button that loads the lesson afresh.
 */
export function ReloadPrompt({
  notice,
  onReload,
  children,
}: {
  /** The server's refusal sentence, when there is one to show. */
  notice: string | null
  onReload: () => void
  children: string
}) {
  return (
    <div role="alert" className="mb-4 flex flex-col items-start gap-3 rounded-app-sm border border-app-border bg-app-surface p-3">
      <p className="text-sm text-app-foreground">
        {notice ? `${notice} ` : ''}
        {children}
      </p>
      <Button variant="primary" onClick={onReload}>
        Try again
      </Button>
    </div>
  )
}
