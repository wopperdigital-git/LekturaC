import { describe, expect, it } from 'vitest'
import { glowGradientSvg, parseGlow, parseGlowLayer } from './glow'
import { BUILTIN_THEMES } from '@/lib/theme-tokens'

const LAYER = 'radial-gradient(120% 80% at 80% -12%, rgba(169,163,255,0.30) 0%, rgba(169,163,255,0) 58%)'

describe('parseGlowLayer', () => {
  it('reads radii, centre and both stops', () => {
    const parsed = parseGlowLayer(LAYER)
    expect(parsed).toEqual({
      rx: 120,
      ry: 80,
      cx: 80,
      cy: -12,
      from: { r: 169, g: 163, b: 255, a: 0.3, offset: 0 },
      to: { r: 169, g: 163, b: 255, a: 0, offset: 58 },
    })
  })

  it('returns null rather than throwing on a shape it cannot read', () => {
    expect(parseGlowLayer('linear-gradient(red, blue)')).toBeNull()
    expect(parseGlowLayer('')).toBeNull()
    // Zero horizontal radius would divide by zero building the transform.
    expect(parseGlowLayer('radial-gradient(0% 80% at 50% 50%, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 50%)')).toBeNull()
  })
})

describe('parseGlow', () => {
  it('splits on top-level commas, not the ones inside rgba()', () => {
    expect(parseGlow([LAYER, LAYER].join(', '))).toHaveLength(2)
  })

  it('drops unreadable layers and keeps the rest', () => {
    expect(parseGlow([LAYER, 'linear-gradient(red, blue)'].join(', '))).toHaveLength(1)
  })

  // The reason this test exists: it is what catches someone later authoring a
  // glow in a shape the parser cannot read.
  it('reads every layer of every built-in theme', () => {
    for (const theme of BUILTIN_THEMES) {
      const source = theme.celestial.glow
      const expected = source.split('radial-gradient').length - 1
      expect(parseGlow(source), theme.id).toHaveLength(expected)
    }
  })
})

describe('glowGradientSvg', () => {
  it('emits a radialGradient whose transform stretches the circle to the CSS ellipse', () => {
    const svg = glowGradientSvg(parseGlowLayer(LAYER)!, 'glow0')
    expect(svg).toContain('id="glow0"')
    expect(svg).toContain('r="1.2"')
    // ry/rx = 80/120
    expect(svg).toContain('scale(1,0.6667)')
    expect(svg).toContain('stop-opacity="0.3"')
    expect(svg).toContain('stop-opacity="0"')
  })
})
