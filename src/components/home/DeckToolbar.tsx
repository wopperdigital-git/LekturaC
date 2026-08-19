import { Button } from '@/components/ui/Button'
import { FilterMenu } from './FilterMenu'
import { ViewTabs } from './ViewTabs'
import type { DeckFilters, DeckView } from './deckFilters'

/**
 * The panel's header strip: view switcher on the left, Filter + primary action
 * on the right. Search lives in the sidebar, not here.
 */
export function DeckToolbar({
  view,
  onViewChange,
  filters,
  onFiltersChange,
  onCreate,
}: {
  view: DeckView
  onViewChange: (view: DeckView) => void
  filters: DeckFilters
  onFiltersChange: (filters: DeckFilters) => void
  onCreate: () => void
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-app-border px-4 py-3 sm:px-5">
      <ViewTabs value={view} onChange={onViewChange} />

      <div className="flex items-center gap-2">
        <FilterMenu filters={filters} onChange={onFiltersChange} />
        <Button
          variant="primary"
          onClick={onCreate}
          className="gap-1.5 hover:shadow-[0_0_24px_-4px_var(--app-highlight)]"
        >
          <svg
            className="size-4"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M8 3v10M3 8h10" />
          </svg>
          <span className="hidden sm:inline">New presentation</span>
          <span className="sm:hidden">New</span>
        </Button>
      </div>
    </div>
  )
}
