import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ZOOM,
  MAX_ZOOM,
  MIN_ZOOM,
  clampZoom,
  scrollTopAfterZoom,
  stepZoom,
  zoomFromWheel,
} from './zoom'

describe('clampZoom', () => {
  it('holds the zoom to its range', () => {
    expect(clampZoom(0.1)).toBe(MIN_ZOOM)
    expect(clampZoom(9)).toBe(MAX_ZOOM)
  })

  it('rounds to whole percent, so the toolbar never shows a stray fraction', () => {
    expect(clampZoom(1.2345)).toBe(1.23)
  })

  it('falls back to the default rather than propagating NaN or Infinity', () => {
    expect(clampZoom(Number.NaN)).toBe(DEFAULT_ZOOM)
    expect(clampZoom(Number.POSITIVE_INFINITY)).toBe(DEFAULT_ZOOM)
  })
})

describe('stepZoom', () => {
  it('moves by ten percent and does not drift over repeated steps', () => {
    let zoom = DEFAULT_ZOOM
    for (let i = 0; i < 5; i++) zoom = stepZoom(zoom, 1)
    expect(zoom).toBe(1.5)
    for (let i = 0; i < 5; i++) zoom = stepZoom(zoom, -1)
    expect(zoom).toBe(1)
  })

  it('stops at either end', () => {
    expect(stepZoom(MAX_ZOOM, 1)).toBe(MAX_ZOOM)
    expect(stepZoom(MIN_ZOOM, -1)).toBe(MIN_ZOOM)
  })
})

describe('zoomFromWheel', () => {
  it('zooms in when scrolling up and out when scrolling down', () => {
    expect(zoomFromWheel(1, -100)).toBeGreaterThan(1)
    expect(zoomFromWheel(1, 100)).toBeLessThan(1)
  })

  it('does nothing for a zero delta', () => {
    expect(zoomFromWheel(1.3, 0)).toBe(1.3)
  })

  it('is multiplicative, so opposite notches undo each other', () => {
    const there = zoomFromWheel(1, -100)
    expect(zoomFromWheel(there, 100)).toBeCloseTo(1, 1)
  })

  it('never leaves the range however hard it is scrolled', () => {
    expect(zoomFromWheel(1, -100000)).toBe(MAX_ZOOM)
    expect(zoomFromWheel(1, 100000)).toBe(MIN_ZOOM)
  })
})

describe('scrollTopAfterZoom', () => {
  it('keeps the middle of the view on the same content', () => {
    // Centre of the view is at 300 + 200 = 500 in the old content; doubling the
    // zoom puts that content at 1000, so the view must start at 1000 - 200.
    expect(scrollTopAfterZoom(300, 400, 1, 2)).toBe(800)
  })

  it('leaves the scroll alone when nothing changed', () => {
    expect(scrollTopAfterZoom(300, 400, 1.5, 1.5)).toBe(300)
  })

  it('never scrolls above the top', () => {
    expect(scrollTopAfterZoom(0, 400, 2, 0.5)).toBe(0)
  })
})
