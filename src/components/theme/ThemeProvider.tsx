import { useEffect, useRef, type ReactNode } from 'react'
import { applyTheme, type ThemeTokens } from '@/lib/theme-tokens'

/**
 * Scopes a ThemeTokens object to its own DOM subtree via a wrapper element,
 * instead of writing to document.documentElement. `display: contents` keeps
 * the wrapper out of layout flow — it exists only to host the scoped
 * --slide-* custom properties that descendants read.
 */
export function ThemeProvider({ theme, children }: { theme: ThemeTokens; children: ReactNode }) {
  const scopeRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scopeRef.current) applyTheme(theme, scopeRef.current)
  }, [theme])

  return (
    <div ref={scopeRef} className="contents">
      {children}
    </div>
  )
}
