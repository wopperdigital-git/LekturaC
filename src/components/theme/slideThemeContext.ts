import { createContext, useContext } from 'react'
import { DEFAULT_THEME, type ThemeTokens } from '@/lib/theme-tokens'

/**
 * The active deck theme, for the parts of a slide that CSS custom properties
 * cannot express.
 *
 * Colors, fonts and radii all travel as `--slide-*` variables, but celestial
 * decoration is structured data — a star count, a list of orbits — so
 * `SlideBackdrop` reads the theme object itself from here rather than having it
 * threaded through every call site.
 *
 * It lives apart from `ThemeProvider` so that file exports only components,
 * which is what keeps fast refresh working for it.
 */
export const SlideThemeContext = createContext<ThemeTokens>(DEFAULT_THEME)

export function useSlideTheme(): ThemeTokens {
  return useContext(SlideThemeContext)
}
