import type { CSSProperties } from 'react'
import { GRID_MAJOR_EVERY, gridCell } from '@/engine/gridSnap'

/**
 * How far the grid reaches past the content box on every side, so it covers the
 * card's padding too. The card is `overflow-hidden`, so the excess is clipped.
 */
const BLEED_PX = 256

const MINOR = 'color-mix(in srgb, var(--slide-foreground) 10%, transparent)'
const MAJOR = 'color-mix(in srgb, var(--slide-foreground) 22%, transparent)'

const line = (color: string, direction: 'to right' | 'to bottom') =>
  `linear-gradient(${direction}, ${color} 0, ${color} 1px, transparent 1px)`

/** The overlay's style for a card whose content box is `contentWidth` wide. */
function gridStyle(contentWidth: number): CSSProperties {
  const cell = gridCell(contentWidth)
  const major = cell * GRID_MAJOR_EVERY
  return {
    inset: -BLEED_PX,
    // Both the layers' tile and their origin are what put a line exactly on the
    // content box's top-left, the same origin `snapMove` and `snapResize` use.
    backgroundImage: [
      line(MAJOR, 'to right'),
      line(MAJOR, 'to bottom'),
      line(MINOR, 'to right'),
      line(MINOR, 'to bottom'),
    ].join(', '),
    backgroundSize: `${major}px ${major}px, ${major}px ${major}px, ${cell}px ${cell}px, ${cell}px ${cell}px`,
    backgroundPosition: `${BLEED_PX}px ${BLEED_PX}px`,
  }
}

/** Graph paper over one card, in the card's own content coordinates. Drawn only in the editor. */
export function GridOverlay({ contentWidth }: { contentWidth: number }) {
  return (
    <div
      aria-hidden="true"
      data-grid-overlay
      className="pointer-events-none absolute z-10"
      style={gridStyle(contentWidth)}
    />
  )
}
