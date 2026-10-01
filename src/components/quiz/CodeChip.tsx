import { useEffect, useState, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'

/** How long the "Copied to clipboard" toast stays up. */
export const COPIED_TOAST_MS = 1800

/**
 * The toast is portalled to `<body>` at a z-index above every modal (`z-50`),
 * so it shows at the bottom of the screen even from inside a scrolling dialog.
 * It fades and rises in on mount (`starting:`), and is announced politely.
 */
export function CopiedToast() {
  return createPortal(
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex justify-center px-4"
    >
      <p className="rounded-full bg-app-foreground px-4 py-2 text-sm font-medium text-app-background shadow-app transition-[opacity,translate] duration-200 starting:translate-y-2 starting:opacity-0">
        Copied to clipboard
      </p>
    </div>,
    document.body,
  )
}

/**
 * A share code you click to copy. Only ever rendered for Teachers. The press
 * stops propagating, so a chip inside a clickable row copies without also
 * opening the row.
 */
export function CodeChip({ code }: { code: string }) {
  /** Counts copies; 0 = no toast. A new copy while the toast is up restarts its timer and its fade-in. */
  const [copies, setCopies] = useState(0)

  useEffect(() => {
    if (copies === 0) return
    const timer = setTimeout(() => setCopies(0), COPIED_TOAST_MS)
    return () => clearTimeout(timer)
  }, [copies])

  async function copy(e: MouseEvent<HTMLButtonElement>) {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(code)
      setCopies((n) => n + 1)
    } catch {
      // Clipboard blocked: the code is on screen to copy by hand.
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={(e) => void copy(e)}
        title="Click to copy"
        aria-label={`Quiz code ${code}, click to copy`}
        className="cursor-pointer rounded-app-sm border border-app-border bg-app-surface px-2 py-1 font-mono text-sm tracking-wider text-app-foreground transition-colors hover:border-app-accent/50 hover:text-app-accent-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent"
      >
        {code}
      </button>
      {copies > 0 && <CopiedToast key={copies} />}
    </>
  )
}
