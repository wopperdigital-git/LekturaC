import { useEffect, useId, useRef, useState, type ReactNode } from 'react'

/** How long the pointer may be off a hover menu (crossing the gap to it) before it closes. */
const HOVER_CLOSE_DELAY_MS = 150

export interface ToolbarMenuItem {
  id: string
  label: string
  description?: string
}

/**
 * A toolbar button that opens a small menu under itself.
 *
 * Two ways to open: a *click menu* toggles on click (the text tool), a *hover
 * menu* also opens on pointer hover and on keyboard focus and only ever opens on
 * click, never toggles closed — a click right after the hover that opened it must
 * not slam it shut. Both close on an outside press, on Escape and on a pick.
 *
 * The popover holds either a list of `items` or, for a richer tool, a free-form
 * `panel` (the pen's settings). A panel stays open while it is used and closes only
 * on an outside press or Escape.
 *
 * Every button refuses focus on mousedown, like the tools panel's, so a live text
 * run's caret and character selection survive a click on the toolbar. Keyboard
 * users still reach everything by Tab.
 */
export function ToolbarMenu({
  label,
  title,
  icon,
  items,
  onPick,
  activeId,
  panel,
  pressed,
  onTrigger,
  hover,
  disabled,
}: {
  /** The trigger's accessible name. */
  label: string
  /** Its tooltip, when it should say more than the label. */
  title?: string
  icon: ReactNode
  items?: readonly ToolbarMenuItem[]
  onPick?: (id: string) => void
  /** Marks one item as the current choice (a radio menu) rather than a plain action list. */
  activeId?: string
  /** Free-form popover content, instead of `items`. */
  panel?: ReactNode
  /** Draws the trigger as the active tool. */
  pressed?: boolean
  /** Called when the trigger is clicked, before the popover toggles (the pen uses it to become the active tool). */
  onTrigger?: () => void
  hover?: boolean
  disabled?: boolean
}) {
  const [openRequested, setOpen] = useState(false)
  // A menu whose trigger became disabled is not shown, whatever was last asked.
  const open = openRequested && !disabled
  const root = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const menuId = useId()

  function cancelClose() {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = null
  }

  function close() {
    cancelClose()
    setOpen(false)
  }

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (root.current && !root.current.contains(e.target as Node)) close()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close()
    }
    // Capture phase: the canvas's pan hook stops presses in *its* capture phase, which
    // a bubble listener here would never hear, leaving the menu open over a pan.
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // A pending close must not fire after unmount.
  useEffect(() => cancelClose, [])

  return (
    <div
      ref={root}
      className="relative"
      onMouseEnter={
        hover && !disabled
          ? () => {
              cancelClose()
              setOpen(true)
            }
          : undefined
      }
      onMouseLeave={
        hover
          ? () => {
              cancelClose()
              closeTimer.current = setTimeout(() => setOpen(false), HOVER_CLOSE_DELAY_MS)
            }
          : undefined
      }
    >
      <button
        type="button"
        aria-label={label}
        title={title ?? label}
        aria-haspopup={panel ? 'dialog' : 'menu'}
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={disabled}
        onMouseDown={(e) => e.preventDefault()}
        onFocus={hover && !disabled ? () => setOpen(true) : undefined}
        aria-pressed={pressed}
        onClick={() => {
          onTrigger?.()
          setOpen((current) => (hover ? true : !current))
        }}
        className={`flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-[6px] text-app-foreground/90 transition-colors hover:bg-app-foreground/10 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-app-accent disabled:cursor-not-allowed disabled:opacity-40 ${
          open || pressed ? 'bg-app-foreground/15' : ''
        }`}
      >
        {icon}
      </button>

      {open && (
        // The padding, not a margin, makes the gap under the button: the pointer
        // never crosses dead space on its way from the button to the menu.
        <div className="absolute left-1/2 top-full z-30 -translate-x-1/2 pt-1.5">
          <div
            id={menuId}
            role={panel ? 'dialog' : 'menu'}
            aria-label={label}
            className={`rounded-app border border-app-border bg-app-background shadow-app ${panel ? '' : 'min-w-44 p-1'}`}
          >
            {panel ?? (items ?? []).map((item) => {
              const active = activeId === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  role={activeId === undefined ? 'menuitem' : 'menuitemradio'}
                  aria-checked={activeId === undefined ? undefined : active}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    close()
                    onPick?.(item.id)
                  }}
                  className={`flex w-full cursor-pointer items-center gap-2 rounded-[5px] px-2 py-1.5 text-left text-[12px] text-app-foreground transition-colors hover:bg-app-foreground/10 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-app-accent ${
                    active ? 'bg-app-foreground/10' : ''
                  }`}
                >
                  <span aria-hidden="true" className="w-3 shrink-0 text-app-accent-text">
                    {active ? '✓' : ''}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-medium">{item.label}</span>
                    {item.description && (
                      <span className="block text-[11px] text-app-muted">{item.description}</span>
                    )}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
