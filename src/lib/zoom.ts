/*
  Canvas zoom: how large the editor draws the cards, as a multiple of their
  natural size.

  Pure and DOM-free so the arithmetic is testable. The editor stores nothing
  about it — zoom is a view setting, not part of the deck, and it dies with the
  tab like the outline's open state does.
*/

export const MIN_ZOOM = 0.5
export const MAX_ZOOM = 2
/**
 * Opens a little zoomed out, so a card sits with breathing room on the canvas
 * instead of filling it edge to edge. 100% is one step in, not the default.
 */
export const DEFAULT_ZOOM = 0.9

/** What the toolbar's − and + move by. */
export const ZOOM_STEP = 0.1

/**
 * How fast Ctrl+scroll zooms: the zoom is multiplied by `exp(-deltaY * this)`.
 * Multiplicative rather than additive so a notch feels the same at 60% as at
 * 180%, and so a trackpad pinch — which arrives as many tiny `deltaY`s — glides
 * instead of stepping.
 */
const WHEEL_SENSITIVITY = 0.002

/** Held to the supported range and rounded to whole percent, which is what the toolbar shows. */
export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return DEFAULT_ZOOM
  return Math.round(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom)) * 100) / 100
}

/** One toolbar step in or out. */
export function stepZoom(zoom: number, direction: 1 | -1): number {
  return clampZoom(zoom + direction * ZOOM_STEP)
}

/**
 * The zoom after a Ctrl+scroll event. Scrolling *up* (negative `deltaY`) zooms
 * in, the same way as everywhere else a pinch or Ctrl+scroll is understood.
 */
export function zoomFromWheel(zoom: number, deltaY: number): number {
  return clampZoom(zoom * Math.exp(-deltaY * WHEEL_SENSITIVITY))
}

export interface Point {
  x: number
  y: number
}

export interface Box {
  left: number
  top: number
  width: number
  height: number
}

/**
 * The point a zoom is anchored to: where it is on screen, and where that is
 * within the zoomed content, as a fraction of the content's drawn size (outside
 * the content runs below 0 or past 1, which works just the same).
 *
 * Fractions rather than pixels because they are the one thing a zoom does not
 * change: the same spot of the same slide is the same fraction of the content
 * at any scale, whatever margins and padding sit around it.
 */
export interface ZoomAnchor {
  client: Point
  fraction: Point
}

/** The anchor for screen point `client` over content currently drawn at `content` (screen coordinates). */
export function zoomAnchor(client: Point, content: Box): ZoomAnchor {
  return {
    client,
    fraction: {
      x: content.width > 0 ? (client.x - content.left) / content.width : 0,
      y: content.height > 0 ? (client.y - content.top) / content.height : 0,
    },
  }
}

/**
 * The scroll position that puts the anchor's content spot back under its screen
 * point, now that the content is drawn at `content`. Zooming then grows or
 * shrinks the slides about the cursor instead of about the top of the deck.
 * Never below 0; the browser clamps the far end.
 */
export function scrollKeepingAnchor(scroll: Point, anchor: ZoomAnchor, content: Box): Point {
  return {
    x: Math.max(0, scroll.x + content.left + anchor.fraction.x * content.width - anchor.client.x),
    y: Math.max(0, scroll.y + content.top + anchor.fraction.y * content.height - anchor.client.y),
  }
}

/**
 * How much the card column is shrunk to fit a view narrower than itself, as a
 * multiple on top of the zoom. The column is always laid out `columnMax` wide and
 * only its picture is scaled, so a narrower view (a docked panel opening, a small
 * window) makes the cards smaller without re-wrapping a word of them. Never above
 * 1: a wider view leaves the column at its natural size.
 */
export function fitScale(availableWidth: number, columnMax: number): number {
  if (!(availableWidth > 0) || !(columnMax > 0)) return 1
  return Math.min(1, availableWidth / columnMax)
}
