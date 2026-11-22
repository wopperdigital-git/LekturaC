import { describe, expect, it } from 'vitest'
import {
  buildSchedule,
  cameraOrigin,
  cameraScale,
  crossfadeAlpha,
  easeOut,
  layerPlan,
  stepCountFor,
  stepOf,
  stepProgress,
} from './motion'

describe('buildSchedule', () => {
  it('spaces steps 0.6 s apart after the crossfade on a long slide', () => {
    expect(buildSchedule(3, 20)).toEqual([
      { start: 0.4, duration: 0.5 },
      { start: 1.0, duration: 0.5 },
      { start: 1.6, duration: 0.5 },
    ].map((s) => expect.objectContaining({ start: expect.closeTo(s.start, 9), duration: s.duration })))
  })
  it('compresses so every step has arrived by 40% of a short slide', () => {
    for (const [n, d] of [[6, 4], [6, 1], [3, 0.3], [1, 0.2]] as const) {
      const steps = buildSchedule(n, d)
      expect(steps).toHaveLength(n)
      for (const s of steps) {
        expect(s.start).toBeGreaterThanOrEqual(0)
        expect(s.duration).toBeGreaterThan(0)
        expect(s.start + s.duration).toBeLessThanOrEqual(d * 0.4 + 1e-9)
      }
    }
  })
  it('has no steps for a slide with nothing to build', () => {
    expect(buildSchedule(0, 10)).toEqual([])
  })
})

describe('steps', () => {
  it('caps at six: units past the fifth arrive together in the last step', () => {
    expect([0, 1, 4, 5, 6, 11].map(stepOf)).toEqual([0, 1, 4, 5, 5, 5])
    expect(stepCountFor(0)).toBe(0)
    expect(stepCountFor(4)).toBe(4)
    expect(stepCountFor(9)).toBe(6)
  })
})

describe('easing and progress', () => {
  it('eases out without overshoot', () => {
    expect(easeOut(0)).toBe(0)
    expect(easeOut(1)).toBe(1)
    expect(easeOut(-1)).toBe(0)
    expect(easeOut(2)).toBe(1)
    for (let x = 0; x <= 1; x += 0.05) expect(easeOut(x)).toBeLessThanOrEqual(1)
    expect(easeOut(0.5)).toBeGreaterThan(0.5)
  })
  it('is 0 before a step and 1 after it', () => {
    const step = { start: 1, duration: 0.5 }
    expect(stepProgress(step, 0.9)).toBe(0)
    expect(stepProgress(step, 1.6)).toBe(1)
  })
})

describe('layerPlan', () => {
  const schedule = [{ start: 0.4, duration: 0.5 }, { start: 1.0, duration: 0.5 }]
  it('shows state 0 alone before anything builds', () => {
    expect(layerPlan(schedule, 0)).toEqual({ base: 0, blends: [] })
  })
  it('blends the next state in while a step runs', () => {
    const plan = layerPlan(schedule, 0.65)
    expect(plan.base).toBe(0)
    expect(plan.blends).toHaveLength(1)
    expect(plan.blends[0].state).toBe(1)
    expect(plan.blends[0].alpha).toBeGreaterThan(0)
    expect(plan.blends[0].alpha).toBeLessThan(1)
  })
  it('rests on the last state once every step is done', () => {
    expect(layerPlan(schedule, 5)).toEqual({ base: 2, blends: [] })
  })
  it('rests on state 0 when there is nothing to build', () => {
    expect(layerPlan([], 3)).toEqual({ base: 0, blends: [] })
  })
})

describe('camera and crossfade', () => {
  it('pushes from 1.00 to 1.03 over the slide and never past it', () => {
    expect(cameraScale(0, 10)).toBe(1)
    expect(cameraScale(10, 10)).toBeCloseTo(1.03, 9)
    expect(cameraScale(20, 10)).toBeCloseTo(1.03, 9)
  })
  it('keeps every origin near the centre and moves between neighbours', () => {
    for (let i = 0; i < 20; i++) {
      const o = cameraOrigin(i)
      expect(o.x).toBeGreaterThanOrEqual(400)
      expect(o.x).toBeLessThanOrEqual(880)
      expect(o.y).toBeGreaterThanOrEqual(260)
      expect(o.y).toBeLessThanOrEqual(460)
      expect(cameraOrigin(i + 1)).not.toEqual(o)
    }
  })
  it('crossfades over 0.4 s', () => {
    expect(crossfadeAlpha(0)).toBe(0)
    expect(crossfadeAlpha(0.2)).toBeCloseTo(0.5, 9)
    expect(crossfadeAlpha(0.4)).toBe(1)
    expect(crossfadeAlpha(3)).toBe(1)
  })
})
