import { describe, expect, it } from 'vitest'
import { MAX_STROKES_PER_CARD, type Stroke } from '@/engine/overlay'
import {
  DEFAULT_LIVE_PEN,
  LASER_MAX_POINTS,
  LASER_TRAIL_MS,
  addLiveStroke,
  clearLiveSlide,
  eraseLiveStrokes,
  livePenSettings,
  parseLiveInk,
  pruneLaser,
  pushLaser,
  slideHasInk,
} from './liveInk'

function stroke(id: string): Stroke {
  return { id, kind: 'stroke', tool: 'pen', color: '#ef4444', width: 0.007, points: [[0.1, 0.1]] }
}

describe('livePenSettings', () => {
  it('draws pen and highlighter as temporary ink in their own colours', () => {
    expect(livePenSettings({ ...DEFAULT_LIVE_PEN, tool: 'pen', penColor: '#3b82f6' })).toEqual({
      tool: 'pen',
      size: 'small',
      color: '#3b82f6',
      keep: 'temporary',
    })
    expect(livePenSettings({ ...DEFAULT_LIVE_PEN, tool: 'highlighter', highlighterColor: '#22c55e' })).toEqual({
      tool: 'marker',
      size: 'big',
      color: '#22c55e',
      keep: 'temporary',
    })
    expect(livePenSettings({ ...DEFAULT_LIVE_PEN, tool: 'eraser' })).toMatchObject({ tool: 'eraser', keep: 'temporary' })
  })

  it('captures nothing for the pointer and the laser', () => {
    expect(livePenSettings({ ...DEFAULT_LIVE_PEN, tool: 'pointer' })).toBeNull()
    expect(livePenSettings({ ...DEFAULT_LIVE_PEN, tool: 'laser' })).toBeNull()
  })

  it('starts on the pointer with a red pen and a yellow highlighter', () => {
    expect(DEFAULT_LIVE_PEN).toEqual({ tool: 'pointer', penColor: '#ef4444', highlighterColor: '#facc15' })
  })
})

describe('live ink per slide', () => {
  it('adds a stroke to its own slide only, without touching the input', () => {
    const before = { a: [stroke('1')] }
    const after = addLiveStroke(before, 'b', stroke('2'))
    expect(after).toEqual({ a: [stroke('1')], b: [stroke('2')] })
    expect(before).toEqual({ a: [stroke('1')] })
  })

  it('refuses a stroke past the per-slide limit', () => {
    const full = { a: Array.from({ length: MAX_STROKES_PER_CARD }, (_, i) => stroke(String(i))) }
    expect(addLiveStroke(full, 'a', stroke('x'))).toBe(full)
  })

  it('erases named strokes and drops a slide left empty', () => {
    const ink = { a: [stroke('1'), stroke('2')], b: [stroke('3')] }
    expect(eraseLiveStrokes(ink, 'a', ['1'])).toEqual({ a: [stroke('2')], b: [stroke('3')] })
    expect(eraseLiveStrokes(ink, 'b', ['3'])).toEqual({ a: [stroke('1'), stroke('2')] })
    expect(eraseLiveStrokes(ink, 'a', ['nope'])).toBe(ink)
  })

  it('clears one slide and keeps the others', () => {
    const ink = { a: [stroke('1')], b: [stroke('2')] }
    expect(clearLiveSlide(ink, 'a')).toEqual({ b: [stroke('2')] })
    expect(clearLiveSlide(ink, 'z')).toBe(ink)
  })

  it('says whether a slide has ink', () => {
    expect(slideHasInk({ a: [stroke('1')] }, 'a')).toBe(true)
    expect(slideHasInk({ a: [stroke('1')] }, 'b')).toBe(false)
  })
})

describe('parseLiveInk', () => {
  it('keeps valid strokes and drops anything else', () => {
    const shape = { id: 's', kind: 'shape', shape: 'rectangle', color: 'accent', width: 0.004, fill: false, x: 0, y: 0, w: 0.1, h: 0.1 }
    expect(parseLiveInk({ a: [stroke('1'), { id: 'bad' }, shape], b: [], c: 'x' })).toEqual({ a: [stroke('1')] })
  })

  it('reads anything that is not an object as no ink', () => {
    expect(parseLiveInk(null)).toEqual({})
    expect(parseLiveInk([stroke('1')])).toEqual({})
    expect(parseLiveInk('x')).toEqual({})
  })
})

describe('laser trail', () => {
  it('appends points and keeps only the newest few', () => {
    let trail = pushLaser([], [0.1, 0.2], 1000)
    expect(trail).toEqual([{ x: 0.1, y: 0.2, at: 1000 }])
    for (let i = 0; i < LASER_MAX_POINTS + 5; i++) trail = pushLaser(trail, [i, i], 1000 + i)
    expect(trail).toHaveLength(LASER_MAX_POINTS)
    expect(trail.at(-1)).toEqual({ x: LASER_MAX_POINTS + 4, y: LASER_MAX_POINTS + 4, at: 1000 + LASER_MAX_POINTS + 4 })
  })

  it('clears when the pointer leaves the slide', () => {
    expect(pushLaser([{ x: 0, y: 0, at: 1 }], null, 2)).toEqual([])
  })

  it('fades old points but always keeps the dot', () => {
    const trail = [
      { x: 0, y: 0, at: 0 },
      { x: 1, y: 1, at: 500 },
      { x: 2, y: 2, at: 600 },
    ]
    expect(pruneLaser(trail, 500 + LASER_TRAIL_MS - 50)).toEqual(trail.slice(1))
    expect(pruneLaser(trail, 10_000)).toEqual([trail[2]])
    expect(pruneLaser([], 10)).toEqual([])
  })
})
