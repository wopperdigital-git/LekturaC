import { describe, expect, it } from 'vitest'
import { BUILTIN_THEMES, deepMuted, type ThemeTokens } from '@/lib/theme-tokens'
import type { Card } from '@/engine/contentBlocks'
import { groundColors, groundTheme, withoutStoredColors } from './ground'

const themeOf = (id: string): ThemeTokens => BUILTIN_THEMES.find((t) => t.id === id)!

describe.each([
  ['a light theme', 'bordo'],
  ['a dark theme', 'midnight'],
])('groundColors on %s', (_name, id) => {
  const theme = themeOf(id)
  const c = theme.colors

  it('keeps the theme own four on a plain ground', () => {
    expect(groundColors(theme, 'plain')).toEqual({
      background: c.background,
      foreground: c.foreground,
      muted: c.muted,
      accent: c.accent,
    })
  })

  it('puts the tint behind the theme own inks on a tinted ground', () => {
    expect(groundColors(theme, 'tint')).toEqual({
      background: c.tint,
      foreground: c.foreground,
      muted: c.muted,
      accent: c.accent,
    })
  })

  it('moves background and ink together on a deep ground', () => {
    expect(groundColors(theme, 'deep')).toEqual({
      background: c.deep,
      foreground: c.deepForeground,
      muted: deepMuted(c),
      accent: c.deepForeground,
    })
  })
})

describe('groundTheme', () => {
  const theme = themeOf('bordo')

  it('is the theme itself for a plain ground', () => {
    expect(groundTheme(theme, 'plain')).toBe(theme)
  })

  it('re-points only the four colours the renderers read, leaving everything else', () => {
    const deep = groundTheme(theme, 'deep')
    expect(deep.colors.background).toBe(theme.colors.deep)
    expect(deep.colors.foreground).toBe(theme.colors.deepForeground)
    expect(deep.colors.muted).toBe(deepMuted(theme.colors))
    expect(deep.colors.accent).toBe(theme.colors.deepForeground)
    expect(deep.typography).toBe(theme.typography)
    expect(deep.colors.border).toBe(theme.colors.border)
  })
})

describe('withoutStoredColors', () => {
  const card: Card = {
    id: 'c',
    orderIndex: 0,
    layout: 'hero',
    visualStyle: 'structured',
    textStyle: { color: '#ff0000', bold: true },
    blocks: [{ type: 'heading', text: 'Title' }],
    inline: {
      '0': { style: { color: '#00ff00', underline: true } },
      '0:text': {
        style: { color: '#0000ff', italic: true },
        marks: [
          { type: 'bold', start: 0, end: 2 },
          { type: 'color', start: 0, end: 2, value: '#123456' },
        ],
      },
    },
  }

  it('drops every stored colour and keeps every other formatting choice', () => {
    const out = withoutStoredColors(card)
    expect(out.textStyle).toEqual({ bold: true })
    expect(out.inline?.['0']?.style).toEqual({ underline: true })
    expect(out.inline?.['0:text']?.style).toEqual({ italic: true })
    expect(out.inline?.['0:text']?.marks).toEqual([{ type: 'bold', start: 0, end: 2 }])
  })

  it('does not mutate its input', () => {
    withoutStoredColors(card)
    expect(card.textStyle?.color).toBe('#ff0000')
    expect(card.inline?.['0:text']?.marks).toHaveLength(2)
  })
})
