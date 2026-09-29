import { useEffect, type ReactNode } from 'react'

export function Modal({
  title,
  onClose,
  maxWidth = 'max-w-lg',
  children,
}: {
  title: ReactNode
  onClose: () => void
  maxWidth?: string
  children: ReactNode
}) {
  // Escape closes. Without it, a confirm dialog is dismissible only by aiming at
  // the ✕ or the backdrop, which is the one interaction a keyboard user can't do.
  useEffect(() => {
    function onKeyDown(e: globalThis.KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const ariaLabel = typeof title === 'string' ? title : 'Dialog'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        className={`scrollbar-subtle max-h-[88vh] w-full ${maxWidth} overflow-y-auto rounded-app bg-app-background p-6 shadow-app border border-app-border/70 transition-all`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">{typeof title === 'string' ? <h2 className="text-lg font-semibold tracking-tight text-app-foreground">{title}</h2> : title}</div>
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
        {children}
      </div>
    </div>
  )
}
