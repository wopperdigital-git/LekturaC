import { useEffect, useState } from 'react'

/** The class's join code, click to copy. Clipboard can be blocked; the code is still on screen to read. */
export function JoinCodeChip({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(timer)
  }, [copied])

  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
    } catch {
      // Blocked clipboard: nothing to do — the code is visible.
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      title="Copy join code"
      className="inline-flex cursor-pointer items-center gap-2 rounded-app-sm border border-app-border bg-app-surface px-2.5 py-1 text-xs text-app-foreground transition-colors hover:bg-app-border/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent"
    >
      <span className="font-mono tracking-[0.2em]">{code}</span>
      <span className="text-app-muted" aria-live="polite">
        {copied ? 'Copied' : 'Copy'}
      </span>
    </button>
  )
}
