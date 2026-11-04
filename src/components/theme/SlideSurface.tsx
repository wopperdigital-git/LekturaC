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
 * over the stage's decoration.
 *
 * The card is presentation-shaped: a 16:9 FLOOR, not a fixed box. `aspect-video`
 * sets the ratio and the height stays `auto`, so a short slide is 16:9 with its
 * content centred (`flex flex-col justify-center`). A taller slide must grow, not
 * clip, and that rests on one CSS detail: with an aspect-ratio and `height:
 * auto`, the box's automatic minimum height is its content height *unless it is
 * a scroll container*. `overflow: hidden` is a scroll container, so it would pin
 * the box to 16:9 and cut the content off; `overflow: clip` is not, so the
 * content still sets the floor and the theme's corner radius still clips. Do not
 * change `overflow-clip` back to `overflow-hidden`.
 *
 * Radius and shadow stay with the caller: the canvas and presenter cards want
 * `rounded-slide`/`shadow-slide-card`, while a thumbnail is clipped by its own
 * scaled frame.
 *
 * Padding is the surface's own, held in a custom property, because a background
 * photo has to bleed through it: `--slide-pad` IS the padding (`BackgroundPhoto`
 * insets itself by its negative), so the two cannot disagree on any surface. The
 * canvas, presenter and outline pad `fluid` (2rem, 2.5rem from a 640px screen);
 * the cover, the phone view and the video pad `roomy` (2.5rem always).
 */
export const SLIDE_SURFACE_CLASS =
  'relative isolate flex aspect-video flex-col justify-center overflow-clip bg-slide-background p-[var(--slide-pad)]'

export type SlidePadding = 'fluid' | 'roomy'

const PADDING_CLASS: Record<SlidePadding, string> = {
  fluid: '[--slide-pad:2rem] sm:[--slide-pad:2.5rem]',
  roomy: '[--slide-pad:2.5rem]',
}

export function SlideSurface({
  className = '',
  padding = 'fluid',
  style,
  children,
}: {
  className?: string
  padding?: SlidePadding
  style?: CSSProperties
  children: ReactNode
}) {
  return (
    <div className={`${SLIDE_SURFACE_CLASS} ${PADDING_CLASS[padding]} ${className}`} style={style}>
      {children}
    </div>
  )
}
