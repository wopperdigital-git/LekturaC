import { describe, expect, it } from 'vitest'
import { applyTheme, BUILTIN_THEMES, darken, DEFAULT_THEME, resolveTheme } from './theme-tokens'

describe('darken', () => {
  it('reduces lightness while preserving hue and saturation', () => {
    expect(darken('#4f46e5', 10)).toBe('#291fd9')
  })

  it('clamps at black instead of wrapping', () => {
    expect(darken('#000000', 50)).toBe('#000000')
  })

  it('is a no-op at amount 0', () => {
    expect(darken('#4f46e5', 0)).toBe('#4f46e5')
  })
})

function fakeElement() {
  const props = new Map<string, string>()
  return {
    element: { style: { setProperty: (k: string, v: string) => props.set(k, v) } } as unknown as HTMLElement,
    props,
  }
}

describe('applyTheme', () => {
  it('writes every slide-* token derived from the theme', () => {
    const { element, props } = fakeElement()
    applyTheme(DEFAULT_THEME, element)

    expect(props.get('--slide-background')).toBe(DEFAULT_THEME.colors.background)
    expect(props.get('--slide-accent')).toBe(DEFAULT_THEME.colors.accent)
    expect(props.get('--slide-size-h1')).toBe(`${DEFAULT_THEME.typography.scale[0]}rem`)
    expect(props.get('--spacing')).toBe(`${DEFAULT_THEME.spacing.unit}rem`)
  })

  it('derives the canvas background as a darkened version of the theme background', () => {
    const { element, props } = fakeElement()
    applyTheme(DEFAULT_THEME, element)

    expect(props.get('--slide-canvas-background')).toBe(darken(DEFAULT_THEME.colors.background, 5))
    expect(props.get('--slide-canvas-background')).not.toBe(DEFAULT_THEME.colors.background)
  })

  it('produces a valid canvas background for every built-in theme', () => {
    for (const theme of BUILTIN_THEMES) {
      const { element, props } = fakeElement()
      applyTheme(theme, element)
      expect(props.get('--slide-canvas-background')).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it('writes the celestial backdrop as a token so the glow follows the theme', () => {
    for (const theme of BUILTIN_THEMES) {
      const { element, props } = fakeElement()
      applyTheme(theme, element)
      expect(props.get('--slide-backdrop-image')).toBe(theme.celestial.glow)
      expect(props.get('--slide-accent-soft')).toBe(theme.colors.accentSoft)
    }
  })
})

describe('resolveTheme', () => {
  /*
    Deck rows store the whole theme as JSON, so a deck saved before a redesign
    carries the older shape. Resolving by id is what lets an existing deck pick
    up the current design instead of rendering a theme with no `celestial` at
    all — which would throw the moment the backdrop read it.
  */
  it('resolves a stored theme back to the current preset with that id', () => {
    const stale = { id: 'midnight', name: 'Midnight', colors: { background: '#0b0c10' } }
    const resolved = resolveTheme(stale)
    expect(resolved).toBe(BUILTIN_THEMES.find((t) => t.id === 'midnight'))
    expect(resolved.celestial.glow).toBeTruthy()
    expect(resolved.name).toBe('Deep Space')
  })

  it('falls back to the default theme for anything unrecognizable', () => {
    expect(resolveTheme(null)).toBe(DEFAULT_THEME)
    expect(resolveTheme(undefined)).toBe(DEFAULT_THEME)
    expect(resolveTheme({})).toBe(DEFAULT_THEME)
    expect(resolveTheme({ id: 'deleted-custom-theme' })).toBe(DEFAULT_THEME)
  })
})

describe('built-in themes', () => {
  it('gives every theme a complete palette and a celestial identity', () => {
    for (const theme of BUILTIN_THEMES) {
      expect(theme.celestial.glow).toContain('gradient')
      for (const value of Object.values(theme.colors)) {
        expect(value).toMatch(/^#[0-9a-f]{6}$/)
      }
    }
  })

  const DECOR_KINDS = ['stars', 'orbits', 'bodies', 'constellation', 'grid'] as const

  // The restraint rule: a theme picks the two or three elements that carry its
  // mood. One that reached for all of them would collapse the distinction
  // between the five themes.
  it('never stacks every decorative element into one theme', () => {
    for (const theme of BUILTIN_THEMES) {
      const used = DECOR_KINDS.filter((key) => theme.celestial[key] !== undefined)
      expect(used.length).toBeGreaterThan(0)
      expect(used.length).toBeLessThan(DECOR_KINDS.length)
    }
  })

  it('gives every theme its own atmospheric treatment', () => {
    const glows = BUILTIN_THEMES.map((t) => t.celestial.glow)
    expect(new Set(glows).size).toBe(BUILTIN_THEMES.length)
  })
})
