import type { CSSProperties, ReactNode } from 'react'

/**
 * One slide's card: a solid panel in the theme's own background colour.
 *
 * This used to carry the celestial backdrop as well. It no longer does — the
 * decoration moved out to `SlideStage`, which paints it once behind all the
 * cards. A card is deliberately flat now: solid fill, theme radius, and the
 * shared floating shadow the caller applies. Putting artwork back in here would
 * mean every card fighting the stage behind it for the same attention.
 *
 * The three places a slide is drawn — the editor canvas, the presenter view,
 * and the outline sidebar's thumbnails — share this so a theme can never be
 * half-applied in one of them.
 *
 * `isolate` gives the card its own stacking context so it composites cleanly
 * over the stage's decoration, and `overflow-hidden` clips content to the
 * theme's corner radius.
 *
 * Radius, shadow and padding stay with the caller: the canvas and presenter
 * cards want `rounded-slide`/`shadow-slide-card`, while a thumbnail is clipped
 * by its own scaled frame.
 */
export function SlideSurface({
  className = '',
  style,
  children,
}: {
  className?: string
  style?: CSSProperties
  children: ReactNode
}) {
  return (
    <div className={`relative isolate overflow-hidden bg-slide-background ${className}`} style={style}>
      {children}
    </div>
  )
}
