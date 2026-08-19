import type { DeckView } from './deckFilters'

export function DeckCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-app border border-app-border bg-app-background shadow-sm">
      <div className="dash-skeleton h-28 bg-app-surface" />
      <div className="flex flex-col gap-2 px-5 py-4">
        <div className="dash-skeleton h-4 w-3/5 rounded-app-sm bg-app-surface" />
        <div className="dash-skeleton h-3 w-2/5 rounded-app-sm bg-app-surface" />
      </div>
    </div>
  )
}

function DeckRowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-2 py-2">
      <div className="dash-skeleton size-10 shrink-0 rounded-app-sm bg-app-surface" />
      <div className="dash-skeleton h-4 w-2/5 rounded-app-sm bg-app-surface" />
      <div className="dash-skeleton ml-auto h-3 w-20 rounded-app-sm bg-app-surface" />
    </div>
  )
}

/** Placeholder list matching whichever view will render once the decks resolve. */
export function DeckGridSkeleton({ count = 6, view = 'grid' }: { count?: number; view?: DeckView }) {
  if (view === 'list') {
    return (
      <div className="flex flex-col gap-1">
        {Array.from({ length: count }, (_, i) => (
          <DeckRowSkeleton key={i} />
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: count }, (_, i) => (
        <DeckCardSkeleton key={i} />
      ))}
    </div>
  )
}
