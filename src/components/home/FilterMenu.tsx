import { useEffect, useId, useRef, useState } from 'react'
import {
  DEFAULT_FILTERS,
  SORT_OPTIONS,
  UPDATED_OPTIONS,
  activeFilterCount,
  type DeckFilters,
} from './deckFilters'

function CheckIcon() {
  return (
    <svg
      className="size-3.5"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 8.5l3.5 3.5L13 5" />
    </svg>
  )
}

function MenuOption({
  label,
  selected,
  onSelect,
}: {
  label: string
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={selected}
      onClick={onSelect}
      className={`flex w-full cursor-pointer items-center justify-between gap-3 rounded-app-sm px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-app-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent ${
        selected ? 'font-medium text-app-foreground' : 'text-app-muted'
      }`}
    >
      {label}
      {selected && (
        <span className="text-app-accent-text">
          <CheckIcon />
        </span>
      )}
    </button>
  )
}

/**
 * The toolbar's Filter control: a bordered pill that opens a small popover of
 * sort + recency options. Closes on outside click and Escape, and carries a dot
 * whenever the selection differs from the default.
 */
export function FilterMenu({
  filters,
  onChange,
}: {
  filters: DeckFilters
  onChange: (filters: DeckFilters) => void
}) {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const activeCount = activeFilterCount(filters)

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? menuId : undefined}
        className="flex cursor-pointer items-center gap-2 rounded-app-sm border border-app-border bg-app-background px-3 py-2 text-sm text-app-foreground transition-colors duration-150 hover:bg-app-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent"
      >
        <svg
          className="size-4 text-app-muted"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M2.5 4.5h11M4.5 8h7M6.5 11.5h3" />
        </svg>
        Filter
        {activeCount > 0 && (
          <span
            aria-label={`${activeCount} active`}
            className="size-1.5 rounded-full bg-app-accent"
          />
        )}
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 z-20 mt-2 w-56 rounded-app border border-app-border bg-app-background p-2 shadow-app"
        >
          <div className="px-2.5 pt-1 pb-1.5 text-[11px] font-medium tracking-[0.1em] text-app-muted uppercase">
            Sort by
          </div>
          {SORT_OPTIONS.map((option) => (
            <MenuOption
              key={option.value}
              label={option.label}
              selected={filters.sort === option.value}
              onSelect={() => onChange({ ...filters, sort: option.value })}
            />
          ))}

          <div className="my-2 border-t border-app-border" />

          <div className="px-2.5 pb-1.5 text-[11px] font-medium tracking-[0.1em] text-app-muted uppercase">
            Updated
          </div>
          {UPDATED_OPTIONS.map((option) => (
            <MenuOption
              key={option.value}
              label={option.label}
              selected={filters.updatedWithin === option.value}
              onSelect={() => onChange({ ...filters, updatedWithin: option.value })}
            />
          ))}

          {activeCount > 0 && (
            <>
              <div className="my-2 border-t border-app-border" />
              <button
                type="button"
                onClick={() => onChange(DEFAULT_FILTERS)}
                className="w-full cursor-pointer rounded-app-sm px-2.5 py-1.5 text-left text-sm text-app-muted transition-colors hover:bg-app-surface hover:text-app-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent"
              >
                Reset filters
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
