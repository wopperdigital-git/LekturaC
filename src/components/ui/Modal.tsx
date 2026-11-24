import { useEffect, useRef, type ReactNode } from 'react'
import { popDialog, useMotion } from '@/lib/motion'

export function Modal({
  title,
  onClose,
  maxWidth = 'max-w-lg',
  footer,
  bodyClassName = '',
  children,
}: {
  title: ReactNode
  onClose: () => void
  maxWidth?: string
  /** Actions pinned under the body, outside its scroll. */
  footer?: ReactNode
  /** Extra classes on the scrolling body, e.g. `flex flex-col` so a child can shrink to the room left. */
  bodyClassName?: string
  children: ReactNode
}) {
  // Escape closes. Without it, a confirm dialog is dismissible only by aiming at
  // the ✕ or the backdrop, which is the one interaction a keyboard user can't do.
  // Only the topmost dialog answers: a confirm opened over another dialog must not
  // close both. Dialogs render in place, so the last one in the document is on top.
  const panelRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    function onKeyDown(e: globalThis.KeyboardEvent) {
      if (e.key !== 'Escape') return
      const open = document.querySelectorAll('[aria-modal="true"]')
      if (open.length > 0 && open[open.length - 1] !== panelRef.current) return
      onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const ariaLabel = typeof title === 'string' ? title : 'Dialog'

  // Opening only: closing is instant, because most dialogs are closed by their
  // parent unmounting them and an exit nobody can wait for is no exit at all.
  const backdropRef = useMotion<HTMLDivElement>(({ reduce, root }) => {
    const panel = root.querySelector('[role=dialog]')
    if (panel) popDialog(root, panel, reduce)
  })

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        // A column: the title row (with the ✕) and the footer never scroll away; only the body does,
        // and only when it is taller than the window allows.
        className={`flex max-h-[88vh] w-full ${maxWidth} flex-col overflow-hidden rounded-app bg-app-background shadow-app border border-app-border/70`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 px-6 pt-6 pb-5">
          <div className="min-w-0 flex-1">{typeof title === 'string' ? <h2 className="display text-lg font-extrabold text-app-foreground">{title}</h2> : title}</div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-full text-app-muted transition-colors hover:bg-app-surface hover:text-app-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent"
            aria-label="Close"
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
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>
        <div className={`scrollbar-subtle min-h-0 flex-1 overflow-y-auto px-6 ${footer ? 'pb-4' : 'pb-6'} ${bodyClassName}`}>{children}</div>
        {footer && <div className="shrink-0 border-t border-app-border px-6 py-4">{footer}</div>}
      </div>
    </div>
  )
}
