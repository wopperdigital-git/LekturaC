import { describe, expect, it } from 'vitest'
import { bodyGradientSvg, glowGradientSvg, parseBodyGradient, parseGlow, parseGlowLayer } from './glow'
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

// A body's `fill` is a different grammar from a glow layer: always
// `radial-gradient(circle at X% Y%, ...)`, with two or more stops that may be
// `#rrggbb` or `rgba(...)`, rather than exactly two `rgba(...)` stops.
describe('parseBodyGradient', () => {
  it('reads centre and every stop, hex and rgba alike', () => {
    const parsed = parseBodyGradient(
      'radial-gradient(circle at 36% 32%, #ffffff 0%, #f4f1ff 48%, rgba(214,208,255,0.35) 74%, rgba(214,208,255,0) 100%)',
    )
    expect(parsed).toEqual({
      cx: 36,
      cy: 32,
      stops: [
        { color: '#ffffff', opacity: 1, offset: 0 },
        { color: '#f4f1ff', opacity: 1, offset: 48 },
        { color: 'rgb(214,208,255)', opacity: 0.35, offset: 74 },
        { color: 'rgb(214,208,255)', opacity: 0, offset: 100 },
      ],
    })
  })

  it('returns null rather than throwing on a shape it cannot read', () => {
    expect(parseBodyGradient('linear-gradient(red, blue)')).toBeNull()
    expect(parseBodyGradient('')).toBeNull()
    // Not `circle at` — the glow ellipse grammar, not the body grammar.
    expect(
      parseBodyGradient('radial-gradient(120% 80% at 50% 50%, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 50%)'),
    ).toBeNull()
    // Only one stop.
    expect(parseBodyGradient('radial-gradient(circle at 50% 50%, #ffffff 0%)')).toBeNull()
    // An unreadable stop poisons the whole gradient rather than being skipped.
    expect(
      parseBodyGradient('radial-gradient(circle at 50% 50%, not-a-colour 0%, #ffffff 100%)'),
    ).toBeNull()
  })

  it('parses every built-in theme body that declares one', () => {
    for (const theme of BUILTIN_THEMES) {
      for (const body of theme.celestial.bodies ?? []) {
        expect(parseBodyGradient(body.fill), theme.id).not.toBeNull()
      }
    }
  })
})

describe('bodyGradientSvg', () => {
  it('uses the CSS farthest-corner default radius for a centred body', () => {
    const svg = bodyGradientSvg({ cx: 50, cy: 50, stops: [] }, 'body0')
    // sqrt(0.5^2 + 0.5^2)
    expect(svg).toContain('r="0.7071"')
  })

  it('uses the CSS farthest-corner default radius for an off-centre body', () => {
    const svg = bodyGradientSvg({ cx: 36, cy: 32, stops: [] }, 'body0')
    // max distance to (1,1): sqrt(0.64^2 + 0.68^2)
    expect(svg).toContain('r="0.9338"')
  })

  it('emits one stop per gradient stop, in order', () => {
    const svg = bodyGradientSvg(
      {
        cx: 50,
        cy: 50,
        stops: [
          { color: '#ffffff', opacity: 1, offset: 0 },
          { color: 'rgb(1,2,3)', opacity: 0.4, offset: 100 },
        ],
      },
      'body0',
    )
    expect(svg).toContain('id="body0"')
    expect(svg.indexOf('stop-color="#ffffff"')).toBeLessThan(svg.indexOf('stop-color="rgb(1,2,3)"'))
    expect(svg).toContain('stop-opacity="0.4"')
  })
})
