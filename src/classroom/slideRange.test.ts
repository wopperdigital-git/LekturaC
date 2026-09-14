import { describe, expect, it } from 'vitest'
import { formatSlideRange } from './slideRange'

describe('formatSlideRange', () => {
  it('is empty when no slide is cited', () => {
    expect(formatSlideRange([])).toBe('')
  })

  it('names a single slide in the singular', () => {
    expect(formatSlideRange([3])).toBe('slide 3')
  })

  it('collapses a contiguous run', () => {
    expect(formatSlideRange([2, 3, 4, 5])).toBe('slides 2–5')
  })

  it('keeps separate runs and singles apart', () => {
    expect(formatSlideRange([2, 3, 4, 5, 8])).toBe('slides 2–5, 8')
  })

  it('sorts, and counts a slide cited by several questions once', () => {
    expect(formatSlideRange([5, 2, 2, 3, 4])).toBe('slides 2–5')
  })

  it('treats one slide cited twice as a single slide', () => {
    expect(formatSlideRange([4, 4])).toBe('slide 4')
  })
})
