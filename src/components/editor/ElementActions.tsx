import type { MouseEvent, PointerEvent, ReactNode } from 'react'
import type { Frame } from '@/engine/frame'

/*
  The two buttons that ride on the selected element: a bin at its corner, and —
  when it is a list — a plus where the next item would go.

  Drawn as siblings of the selection box in the same rotated frame, so they
  follow the element when it is rotated instead of drifting off it. Like the box,
  the wrapper is click-through and only the buttons take the pointer.

  Both stop the press *and* the click. The press would otherwise start a card
  selection, and the card's own click handler resets the selection to the card —
  which would clear the very element the button is acting on a moment before the
  action ran.
*/

const BUTTON_PX = 24
/** Gap between the element's box and the button, so it clears the resize handles. */
const GAP_PX = 8

export function ElementActions({
  frame,
  removeLabel,
  onRemove,
  onAddItem,
}: {
  frame: Frame
  removeLabel: string
  onRemove?: () => void
  /** Present only for a list that can take another item. */
  onAddItem?: () => void
}) {
  return (
    <div
      className="pointer-events-none absolute z-30"
      style={{
        left: frame.x,
        top: frame.y,
        width: frame.w,
        height: frame.h,
        transform: frame.rotation ? `rotate(${frame.rotation}deg)` : undefined,
        transformOrigin: 'center',
      }}
    >
      {onRemove && (
        // Outside the top-right corner: the corner handle sits on the corner
        // itself and the rotate handle at the top centre, so this clears both.
        <ActionButton
          label={removeLabel}
          onClick={onRemove}
          danger
          style={{ left: frame.w + GAP_PX, top: -BUTTON_PX - GAP_PX / 2 }}
        >
          <BinIcon />
        </ActionButton>
      )}

      {onAddItem && (
        // Directly under the list, at its left edge: where the next item would
        // be drawn once it exists.
        <ActionButton
          label="Add item"
          onClick={onAddItem}
          style={{ left: 0, top: frame.h + GAP_PX }}
        >
          <PlusIcon />
        </ActionButton>
      )}
    </div>
  )
}

function ActionButton({
  label,
  onClick,
  danger,
  style,
  children,
}: {
  label: string
  onClick: () => void
  danger?: boolean
  style: { left: number; top: number }
  children: ReactNode
}) {
  // Keeps focus where it is — inside a live run, the caret must survive the press.
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
      className={`pointer-events-auto absolute flex cursor-pointer items-center justify-center rounded-full border shadow-app transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent ${
        danger
          ? 'border-red-500/60 bg-app-background text-red-600 hover:bg-red-600 hover:text-white dark:text-red-400'
          : 'border-app-accent bg-app-accent text-white hover:brightness-110'
      }`}
      style={{ width: BUTTON_PX, height: BUTTON_PX, ...style }}
    >
      {children}
    </button>
  )
}

const stroke = {
  viewBox: '0 0 20 20',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  className: 'size-3.5',
}

function BinIcon() {
  return (
    <svg {...stroke}>
      <path d="M4 6h12M8 6V4.2h4V6M5.5 6l.7 10a1 1 0 0 0 1 .9h5.6a1 1 0 0 0 1-.9l.7-10M8.5 9.5v4.5M11.5 9.5v4.5" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg {...stroke} strokeWidth={2}>
      <path d="M10 4.5v11M4.5 10h11" />
    </svg>
  )
}
