import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ZOOM,
  MAX_ZOOM,
  MIN_ZOOM,
  clampZoom,
  fitScale,
  scrollKeepingAnchor,
  zoomAnchor,
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
    let zoom = 1
    for (let i = 0; i < 5; i++) zoom = stepZoom(zoom, 1)
    expect(zoom).toBe(1.5)
    for (let i = 0; i < 5; i++) zoom = stepZoom(zoom, -1)
    expect(zoom).toBe(1)
  })

  it('opens slightly zoomed out, and one step in reaches exactly 100%', () => {
    expect(DEFAULT_ZOOM).toBeLessThan(1)
    expect(DEFAULT_ZOOM).toBeGreaterThan(MIN_ZOOM)
    expect(stepZoom(DEFAULT_ZOOM, 1)).toBe(1)
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

describe('zoomAnchor and scrollKeepingAnchor', () => {
  // Content drawn 1000px wide from x=100, 2000px tall from y=50; cursor at (600, 450).
  const before = { left: 100, top: 50, width: 1000, height: 2000 }
  const cursor = { x: 600, y: 450 }

  it('records where the cursor is as a fraction of the content', () => {
    expect(zoomAnchor(cursor, before).fraction).toEqual({ x: 0.5, y: 0.2 })
  })

  it('scrolls so the spot under the cursor is still under it after zooming in', () => {
    const anchor = zoomAnchor(cursor, before)
    // Doubled, still starting where it did on screen with no scroll yet.
    const after = { left: 100, top: 50, width: 2000, height: 4000 }
    const scroll = scrollKeepingAnchor({ x: 0, y: 0 }, anchor, after)
    // The spot is now at 100 + 0.5 * 2000 = 1100 across and 50 + 0.2 * 4000 = 850 down.
    expect(scroll).toEqual({ x: 500, y: 400 })
  })

  it('leaves the scroll alone when nothing moved', () => {
    const anchor = zoomAnchor(cursor, before)
    expect(scrollKeepingAnchor({ x: 30, y: 70 }, anchor, before)).toEqual({ x: 30, y: 70 })
  })

  it('never scrolls before the start', () => {
    // Halving from no scroll would want -250 and -200: there is nothing before the start to show.
    const anchor = zoomAnchor(cursor, before)
    expect(scrollKeepingAnchor({ x: 0, y: 0 }, anchor, { left: 100, top: 50, width: 500, height: 1000 })).toEqual({
      x: 0,
      y: 0,
    })
  })

  it('treats empty content as anchored at its start', () => {
    expect(zoomAnchor(cursor, { left: 0, top: 0, width: 0, height: 0 }).fraction).toEqual({ x: 0, y: 0 })
  })
})

describe('fitScale', () => {
  it('leaves the column alone when the view has room for it', () => {
    expect(fitScale(976, 976)).toBe(1)
    expect(fitScale(2000, 976)).toBe(1)
  })

  it('shrinks the column in proportion to a narrower view', () => {
    expect(fitScale(488, 976)).toBe(0.5)
    expect(fitScale(732, 976)).toBe(0.75)
  })

  it('is 1 before there is anything to measure', () => {
    expect(fitScale(0, 976)).toBe(1)
    expect(fitScale(Number.NaN, 976)).toBe(1)
    expect(fitScale(500, 0)).toBe(1)
  })
})
