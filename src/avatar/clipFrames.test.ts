import { describe, expect, it } from 'vitest'
import { clipFrameSlots, clipSlot } from './clipFrames'

/** `count` frames at 25 fps starting at 0. */
const frames = (count: number, fps = 25) =>
  Array.from({ length: count }, (_, i) => ({ timestamp: i / fps, duration: 1 / fps }))

describe('clipFrameSlots', () => {
  it('drops frames past the segment end', () => {
    const slots = clipFrameSlots(frames(80), 10, 3) // 3.2 s of frames, 3 s segment
    const last = slots[slots.length - 1]
    expect(last.timestamp + last.duration).toBeCloseTo(13, 9)
    for (const s of slots) expect(s.timestamp).toBeLessThan(13)
    expect(slots).toHaveLength(75)
    expect(slots.map((s) => s.index)).toEqual(Array.from({ length: 75 }, (_, i) => i))
  })

  it('holds the last frame to the segment end', () => {
    const slots = clipFrameSlots(frames(73), 5, 3) // 73 / 25 = 2.92 s
    const last = slots[slots.length - 1]
    expect(last.timestamp + last.duration).toBeCloseTo(8, 9)
    expect(last.duration).toBeGreaterThan(1 / 25)
  })

  it('clamps a last frame that runs past the end', () => {
    const slots = clipFrameSlots([{ timestamp: 0, duration: 2 }, { timestamp: 2, duration: 2 }], 0, 3)
    expect(slots).toEqual([
      { index: 0, timestamp: 0, duration: 2 },
      { index: 1, timestamp: 2, duration: 1 },
    ])
  })

  it('offsets by segmentStart', () => {
    const slots = clipFrameSlots(frames(10), 7.5, 3)
    expect(slots[0].timestamp).toBe(7.5)
    expect(slots[1].timestamp).toBeCloseTo(7.54, 9)
  })

  it('a first frame at 0.04 s maps to segmentStart', () => {
    const shifted = frames(75).map((f) => ({ ...f, timestamp: f.timestamp + 0.04 }))
    const slots = clipFrameSlots(shifted, 6, 3)
    expect(slots[0].timestamp).toBe(6)
    expect(slots[1].timestamp).toBeCloseTo(6.04, 9)
    const last = slots[slots.length - 1]
    expect(last.timestamp + last.duration).toBeCloseTo(9, 9)
  })

  it('a negative first timestamp also starts at segmentStart', () => {
    const slots = clipFrameSlots([{ timestamp: -0.08, duration: 0.04 }, { timestamp: -0.04, duration: 0.04 }], 4, 1)
    expect(slots.map((s) => s.timestamp)).toEqual([4, expect.closeTo(4.04, 9)])
  })

  it('returns nothing for no frames', () => {
    expect(clipFrameSlots([], 2, 3)).toEqual([])
  })

  it('holds a lone frame for the whole segment, and drops a later frame that starts past the end', () => {
    // The first frame always lands on segmentStart (it is the clip's origin), whatever its own timestamp.
    expect(clipFrameSlots([{ timestamp: 3, duration: 0.04 }], 0, 3)).toEqual([{ index: 0, timestamp: 0, duration: 3 }])
    expect(
      clipFrameSlots([{ timestamp: 0, duration: 0.04 }, { timestamp: 3.5, duration: 0.04 }], 0, 3),
    ).toEqual([{ index: 0, timestamp: 0, duration: 3 }])
  })
})

describe('clipSlot (the streaming form)', () => {
  it('agrees with clipFrameSlots when frames arrive one at a time', () => {
    const all = frames(80)
    const expected = clipFrameSlots(all, 2, 3)
    const streamed: typeof expected = []
    const origin = all[0].timestamp
    for (let i = 0; i < all.length; i++) {
      if (all[i].timestamp - origin >= 3) break
      const next = all[i + 1]
      const isLast = !next || next.timestamp - origin >= 3
      streamed.push(clipSlot(all[i], i, 2, 3, isLast, origin))
    }
    expect(streamed).toEqual(expected)
  })
})
