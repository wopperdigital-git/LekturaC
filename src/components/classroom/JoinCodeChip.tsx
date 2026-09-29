import { useEffect, useState } from 'react'

/**
 * An interactive, accessible join code chip with one-click copy and animated feedback.
 */
export function JoinCodeChip({
  code,
  className = '',
}: {
  code: string
  className?: string
}) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1800)
    return () => clearTimeout(timer)
  }, [copied])

  async function copy(e: React.MouseEvent) {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
    } catch {
      // Blocked clipboard: the code remains visible on screen
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      title={copied ? 'Copied to clipboard!' : 'Click to copy join code'}
      aria-label={`Join code ${code}, ${copied ? 'copied' : 'click to copy'}`}
      className={`group/code inline-flex cursor-pointer items-center gap-1.5 rounded-app-sm border border-app-border bg-app-surface/70 px-2.5 py-1 text-xs font-medium text-app-foreground shadow-2xs transition-all duration-150 hover:border-app-accent/50 hover:bg-app-surface hover:text-app-accent-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent ${
        copied ? 'border-app-accent/60 bg-app-accent/10 text-app-accent-text' : ''
      } ${className}`}
    >
      <span className="font-mono font-semibold tracking-[0.18em]">{code}</span>
      <span className="flex items-center text-app-muted transition-colors group-hover/code:text-app-accent-text">
        {copied ? (
          <svg
            className="size-3.5 text-app-accent-text"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="3.5 8.5 6.5 11.5 12.5 4.5" />
          </svg>
        ) : (
          <svg
            className="size-3.5 opacity-60 transition-opacity group-hover/code:opacity-100"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
            <path d="M3.5 10.5h-1a1 1 0 01-1-1v-6a1 1 0 011-1h6a1 1 0 011 1v1" />
          </svg>
        )}
      </span>
      <span className="sr-only" aria-live="polite">
        {copied ? 'Code copied to clipboard' : ''}
      </span>
    </button>
  )
}
