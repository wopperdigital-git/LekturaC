import { describe, expect, it } from 'vitest'
import {
  DEFAULT_BOARD_VIEW,
  isBoardPanPress,
  MAX_BOARD_ZOOM,
  MIN_BOARD_ZOOM,
  panBoard,
  parseBoardView,
  stepBoardZoom,
  wheelZoomFactor,
  zoomBoardAt,
  type BoardView,
} from './boardView'

/** The board point drawn at `anchor` on the page. */
function boardPointAt(view: BoardView, anchor: [number, number]): [number, number] {
  return [view.x + anchor[0] / view.zoom, view.y + anchor[1] / view.zoom]
}

describe('zoomBoardAt', () => {
  it('keeps the board point under the anchor still', () => {
    const view: BoardView = { x: 0.3, y: -0.2, zoom: 1.5 }
    const anchor: [number, number] = [0.8, 0.1]
    const zoomed = zoomBoardAt(view, anchor, 2)
    expect(zoomed.zoom).toBe(3)
    const [bx, by] = boardPointAt(view, anchor)
    const [ax, ay] = boardPointAt(zoomed, anchor)
    expect(ax).toBeCloseTo(bx, 10)
    expect(ay).toBeCloseTo(by, 10)
  })

  it('stops at the zoom limits and returns the same view there', () => {
    const max = { x: 0, y: 0, zoom: MAX_BOARD_ZOOM }
    expect(zoomBoardAt(max, [0.5, 0.5], 2)).toBe(max)
    expect(zoomBoardAt(DEFAULT_BOARD_VIEW, [0, 0], 0.001).zoom).toBe(MIN_BOARD_ZOOM)
  })

  it('ignores a bad factor', () => {
    expect(zoomBoardAt(DEFAULT_BOARD_VIEW, [0, 0], 0)).toBe(DEFAULT_BOARD_VIEW)
    expect(zoomBoardAt(DEFAULT_BOARD_VIEW, [0, 0], Number.NaN)).toBe(DEFAULT_BOARD_VIEW)
  })
})

describe('stepBoardZoom', () => {
  it('steps in and back out to where it was', () => {
    const back = stepBoardZoom(stepBoardZoom(DEFAULT_BOARD_VIEW, 1), -1)
    expect(back.zoom).toBeCloseTo(1, 10)
    expect(back.x).toBeCloseTo(0, 10)
    expect(back.y).toBeCloseTo(0, 10)
  })
})

describe('panBoard', () => {
  it('moves the board with the pointer, less far when zoomed in', () => {
    expect(panBoard(DEFAULT_BOARD_VIEW, 0.1, -0.2)).toEqual({ x: -0.1, y: 0.2, zoom: 1 })
    const zoomed = panBoard({ x: 0, y: 0, zoom: 2 }, 0.1, 0)
    expect(zoomed.x).toBeCloseTo(-0.05, 10)
  })

  it('ignores a non-finite drag', () => {
    expect(panBoard(DEFAULT_BOARD_VIEW, Number.NaN, 0)).toBe(DEFAULT_BOARD_VIEW)
  })
})

describe('wheelZoomFactor', () => {
  it('zooms in for a wheel turned up and out for down', () => {
    expect(wheelZoomFactor(-100)).toBeGreaterThan(1)
    expect(wheelZoomFactor(100)).toBeLessThan(1)
    expect(wheelZoomFactor(0)).toBe(1)
  })
})

describe('parseBoardView', () => {
  it('keeps a good view and clamps its zoom', () => {
    expect(parseBoardView({ x: 1, y: -2, zoom: 2 })).toEqual({ x: 1, y: -2, zoom: 2 })
    expect(parseBoardView({ x: 0, y: 0, zoom: 99 }).zoom).toBe(MAX_BOARD_ZOOM)
  })

  it('falls back to the default for anything odd', () => {
    for (const bad of [null, 'x', { x: 1 }, { x: 0, y: 0, zoom: Infinity }, { x: '1', y: 0, zoom: 1 }]) {
      expect(parseBoardView(bad)).toEqual(DEFAULT_BOARD_VIEW)
    }
  })
})

describe('isBoardPanPress', () => {
  it('pans on a right or middle press, or Ctrl with the left, in any tool', () => {
    for (const pannable of [true, false]) {
      expect(isBoardPanPress({ button: 2, ctrlKey: false }, pannable)).toBe(true)
      expect(isBoardPanPress({ button: 1, ctrlKey: false }, pannable)).toBe(true)
      expect(isBoardPanPress({ button: 0, ctrlKey: true }, pannable)).toBe(true)
    }
  })

  it('pans on a plain left press only with the Pointer tool', () => {
    expect(isBoardPanPress({ button: 0, ctrlKey: false }, true)).toBe(true)
    expect(isBoardPanPress({ button: 0, ctrlKey: false }, false)).toBe(false)
  })

  it('leaves the back and forward buttons alone', () => {
    expect(isBoardPanPress({ button: 3, ctrlKey: false }, true)).toBe(false)
    expect(isBoardPanPress({ button: 4, ctrlKey: true }, true)).toBe(false)
  })
})
