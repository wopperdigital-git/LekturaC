import { describe, expect, it } from 'vitest'
import { BACKDROP_HEIGHT, BACKDROP_WIDTH, celestialSvg } from './celestialSvg'
import { BUILTIN_THEMES, DEFAULT_THEME } from '@/lib/theme-tokens'

function themeById(id: string) {
  const found = BUILTIN_THEMES.find((t) => t.id === id)
  if (!found) throw new Error(`no theme ${id}`)
  return found
}

describe('celestialSvg', () => {
  it('emits a self-contained svg at the fixed backdrop size', () => {
    const svg = celestialSvg(DEFAULT_THEME)
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain(`viewBox="0 0 ${BACKDROP_WIDTH} ${BACKDROP_HEIGHT}"`)
    expect(svg.endsWith('</svg>')).toBe(true)
  })

  // Not a style preference: an external reference taints the canvas in
  // `rasterize.ts` and makes `toDataURL` throw. Note this cannot assert the
  // absence of the substring "http" — the required xmlns declaration contains
  // it — so it tests for the reference forms themselves.
  it('carries no external reference that could taint a canvas', () => {
    for (const theme of BUILTIN_THEMES) {
      const svg = celestialSvg(theme)
      expect(svg, theme.id).not.toContain('foreignObject')
      expect(svg, theme.id).not.toContain('<image')
      expect(svg, theme.id).not.toContain('href')
      expect(svg, theme.id).not.toContain('url(http')
      expect(svg, theme.id).not.toContain('@import')
    }
  })

  it('paints the theme background as the ground layer', () => {
    expect(celestialSvg(DEFAULT_THEME)).toContain(DEFAULT_THEME.colors.background)
  })

  it('is deterministic for a theme, so a re-export cannot reshuffle the sky', () => {
    expect(celestialSvg(DEFAULT_THEME)).toBe(celestialSvg(DEFAULT_THEME))
  })

  it('gives different themes different skies', () => {
    expect(celestialSvg(themeById('midnight'))).not.toBe(celestialSvg(themeById('sage')))
  })

  it('draws one circle per star', () => {
    const theme = themeById('midnight')
    const svg = celestialSvg(theme)
    const stars = svg.split('class="star"').length - 1
    expect(stars).toBe(theme.celestial.stars?.count)
  })

  /*
    The restraint rule: each theme uses two or three decorative kinds, never
    all of them, and that is what keeps five themes from reading as one theme
    in five palettes. `theme-tokens.test.ts` holds the line on the data; this
    holds it on the export, so a theme cannot declare one thing and export
    another.
  */
  it('emits exactly the decor kinds each theme declares, and no others', () => {
    for (const theme of BUILTIN_THEMES) {
      const svg = celestialSvg(theme)
      const decor = theme.celestial
      expect(svg.includes('class="grid"'), `${theme.id} grid`).toBe(Boolean(decor.grid))
      expect(svg.includes('class="orbit"'), `${theme.id} orbits`).toBe(Boolean(decor.orbits?.length))
      expect(svg.includes('class="body"'), `${theme.id} bodies`).toBe(Boolean(decor.bodies?.length))
      expect(svg.includes('class="star"'), `${theme.id} stars`).toBe(Boolean(decor.stars))
      expect(svg.includes('class="constellation"'), `${theme.id} constellation`).toBe(
        Boolean(decor.constellation),
      )
    }
  })

  // SVG's `fill` attribute takes a colour or a `url(#id)` paint-server
  // reference, never a CSS gradient function directly — a body's `fill` is a
  // `radial-gradient(...)` in every theme that declares bodies, so writing it
  // into `fill="..."` as-is would paint as invalid (black). Every such body
  // must instead reference a real `<radialGradient>` def.
  it('renders each body as a real radialGradient, never a raw gradient string in fill', () => {
    for (const theme of BUILTIN_THEMES) {
      const bodies = theme.celestial.bodies
      if (!bodies?.length) continue
      const svg = celestialSvg(theme)
      expect(svg, theme.id).not.toContain('fill="radial-gradient')
      expect(svg, theme.id).toContain('<radialGradient')
      // One url(#bodyfill<i>) reference per body, each backed by a def.
      for (let i = 0; i < bodies.length; i++) {
        const id = `bodyfill${i}`
        expect(svg, `${theme.id} body ${i}`).toContain(`fill="url(#${id})"`)
        expect(svg, `${theme.id} body ${i}`).toContain(`<radialGradient id="${id}"`)
      }
    }
  })

  // CSS paints the first `background-image` layer closest to the viewer; SVG
  // paints the last element in the document on top. The rects have to be
  // emitted in reverse of the parsed layer order so layer 0 still ends up on
  // top here, matching what `SlideBackdrop` shows on screen — otherwise every
  // overlap's blended colour comes out wrong.
  it('paints glow layers back to front, so layer 0 ends up on top as it does in CSS', () => {
    const svg = celestialSvg(DEFAULT_THEME) // Moonlight: 3 glow layers
    const at0 = svg.indexOf('fill="url(#glow0)"')
    const at1 = svg.indexOf('fill="url(#glow1)"')
    const at2 = svg.indexOf('fill="url(#glow2)"')
    expect(at0, 'glow0 rect present').toBeGreaterThan(-1)
    expect(at1, 'glow1 rect present').toBeGreaterThan(-1)
    expect(at2, 'glow2 rect present').toBeGreaterThan(-1)
    // Reversed order: glow2, then glow1, then glow0.
    expect(at2).toBeLessThan(at1)
    expect(at1).toBeLessThan(at0)
  })

  // The on-screen CSS grid tiles from `background-position: 0 0`, so it draws
  // a line at the top and left edge; a loop starting at `pitch` instead of 0
  // would omit both.
  it('draws the grid line at the top and left edge, not just interior lines', () => {
    const svg = celestialSvg(themeById('editorial'))
    expect(svg).toContain(`<line x1="0" y1="0" x2="0" y2="${BACKDROP_HEIGHT}"/>`)
    expect(svg).toContain(`<line x1="0" y1="0" x2="${BACKDROP_WIDTH}" y2="0"/>`)
  })
})
