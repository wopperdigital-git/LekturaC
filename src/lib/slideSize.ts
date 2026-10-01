/*
  The one width a slide is laid out at, everywhere.

  An element's nudge and resize are stored as fractions of the card's content
  width, so they scale with the card — but its text is sized in rem, which does
  not. Lay the same card out at two widths and the text wraps differently inside
  boxes that scaled: a heading resized to fit two lines in the editor runs to
  three on a narrower dashboard cover and spills over the paragraph under it.

  So every surface that draws a slide — the editor canvas, the outline
  thumbnails, the dashboard covers and pickers, the presenter and the video —
  lays the card out at exactly this width and scales the *picture* to whatever
  size it needs. Text then wraps identically on all of them, and a nudge lands
  where it was put.
*/

/** The card's width (its surface, padding included), in CSS pixels, on every surface. */
export const SLIDE_WIDTH_PX = 976

/**
 * The scale that fits a slide laid out `SLIDE_WIDTH_PX` wide into `displayWidth`,
 * capped at `maxDisplayWidth` when given. 0 until there is a width to fit.
 */
export function slideScale(displayWidth: number, maxDisplayWidth?: number): number {
  if (!(displayWidth > 0)) return 0
  const width = maxDisplayWidth === undefined ? displayWidth : Math.min(displayWidth, maxDisplayWidth)
  return width / SLIDE_WIDTH_PX
}
