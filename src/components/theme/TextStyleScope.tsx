import type { CSSProperties, ReactNode } from 'react'
import type { TextStyle } from '@/engine/textStyle'
import { SLIDE_FONT_VARS } from '@/lib/theme-tokens'
import { useSlideTheme } from './slideThemeContext'

/**
 * Applies one *resolved* text style to a subtree.
 *
 * "Resolved" is load-bearing: callers pass the already-merged deck+card style
 * (see `mergeTextStyle`), and this component is applied per card rather than
 * once around the whole deck. Nesting a card scope inside a deck scope would
 * look tidier but can't express the case that matters — a card turning bold
 * *off* while the deck has it on. CSS has no "unset what an ancestor's
 * attribute selector matched", so the override has to be a merge done in JS
 * before anything reaches the DOM, applied at exactly one level.
 *
 * Font family and size ride as inline custom properties, which cascade and so
 * override whatever `applyTheme` wrote on the ThemeProvider scope above.
 * Bold/italic/underline/colour/alignment ride as data attributes, because they must out-specify
 * the layout components' own Tailwind utilities — see the rules in index.css.
 *
 * `display: contents` keeps the wrapper out of layout flow entirely, so adding
 * it around a card changes no geometry.
 */
export function TextStyleScope({ style, children }: { style: TextStyle; children: ReactNode }) {
  const theme = useSlideTheme()

  const vars: CSSProperties = {}
  if (style.fontFamily) {
    Object.assign(vars, {
      [SLIDE_FONT_VARS.heading]: style.fontFamily,
      [SLIDE_FONT_VARS.body]: style.fontFamily,
    })
  }
  if (style.fontScale && style.fontScale !== 1) {
    const [h1, h2, h3, body] = theme.typography.scale.map((step) => step * style.fontScale!)
    Object.assign(vars, {
      '--slide-size-h1': `${h1}rem`,
      '--slide-size-h2': `${h2}rem`,
      '--slide-size-h3': `${h3}rem`,
      '--slide-size-body': `${body}rem`,
    })
  }

  if (style.color) Object.assign(vars, { '--slide-user-color': style.color })

  return (
    <div
      className="contents"
      style={vars}
      // Only emitted when set: an always-present `data-deck-bold="false"` would
      // still match a bare `[data-deck-bold]` selector.
      data-deck-bold={style.bold ? 'true' : undefined}
      data-deck-italic={style.italic ? 'true' : undefined}
      data-deck-underline={style.underline ? 'true' : undefined}
      data-deck-color={style.color ? 'true' : undefined}
      data-deck-align={style.align}
    >
      {children}
    </div>
  )
}
