import { createContext, useContext } from 'react'

/**
 * How large the canvas is drawn, as a multiple of natural size.
 *
 * Provided by `ZoomFrame` and read by anything that turns *screen* distances into
 * *card* distances. Zoom is a CSS transform, so the browser reports pointer
 * positions and element rectangles in screen pixels while the card's own layout
 * is still in unscaled pixels: a drag of 100 screen pixels at 200% is 50 card
 * pixels. Every gesture has to divide by this or the element runs ahead of, or
 * behind, the pointer.
 */
export const CanvasZoomContext = createContext(1)

export function useCanvasZoom(): number {
  return useContext(CanvasZoomContext)
}
