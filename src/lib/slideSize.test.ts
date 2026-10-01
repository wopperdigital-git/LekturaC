import { describe, expect, it } from 'vitest'
import { SLIDE_WIDTH_PX, slideScale } from './slideSize'

describe('slideScale', () => {
  it('fits the slide width to the space it is shown in, shrinking or growing', () => {
    expect(slideScale(SLIDE_WIDTH_PX)).toBe(1)
    expect(slideScale(SLIDE_WIDTH_PX / 2)).toBe(0.5)
    expect(slideScale(SLIDE_WIDTH_PX * 1.5)).toBe(1.5)
  })

  it('never grows past the cap', () => {
    expect(slideScale(4000, 1024)).toBe(1024 / SLIDE_WIDTH_PX)
    expect(slideScale(488, 1024)).toBe(0.5)
  })

  it('is 0 before there is anything to measure', () => {
    expect(slideScale(0)).toBe(0)
    expect(slideScale(Number.NaN)).toBe(0)
  })
})
