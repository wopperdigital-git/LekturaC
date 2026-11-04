import { describe, expect, it } from 'vitest'
import { figureSize } from './figureSize'

describe('figureSize', () => {
  it('keeps full size up to the character budget', () => {
    expect(figureSize('h1', 2, '50%', 5)).toBe('calc(var(--slide-size-h1) * 2.000)')
    expect(figureSize('h1', 2, '12345', 5)).toBe('calc(var(--slide-size-h1) * 2.000)')
  })

  it('shrinks a longer figure in proportion to its length', () => {
    expect(figureSize('h1', 2, '1,200,000', 6)).toBe('calc(var(--slide-size-h1) * 1.333)')
  })

  it('never goes below 45% of full size', () => {
    expect(figureSize('h2', 1, 'x'.repeat(60), 6)).toBe('calc(var(--slide-size-h2) * 0.450)')
  })
})
