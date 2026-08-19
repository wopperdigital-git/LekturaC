import { Button } from '@/components/ui/Button'

/**
 * Zero results with decks present — which can come from the search box, the
 * Filter menu, or both, so the copy and the reset button cover either case.
 */
export function NoDeckMatches({ query, onClear }: { query: string; onClear: () => void }) {
  return (
    // no card chrome of its own — it renders inside the dashboard panel
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <svg
        className="size-10 text-app-muted"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <circle cx="7.2" cy="7.2" r="4.6" />
        <path d="M10.6 10.6L14 14" />
      </svg>
      <h2 className="mt-4 font-medium text-app-foreground">No presentations found</h2>
      <p className="mt-1 max-w-sm text-sm text-app-muted">
        {query ? (
          <>
            Nothing matches <span className="text-app-foreground">"{query}"</span> with the current
            filters.
          </>
        ) : (
          'No presentations match the current filters.'
        )}
      </p>
      <Button variant="secondary" onClick={onClear} className="mt-5">
        Clear search and filters
      </Button>
    </div>
  )
}
