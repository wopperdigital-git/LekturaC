import type { Card } from '@/engine/contentBlocks'
import type { Ground } from '@/engine/composition'
import { deepMuted, type ThemeTokens } from '@/lib/theme-tokens'

/*
  The colours of a slide's ground, for the export. Pure and React-free.

  On screen a title slide is drawn on the theme's deep ground and a quote or stat
  hero on its tint, by re-pointing the ordinary `--slide-*` colours inside that
  surface. The export does the same thing once, here: `groundTheme` hands the
  renderers a theme whose four colours already sit on the right ground, so no
  renderer has to know a ground exists.
*/

export interface GroundColors {
  background: string
  foreground: string
  muted: string
  accent: string
}

/**
 * The four colours a slide on `ground` is drawn with. A plain ground is the theme's
 * own; a tint puts its own colour behind the theme's own inks; the deep ground
 * moves the background and every ink together (the accent becomes the deep ink,
 * as `--slide-accent` does on screen), so text is never the theme's dark ink on
 * the deep colour or its light ink on the page colour.
 */
export function groundColors(theme: ThemeTokens, ground: Ground): GroundColors {
  const c = theme.colors
  switch (ground) {
    case 'plain':
      return { background: c.background, foreground: c.foreground, muted: c.muted, accent: c.accent }
    case 'tint':
      return { background: c.tint, foreground: c.foreground, muted: c.muted, accent: c.accent }
    case 'deep':
      return { background: c.deep, foreground: c.deepForeground, muted: deepMuted(c), accent: c.deepForeground }
  }
}

/** The theme with its background, foreground, muted and accent colours moved onto `ground`; the theme itself for a plain one. */
export function groundTheme(theme: ThemeTokens, ground: Ground): ThemeTokens {
  if (ground === 'plain') return theme
  return { ...theme, colors: { ...theme.colors, ...groundColors(theme, ground) } }
}

/**
 * The card with every stored text colour removed: the card's own pick, each
 * element's and run's, and character colour marks. Everything else a user
 * formatted (bold, size, font, alignment) stays. On the deep ground text ignores
 * every colour pick, because a colour chosen against a light page can vanish on it.
 */
export function withoutStoredColors(card: Card): Card {
  const withoutColor = <T extends { color?: string }>(style: T | undefined): T | undefined => {
    if (!style) return style
    const { color: _color, ...rest } = style
    void _color
    return rest as T
  }
  const inline = card.inline
    ? Object.fromEntries(
        Object.entries(card.inline).map(([ref, entry]) => [
          ref,
          {
            ...entry,
            ...(entry.style ? { style: withoutColor(entry.style) } : {}),
            ...(entry.marks ? { marks: entry.marks.filter((mark) => mark.type !== 'color') } : {}),
          },
        ]),
      )
    : undefined
  return {
    ...card,
    ...(card.textStyle ? { textStyle: withoutColor(card.textStyle) } : {}),
    ...(inline ? { inline } : {}),
  }
}
