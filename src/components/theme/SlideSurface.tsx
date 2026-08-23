import type { CSSProperties, ReactNode } from 'react'
import { SlideBackdrop } from './SlideBackdrop'

/**
 * One slide's card: the themed surface, its celestial backdrop, and the content
 * layer above it.
 *
 * The three places a slide is drawn — the editor canvas, the presenter view,
 * and the outline sidebar's thumbnails — used to each build this chrome
 * themselves. They share it now so a theme can never be half-applied in one of
 * them.
 *
 * `isolate` gives the card its own stacking context, so the backdrop can never
 * paint over a neighbouring card's content, and `overflow-hidden` clips the
 * decoration to the theme's corner radius.
 *
 * Radius, shadow and padding stay with the caller: the canvas and presenter
 * cards want the theme's own `rounded-slide`/`shadow-slide`, while a thumbnail
 * is clipped by its own fixed-size frame.
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
      <SlideBackdrop />
      <div className="relative">{children}</div>
    </div>
  )
}
