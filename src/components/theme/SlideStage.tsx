import type { CSSProperties, ReactNode, Ref } from 'react'
import { SlideBackdrop } from './SlideBackdrop'

/**
 * The themed ground a deck's cards sit on.
 *
 * The theme's decoration — nebula, stars, orbits, constellation — lives here,
 * behind the cards, rather than inside each one. A card is then just a solid
 * panel in a colour drawn from the same theme, floating above this with a
 * shadow, which is what makes the deck read as slides on a stage instead of a
 * stack of separately-wallpapered tiles.
 *
 * The stage is its own positioning context and does **not** scroll: callers
 * that need scrolling put an overflow container *inside* it (see EditorPage),
 * so the backdrop stays pinned to the viewport while cards move over it. Sizing
 * the decoration to one screen is also what keeps it composed — the celestial
 * elements are percentages, so letting the stage grow to a 30-card scroll
 * height would stretch every orbit into an ellipse.
 *
 * Must be rendered inside a `ThemeProvider`: `SlideBackdrop` reads the theme
 * from context, and `bg-slide-canvas` resolves against that scope's tokens.
 */
export function SlideStage({
  className = '',
  style,
  ref,
  children,
}: {
  className?: string
  style?: CSSProperties
  /** Presenter view needs the stage element itself to request fullscreen on. */
  ref?: Ref<HTMLDivElement>
  /**
   * Optional: the editor renders the stage as a bare background layer spanning
   * the whole body, with the outline rail and canvas positioned over it as
   * siblings rather than descendants.
   */
  children?: ReactNode
}) {
  return (
    <div ref={ref} className={`relative isolate overflow-hidden bg-slide-canvas ${className}`} style={style}>
      <SlideBackdrop />
      {children}
    </div>
  )
}
