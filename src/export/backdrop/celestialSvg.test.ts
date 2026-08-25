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
})
