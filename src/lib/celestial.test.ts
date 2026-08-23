import { describe, expect, it } from 'vitest'
import { starFieldCss, type StarField } from './celestial'

const FIELD: StarField = { count: 20, color: '#ffffff', maxRadiusPx: 2, opacity: 0.8 }

describe('starFieldCss', () => {
  // The whole reason for the seeded PRNG: `Math.random()` here would reshuffle
  // the sky on every re-render, so scrolling the canvas or switching themes
  // would visibly rearrange the background.
  it('is deterministic for a given seed', () => {
    expect(starFieldCss('midnight', FIELD)).toBe(starFieldCss('midnight', FIELD))
  })

  it('gives different themes different skies', () => {
    expect(starFieldCss('midnight', FIELD)).not.toBe(starFieldCss('sage', FIELD))
  })

  it('emits one gradient layer per star', () => {
    const css = starFieldCss('midnight', FIELD)
    expect(css.split('radial-gradient').length - 1).toBe(FIELD.count)
  })

  it('keeps every star circular, so a tall card cannot stretch it into an ellipse', () => {
    // `circle <r>px` rather than a percentage radius is what guarantees this.
    for (const layer of starFieldCss('midnight', FIELD).split('), rgba')) {
      expect(layer).toMatch(/circle \d+\.\d+px at/)
    }
  })

  it('varies brightness between stars instead of emitting one flat opacity', () => {
    const alphas = new Set(
      Array.from(starFieldCss('midnight', FIELD).matchAll(/rgba\([^)]*?,\s*([\d.]+)\)/g), (m) => m[1]),
    )
    expect(alphas.size).toBeGreaterThan(1)
  })

  it('never exceeds the requested peak opacity', () => {
    for (const [, alpha] of starFieldCss('midnight', FIELD).matchAll(/rgba\([^)]*?,\s*([\d.]+)\)/g)) {
      expect(Number(alpha)).toBeLessThanOrEqual(FIELD.opacity)
    }
  })

  // The rejection sampling in `starFieldCss` must not spin or come up short when
  // most of the card is off limits.
  it('still places every star when the center is kept clear', () => {
    const css = starFieldCss('minimal', { ...FIELD, avoidCenter: true })
    expect(css.split('radial-gradient').length - 1).toBe(FIELD.count)
  })

  it('keeps stars out of the center band where headings sit', () => {
    const css = starFieldCss('minimal', { ...FIELD, count: 40, avoidCenter: true })
    for (const [, x, y] of css.matchAll(/at ([\d.]+)% ([\d.]+)%/g)) {
      const inCenter = Math.abs(Number(x) - 50) < 23 && Math.abs(Number(y) - 50) < 21
      expect(inCenter).toBe(false)
    }
  })
})
