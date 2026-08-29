import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { applyTheme, type ThemeTokens } from '@/lib/theme-tokens'
import { SlideThemeContext } from './slideThemeContext'

/**
 * Scopes a ThemeTokens object to its own DOM subtree via a wrapper element,
 * instead of writing to document.documentElement. `display: contents` keeps
 * the wrapper out of layout flow — it exists only to host the scoped
 * --slide-* custom properties that descendants read.
 *
 * Carries the theme only. The toolbar's text overrides live in
 * `TextStyleScope`, applied per card inside this scope.
 */
export function ThemeProvider({ theme, children }: { theme: ThemeTokens; children: ReactNode }) {
  const scopeRef = useRef<HTMLDivElement>(null)

  /*
    `useLayoutEffect`, not `useEffect`, and that is the whole difference between
    a themed first frame and a flash.

    `applyTheme` writes the `--slide-*` custom properties as inline styles on
    this scope, and every `bg-slide-*` / `text-slide-*` class beneath it resolves
    against them. A passive effect runs *after* the browser paints, so the slide
    got exactly one painted frame styled by the `:root` fallbacks instead of the
    deck's theme — a visible flash of the wrong palette on every mount, in the
    canvas, the presenter and every thumbnail in the outline rail at once. A
    layout effect runs in the same commit, before that paint.
  */
  useLayoutEffect(() => {
    if (scopeRef.current) applyTheme(theme, scopeRef.current)
  }, [theme])

  return (
    <SlideThemeContext.Provider value={theme}>
      <div ref={scopeRef} className="contents">
        {children}
      </div>
    </SlideThemeContext.Provider>
  )
}
