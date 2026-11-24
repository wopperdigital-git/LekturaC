import { describe, expect, it } from 'vitest'
import { INTRO, OUTRO, stepSpot } from './scriptSpots'

describe('stepSpot', () => {
  it('walks intro → slides → outro, in the order the video plays', () => {
    expect(stepSpot(INTRO, 1, 3)).toEqual({ kind: 'slide', index: 0 })
    expect(stepSpot({ kind: 'slide', index: 0 }, 1, 3)).toEqual({ kind: 'slide', index: 1 })
    expect(stepSpot({ kind: 'slide', index: 2 }, 1, 3)).toEqual(OUTRO)
  })

  it('goes back from slide 1 to the intro, and from the outro to the last slide', () => {
    expect(stepSpot({ kind: 'slide', index: 0 }, -1, 3)).toEqual(INTRO)
    expect(stepSpot(OUTRO, -1, 3)).toEqual({ kind: 'slide', index: 2 })
  })

  it('stops at either end', () => {
    expect(stepSpot(INTRO, -1, 3)).toBeNull()
    expect(stepSpot(OUTRO, 1, 3)).toBeNull()
  })

  it('goes straight from intro to outro in a deck with no slides', () => {
    expect(stepSpot(INTRO, 1, 0)).toEqual(OUTRO)
    expect(stepSpot(OUTRO, -1, 0)).toEqual(INTRO)
  })
})
