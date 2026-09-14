import { describe, expect, it } from 'vitest'
import { fitScale } from './fitScale'

describe('fitScale', () => {
  /*
    Never scale UP. A short card is drawn at its natural size and left alone —
    blowing it up to fill the canvas would render the same deck at a different
    text size on every slide, which is exactly the templated look the layouts
    are designed to avoid.
  */
  it('leaves content that already fits at its natural size', () => {
    expect(fitScale({ width: 400, height: 300 }, { width: 1000, height: 800 })).toBe(1)
  })

  it('does not scale up content smaller than the box', () => {
    expect(fitScale({ width: 100, height: 100 }, { width: 1000, height: 1000 })).toBe(1)
  })

  it('scales down by width when width is the tighter constraint', () => {
    expect(fitScale({ width: 1000, height: 100 }, { width: 500, height: 1000 })).toBe(0.5)
  })

  it('scales down by height when height is the tighter constraint', () => {
    expect(fitScale({ width: 100, height: 1000 }, { width: 1000, height: 250 })).toBe(0.25)
  })

  /* A tall card is the case this whole helper exists for: both axes overflow,
     and the smaller ratio is the one that makes the WHOLE card visible. */
  it('takes the smaller ratio when both axes overflow', () => {
    expect(fitScale({ width: 1000, height: 1000 }, { width: 500, height: 250 })).toBe(0.25)
  })

  /*
    A zero on either side means something has not been measured yet — the first
    paint before ResizeObserver reports, or a hidden container. Returning 1
    draws the slide at natural size for one frame; returning 0 would collapse it
    to nothing, and dividing by it would yield Infinity.
  */
  it('falls back to 1 while a dimension is still unmeasured', () => {
    expect(fitScale({ width: 0, height: 0 }, { width: 500, height: 500 })).toBe(1)
    expect(fitScale({ width: 500, height: 500 }, { width: 0, height: 0 })).toBe(1)
    expect(fitScale({ width: 500, height: 0 }, { width: 500, height: 500 })).toBe(1)
  })

  it('never returns a negative or zero scale for negative input', () => {
    expect(fitScale({ width: -10, height: -10 }, { width: 500, height: 500 })).toBe(1)
  })
})
