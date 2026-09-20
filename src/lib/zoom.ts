/*
  Canvas zoom: how large the editor draws the cards, as a multiple of their
  natural size.

  Pure and DOM-free so the arithmetic is testable. The editor stores nothing
  about it — zoom is a view setting, not part of the deck, and it dies with the
  tab like the outline's open state does.
*/

export const MIN_ZOOM = 0.5
export const MAX_ZOOM = 2
export const DEFAULT_ZOOM = 1

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

/**
 * Where the scroll position has to go so the same part of the canvas stays in
 * the middle of the view when the zoom changes. Without it, zooming in from the
 * top of a long deck lands the viewer somewhere further down every time, since
 * the content grows under a fixed scroll offset.
 */
export function scrollTopAfterZoom(scrollTop: number, viewHeight: number, from: number, to: number): number {
  if (from <= 0) return scrollTop
  const centre = scrollTop + viewHeight / 2
  return Math.max(0, (centre * to) / from - viewHeight / 2)
}
