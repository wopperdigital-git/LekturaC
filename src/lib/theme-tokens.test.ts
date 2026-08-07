import { describe, expect, it } from 'vitest'
import { applyTheme, BUILTIN_THEMES, darken, DEFAULT_THEME } from './theme-tokens'

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
})
