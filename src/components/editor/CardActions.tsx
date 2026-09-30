import type { MouseEvent, PointerEvent, ReactNode } from 'react'
import { BinIcon } from './ElementActions'

/*
  Duplicate and delete for the selected slide, just above its top-right corner.

  Above the card rather than on it, so they never cover an element's own bin,
  which sits outside that element's top-right corner. Every press and click is
  stopped: the card's click handler would otherwise re-select the card, and the
  canvas's mousedown handler would clear the selection first.
*/
export function CardActions({ onDuplicate, onDelete }: { onDuplicate: () => void; onDelete: () => void }) {
  return (
    <div className="absolute -top-11 right-0 z-30 flex gap-1.5">
      <CardActionButton label="Duplicate slide" onClick={onDuplicate}>
        <DuplicateIcon />
      </CardActionButton>
      <CardActionButton label="Delete slide" onClick={onDelete} danger>
        <BinIcon />
      </CardActionButton>
    </div>
  )
}

function CardActionButton({
  label,
  onClick,
  danger,
  children,
}: {
  label: string
  onClick: () => void
  danger?: boolean
  children: ReactNode
}) {
  const hold = (event: PointerEvent | MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
  }
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onPointerDown={hold}
      onMouseDown={hold}
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
      className={`flex size-8 cursor-pointer items-center justify-center rounded-full border bg-app-background shadow-app transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent ${
        danger
          ? 'border-red-500/60 text-red-600 hover:bg-red-600 hover:text-white dark:text-red-400'
          : 'border-app-border text-app-foreground hover:border-app-accent hover:text-app-accent-text'
      }`}
    >
      {children}
    </button>
  )
}

function DuplicateIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="size-3.5"
    >
      <rect x="7" y="7" width="9.5" height="9.5" rx="1.5" />
      <path d="M13 4.5V4.2A1.2 1.2 0 0 0 11.8 3H4.2A1.2 1.2 0 0 0 3 4.2v7.6A1.2 1.2 0 0 0 4.2 13h.3" />
    </svg>
  )
}
