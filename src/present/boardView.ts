/*
  Where the whiteboard is looked at: the infinite board seen through the 16:9
  page. Everything is in the board's own unit, a fraction of the page width,
  the same unit as its ink, so the console and the projector show the same view
  whatever size each draws the page.

  `x`, `y` is the board point at the page's top-left corner; `zoom` 1 shows one
  page-width of board across the page.
*/

export interface BoardView {
  x: number
  y: number
  zoom: number
}

export const DEFAULT_BOARD_VIEW: BoardView = { x: 0, y: 0, zoom: 1 }

export const MIN_BOARD_ZOOM = 0.25
export const MAX_BOARD_ZOOM = 4
/** One press of + or −. */
export const BOARD_ZOOM_STEP = 1.25

/** The page's centre, in fractions of its width (the page is 16:9). */
const CENTRE: [number, number] = [0.5, 9 / 32]

function clampZoom(zoom: number): number {
  return Math.min(MAX_BOARD_ZOOM, Math.max(MIN_BOARD_ZOOM, zoom))
}

/**
 * The view zoomed by `factor`, keeping the board point under `anchor` (a point on
 * the page, in fractions of its width) where it is.
 */
export function zoomBoardAt(view: BoardView, anchor: readonly [number, number], factor: number): BoardView {
  if (!Number.isFinite(factor) || factor <= 0) return view
  const zoom = clampZoom(view.zoom * factor)
  if (zoom === view.zoom) return view
  const [u, v] = anchor
  return {
    x: view.x + u / view.zoom - u / zoom,
    y: view.y + v / view.zoom - v / zoom,
    zoom,
  }
}

/** One step in (`1`) or out (`-1`), about the page's centre. */
export function stepBoardZoom(view: BoardView, direction: 1 | -1): BoardView {
  return zoomBoardAt(view, CENTRE, direction === 1 ? BOARD_ZOOM_STEP : 1 / BOARD_ZOOM_STEP)
}

/** The view after the page was dragged by `du`, `dv` (fractions of the page's width): the board follows the pointer. */
export function panBoard(view: BoardView, du: number, dv: number): BoardView {
  if (!Number.isFinite(du) || !Number.isFinite(dv)) return view
  return { ...view, x: view.x - du / view.zoom, y: view.y - dv / view.zoom }
}

/** The zoom factor for one wheel event's `deltaY` in pixels: a notch of a mouse wheel is about 10%. */
export function wheelZoomFactor(deltaY: number): number {
  return Math.exp(-deltaY * 0.001)
}

/** A view from another window: untrusted, so anything odd falls back to the default. */
export function parseBoardView(raw: unknown): BoardView {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_BOARD_VIEW
  const { x, y, zoom } = raw as Record<string, unknown>
  if (typeof x !== 'number' || typeof y !== 'number' || typeof zoom !== 'number') return DEFAULT_BOARD_VIEW
  if (![x, y, zoom].every(Number.isFinite)) return DEFAULT_BOARD_VIEW
  return { x, y, zoom: clampZoom(zoom) }
}

/**
 * Whether a press drags the board around: right or middle button, or Ctrl with
 * the left button, whatever the tool; a plain left press only with the Pointer
 * tool (`pannable`). Every other left press draws, types or points.
 */
export function isBoardPanPress(press: { button: number; ctrlKey: boolean }, pannable: boolean): boolean {
  if (press.button === 1 || press.button === 2) return true
  return press.button === 0 && (press.ctrlKey || pannable)
}
