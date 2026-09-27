import { describe, expect, it } from 'vitest'
import { FRAME_HEIGHT, FRAME_STEP_SECONDS, SILENT_SLIDE_SECONDS, STAGE_PADDING, fitScale, frameSlots, planTimeline } from './timeline'

describe('constants', () => {
  it('holds a silent slide for four seconds in a 1280x720 frame', () => {
    expect(SILENT_SLIDE_SECONDS).toBe(4)
    expect(FRAME_HEIGHT).toBe(720)
    expect(FRAME_STEP_SECONDS).toBe(1)
    expect(STAGE_PADDING).toBe(40)
  })
})

describe('planTimeline', () => {
  it('starts each slide where the previous one ends', () => {
    const t = planTimeline([2, 4, 1.5])
    expect(t.slides.map((s) => s.startSeconds)).toEqual([0, 2, 6])
    expect(t.slides.map((s) => s.index)).toEqual([0, 1, 2])
    expect(t.totalSeconds).toBe(7.5)
  })

  it('is empty for no slides', () => {
    expect(planTimeline([])).toEqual({ slides: [], totalSeconds: 0 })
  })

  // A zero-length slide would be a frame with no time on screen and would desync everything after it.
  it.each([0, -1, NaN, Infinity])('refuses a duration of %s', (bad) => {
    expect(() => planTimeline([2, bad])).toThrow(RangeError)
  })
})

describe('frameSlots', () => {
  it('emits one frame per second of hold, the last one shorter', () => {
    const [, second] = planTimeline([4, 2.5]).slides
    const slots = frameSlots(second)
    expect(slots.map((s) => s.timestamp)).toEqual([4, 5, 6])
    expect(slots.map((s) => s.duration)).toEqual([1, 1, 0.5])
  })

  it('covers the slide exactly: durations add up to the hold time', () => {
    const [slide] = planTimeline([3.3]).slides
    const total = frameSlots(slide).reduce((sum, s) => sum + s.duration, 0)
    expect(total).toBeCloseTo(3.3, 9)
  })

  // A slide always needs at least one picture, however short its audio.
  it('emits a frame even for a very short slide', () => {
    const [slide] = planTimeline([0.1]).slides
    expect(frameSlots(slide)).toEqual([{ timestamp: 0, duration: 0.1 }])
  })

  it('does not emit a phantom frame after an exact whole number of seconds', () => {
    const [slide] = planTimeline([3]).slides
    expect(frameSlots(slide)).toHaveLength(3)
  })
})

describe('fitScale', () => {
  it('leaves a slide that already fits at full size', () => {
    expect(fitScale(400, 640)).toBe(1)
    expect(fitScale(640, 640)).toBe(1)
  })

  it('shrinks a taller slide so all of it is visible', () => {
    expect(fitScale(1280, 640)).toBe(0.5)
  })

  // Review Focus 5: a degenerate height must never give a zero or NaN scale.
  it.each([0, -5, NaN, Infinity])('is 1 for a content height of %s', (h) => {
    expect(fitScale(h, 640)).toBe(1)
  })

  it('is 1 when there is no room to fit into', () => {
    expect(fitScale(500, 0)).toBe(1)
  })
})
