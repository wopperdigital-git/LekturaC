import type { ReactElement } from 'react'
import type { DeckView } from './deckFilters'

function GridIcon() {
  return (
    <svg
      className="size-4"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="2" width="5" height="5" rx="1.2" />
      <rect x="9" y="2" width="5" height="5" rx="1.2" />
      <rect x="2" y="9" width="5" height="5" rx="1.2" />
      <rect x="9" y="9" width="5" height="5" rx="1.2" />
    </svg>
  )
}

function ListIcon() {
  return (
    <svg
      className="size-4"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M2 4h1.5M6 4h8M2 8h1.5M6 8h8M2 12h1.5M6 12h8" />
    </svg>
  )
}

const VIEWS: { value: DeckView; label: string; icon: () => ReactElement }[] = [
  { value: 'grid', label: 'Grid', icon: GridIcon },
  { value: 'list', label: 'List', icon: ListIcon },
]

/** Segmented view switcher — the active tab lifts out of the track as a solid pill. */
export function ViewTabs({
  value,
  onChange,
}: {
  value: DeckView
  onChange: (value: DeckView) => void
}) {
  return (
    <div
      role="group"
      aria-label="Deck view"
      className="flex shrink-0 gap-1 rounded-app-sm bg-app-surface p-1"
    >
      {VIEWS.map((view) => {
        const isActive = view.value === value
        const Icon = view.icon
        return (
          <button
            key={view.value}
            type="button"
            onClick={() => onChange(view.value)}
            aria-pressed={isActive}
            className={`flex cursor-pointer items-center gap-2 rounded-[calc(var(--app-radius-sm)-2px)] px-3 py-1.5 text-sm transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent ${
              isActive
                ? 'bg-app-background font-medium text-app-foreground shadow-sm'
                : 'text-app-muted hover:text-app-foreground'
            }`}
          >
            <Icon />
            {view.label}
          </button>
        )
      })}
    </div>
  )
}
