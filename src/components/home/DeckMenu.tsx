import { useEffect, useRef, useState } from 'react'

/**
 * The per-deck overflow menu, shared by the grid card and the list row.
 *
 * One component rather than two copies for the same reason `deckFilters.ts`
 * owns `selectDecks`: the two views must offer the same verbs, and a menu item
 * added to one and forgotten in the other is exactly the drift that causes.
 */
export function DeckMenu({
  deckTitle,
  onOpen,
  onPresent,
  onExport,
  onDelete,
  exporting,
  className = '',
  onDark = false,
}: {
  deckTitle: string
  onOpen: () => void
  onPresent: () => void
  onExport: () => void
  onDelete: () => void
  exporting: boolean
  className?: string
  /** True when the trigger sits on the card's coloured header rather than the panel surface. */
  onDark?: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Registered only while open, so the dashboard isn't holding one document
  // listener per deck for menus nobody opened.
  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
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

  const triggerTone = onDark
    ? 'bg-black/25 text-white backdrop-blur-sm hover:bg-black/40 focus-visible:outline-white'
    : 'text-app-muted hover:bg-app-surface hover:text-app-foreground focus-visible:outline-app-accent'

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={`Actions for "${deckTitle}"`}
        aria-expanded={open}
        title="Actions"
        className={`flex size-8 cursor-pointer items-center justify-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 ${triggerTone}`}
      >
        <svg className="size-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <circle cx="8" cy="3" r="1.4" />
          <circle cx="8" cy="8" r="1.4" />
          <circle cx="8" cy="13" r="1.4" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 min-w-48 rounded-app border border-app-border bg-app-background p-1 shadow-app"
        >
          <Item label="Open" onClick={() => { setOpen(false); onOpen() }} />
          <Item label="Present" onClick={() => { setOpen(false); onPresent() }} />
          <Item
            label={exporting ? 'Exporting…' : 'Export as PowerPoint'}
            disabled={exporting}
            // Stays open while it works: closing would take the only progress
            // indication off screen mid-export.
            onClick={onExport}
          />
          <Item label="Delete" danger onClick={() => { setOpen(false); onDelete() }} />
        </div>
      )}
    </div>
  )
}

function Item({
  label,
  onClick,
  danger,
  disabled,
}: {
  label: string
  onClick: () => void
  danger?: boolean
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className={`block w-full cursor-pointer rounded-app-sm px-2 py-1.5 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-app-accent disabled:cursor-not-allowed disabled:opacity-50 ${
        danger ? 'text-red-600 hover:bg-red-50 dark:hover:bg-red-950' : 'text-app-foreground hover:bg-app-surface'
      }`}
    >
      {label}
    </button>
  )
}
