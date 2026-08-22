export interface SelectionRect {
  top: number
  left: number
  width: number
  height: number
}

const PADDING = 4

/**
 * The selection box is drawn as an absolutely-positioned sibling measured from
 * the block's rect, never as a style on the block itself: the layouts are built
 * out of flex/grid children, so adding a border or ring to a selected node would
 * nudge everything around it and make selecting a thing change how it looks.
 */
export function SelectionOverlay({
  rect,
  editing,
  onDelete,
}: {
  rect: SelectionRect
  editing: boolean
  onDelete: () => void
}) {
  const top = rect.top - PADDING
  const left = rect.left - PADDING
  const width = rect.width + PADDING * 2
  const height = rect.height + PADDING * 2
  // Keep the toolbar on screen when the block sits at the very top of the card.
  const toolbarBelow = top < 34

  return (
    <>
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute z-10 rounded-app-sm ring-2 ${
          editing ? 'ring-app-highlight' : 'ring-app-accent'
        }`}
        style={{ top, left, width, height }}
      />
      {!editing && (
        <div
          className="absolute z-20 flex items-center gap-1 rounded-app-sm border border-app-border bg-app-surface px-1 py-0.5 shadow-app"
          style={{ top: toolbarBelow ? top + height + 6 : top - 32, left }}
        >
          <button
            onClick={onDelete}
            aria-label="Delete element"
            title="Delete element (Del)"
            className="flex size-7 cursor-pointer items-center justify-center rounded-app-sm text-app-muted transition-colors hover:bg-red-500/10 hover:text-red-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent"
          >
            <svg
              className="size-4"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M4 6h12" />
              <path d="M8 6V4.5h4V6" />
              <path d="M5.5 6l.6 9h7.8l.6-9" />
              <path d="M8.5 9v3.5M11.5 9v3.5" />
            </svg>
          </button>
          <span className="pr-1.5 text-[11px] text-app-muted">Double-click to edit</span>
        </div>
      )}
    </>
  )
}
