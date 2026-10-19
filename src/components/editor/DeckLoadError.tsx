import { Link } from 'react-router-dom'
import type { LoadError } from '@/store/presentationStore'
import { Button } from '@/components/ui/Button'

/**
 * The whole page when a deck could not be opened, for the editor and the presenter alike.
 *
 * It replaces the canvas rather than sitting above it: with no deck loaded, an empty
 * canvas reads as "this deck has no slides" and its Add a slide button would write into
 * nothing. A missing deck offers no retry (asking again finds the same nothing); a failed
 * read does, with the reason underneath for anyone who needs to report it.
 */
export function DeckLoadError({ error, onRetry }: { error: LoadError; onRetry: () => void }) {
  const missing = error.kind === 'missing'
  return (
    <div className="flex min-h-screen items-center justify-center bg-app-canvas p-6">
      <div role="alert" className="w-full max-w-md rounded-app border border-app-border bg-app-background p-6 shadow-app">
        <h1 className="text-base font-semibold text-app-foreground">
          {missing ? "This presentation isn't available" : "Couldn't open this presentation"}
        </h1>
        <p className="mt-2 text-sm text-app-muted">
          {missing
            ? 'It may have been deleted, or it belongs to another account.'
            : 'Check your connection and try again.'}
        </p>
        {!missing && <p className="mt-3 text-xs break-words text-app-muted">Details: {error.message}</p>}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Link
            to="/"
            className="inline-flex items-center rounded-app-sm border border-app-border px-3 py-1.5 text-sm font-medium text-app-foreground transition-colors hover:bg-app-border/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent"
          >
            Back to dashboard
          </Link>
          {!missing && (
            <Button variant="primary" onClick={onRetry}>
              Try again
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
