import { describe, expect, it } from 'vitest'
import {
  applyTheme,
  BUILTIN_THEMES,
  contrastRatio,
  darken,
  relativeLuminance,
  stageColor,
  DEFAULT_THEME,
  resolveTheme,
  SLIDE_BODY_FONT,
  SLIDE_FONT_VARS,
  SLIDE_HEADING_FONT,
} from './theme-tokens'

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

function firstFamily(stack: string): string {
  return stack.split(',')[0].trim().replace(/^['"]|['"]$/g, '')
}

const SPACE_THEME_IDS = ['minimal', 'editorial', 'midnight', 'bold', 'sage']
const NEW_THEME_IDS = ['paper', 'chalk', 'blueprint', 'pop', 'boardroom']

describe('built-in themes', () => {
  it('ships the five space themes first, then paper, chalk, blueprint, pop and boardroom', () => {
    expect(BUILTIN_THEMES.map((t) => t.id)).toEqual([...SPACE_THEME_IDS, ...NEW_THEME_IDS])
    expect(BUILTIN_THEMES.map((t) => t.name).slice(5)).toEqual([
      'Paper',
      'Chalkboard',
      'Blueprint',
      'Pop',
      'Boardroom',
    ])
    expect(new Set(BUILTIN_THEMES.map((t) => t.id)).size).toBe(10)
  })

  // Text on the slide: body copy and the muted second voice must clear AA
  // against the ground, and ink on a solid accent fill must too. The accent
  // itself is a mark and a large-heading colour, so it needs the 3:1 of large
  // text rather than 4.5.
  it('keeps the text pairings of every new theme at AA', () => {
    for (const id of NEW_THEME_IDS) {
      const { colors } = BUILTIN_THEMES.find((t) => t.id === id)!
      expect(contrastRatio(colors.foreground, colors.background), `${id} foreground`).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(colors.muted, colors.background), `${id} muted`).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(colors.foreground, colors.surface), `${id} foreground on surface`).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(colors.accentForeground, colors.accent), `${id} on accent`).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(colors.accent, colors.background), `${id} accent`).toBeGreaterThanOrEqual(3)
      // The numbered badges are a gradient from accent to accentSoft carrying
      // accentForeground, so the soft end has to hold the ink too.
      expect(contrastRatio(colors.accentForeground, colors.accentSoft), `${id} on accentSoft`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('gives each new theme its own web font, named by a stack whose first family is the real face', () => {
    const faces = Object.fromEntries(
      NEW_THEME_IDS.map((id) => {
        const { typography } = BUILTIN_THEMES.find((t) => t.id === id)!
        return [id, [firstFamily(typography.headingFont), firstFamily(typography.bodyFont)]]
      }),
    )
    // The PPTX export names a face by the first family, so it has to be the
    // family PowerPoint knows, not Fontsource's "... Variable" alias.
    expect(faces).toEqual({
      paper: ['Source Serif 4', 'Source Serif 4'],
      chalk: ['Caveat', 'Atkinson Hyperlegible'],
      blueprint: ['JetBrains Mono', 'Atkinson Hyperlegible'],
      pop: ['Bricolage Grotesque', 'Bricolage Grotesque'],
      boardroom: ['Hanken Grotesk', 'Hanken Grotesk'],
    })
  })

  // A theme naming a face nothing loads falls back silently to the next family
  // in its stack, which is exactly the "why does Chalkboard look like Arial"
  // bug. Every web font a new theme names must be imported by the entry.
  it('loads every web font a new theme names', () => {
    const entry = (import.meta.glob('../main.tsx', { query: '?raw', import: 'default', eager: true }) as Record<
      string,
      string
    >)['../main.tsx']
    const packageFor: Record<string, string> = {
      'Source Serif 4': '@fontsource-variable/source-serif-4',
      Caveat: '@fontsource/caveat',
      'Atkinson Hyperlegible': '@fontsource/atkinson-hyperlegible',
      'JetBrains Mono': '@fontsource-variable/jetbrains-mono',
      'Bricolage Grotesque': '@fontsource-variable/bricolage-grotesque',
      'Hanken Grotesk': '@fontsource-variable/hanken-grotesk',
    }
    for (const id of NEW_THEME_IDS) {
      const { typography } = BUILTIN_THEMES.find((t) => t.id === id)!
      for (const stack of [typography.headingFont, typography.bodyFont]) {
        const family = firstFamily(stack)
        expect(entry, `${id}: ${family}`).toContain(`'${packageFor[family]}`)
        // The variable packages register "<Family> Variable"; the stack must name it.
        if (packageFor[family].includes('-variable/')) expect(stack).toContain(`${family} Variable`)
      }
    }
  })

  it('gives every theme a complete palette and a celestial identity', () => {
    for (const theme of BUILTIN_THEMES) {
      expect(theme.celestial.glow).toContain('gradient')
      for (const value of Object.values(theme.colors)) {
        expect(value).toMatch(/^#[0-9a-f]{6}$/)
      }
    }
  })

  it('every built-in theme has presentation-sized type', () => {
    for (const theme of BUILTIN_THEMES) {
      const [h1, h2, h3, body] = theme.typography.scale
      expect(h1, `${theme.id} h1`).toBeGreaterThanOrEqual(3.25)
      expect(h2, `${theme.id} h2`).toBeGreaterThanOrEqual(2.25)
      expect(h3, `${theme.id} h3`).toBeGreaterThanOrEqual(1.5)
      expect(body, `${theme.id} body`).toBeGreaterThanOrEqual(1.2)
    }
  })

  const DECOR_KINDS = ['stars', 'orbits', 'bodies', 'constellation', 'grid'] as const

  // The restraint rule: a theme picks the two or three elements that carry its
  // mood. One that reached for all of them would collapse the distinction
  // between the five space themes. The later five (paper, chalk, blueprint,
  // pop, boardroom) are not celestial and say what they are in glow layers, so
  // the rule is about the original five.
  it('never stacks every decorative element into one space theme', () => {
    for (const theme of BUILTIN_THEMES.filter((t) => SPACE_THEME_IDS.includes(t.id))) {
      const used = DECOR_KINDS.filter((key) => theme.celestial[key] !== undefined)
      expect(used.length).toBeGreaterThan(0)
      expect(used.length).toBeLessThan(DECOR_KINDS.length)
    }
  })

  it('never stacks every decorative element into any theme', () => {
    for (const theme of BUILTIN_THEMES) {
      const used = DECOR_KINDS.filter((key) => theme.celestial[key] !== undefined)
      expect(used.length, theme.id).toBeLessThan(DECOR_KINDS.length)
    }
  })

  it('gives every theme its own atmospheric treatment', () => {
    const glows = BUILTIN_THEMES.map((t) => t.celestial.glow)
    expect(new Set(glows).size).toBe(BUILTIN_THEMES.length)
  })
})

/*
  The slide font tokens, and the one mistake that silently disables all of them.

  `--font-slide-heading` / `--font-slide-body` are Tailwind `@theme inline`
  aliases, and an alias is declared once on `:root` as `var(--slide-font-*)`. A
  custom property's `var()` is substituted at the element that *declares* it, so
  the alias computes to the `:root` font and inherits everywhere as that literal
  string. Every scoped override — `applyTheme` on the ThemeProvider element,
  `TextStyleScope` per card, `Adjustable` per element — writes `--slide-font-*`,
  which the alias never reads again.

  Colours escape this because `bg-slide-*` is a Tailwind *utility*, and `inline`
  makes a utility reference `var(--slide-background)` directly. Fonts are set in
  hand-written inline styles instead, so they hit the aliased declaration and
  froze on the `:root` value: no theme font, and no font the toolbar picked, ever
  reached a slide.
*/
describe('slide font tokens', () => {
  it('applies the theme fonts under the names the slide components read', () => {
    const { element, props } = fakeElement()
    applyTheme(DEFAULT_THEME, element)

    expect(props.get(SLIDE_FONT_VARS.heading)).toBe(DEFAULT_THEME.typography.headingFont)
    expect(props.get(SLIDE_FONT_VARS.body)).toBe(DEFAULT_THEME.typography.bodyFont)
    expect(SLIDE_HEADING_FONT).toBe(`var(${SLIDE_FONT_VARS.heading})`)
    expect(SLIDE_BODY_FONT).toBe(`var(${SLIDE_FONT_VARS.body})`)
  })

  it('is never read through the Tailwind alias, which cannot see a scoped override', () => {
    const offenders = readSlideSources().filter(({ source }) =>
      /var\(\s*--font-slide-(heading|body)\s*\)/.test(source),
    )
    expect(offenders.map(({ file }) => file)).toEqual([])
  })
})

/**
 * Every component that draws a slide, as source text.
 *
 * Read through Vite's own glob rather than `node:fs` — this project's tsconfig
 * types are `vite/client` only, and a test is not a reason to pull in the whole
 * node type surface.
 */
function readSlideSources(): { file: string; source: string }[] {
  const sources = import.meta.glob('../components/**/*.{ts,tsx}', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>
  return Object.entries(sources).map(([file, source]) => ({ file, source }))
}

describe('contrast and the stage colour', () => {
  it('measures luminance and contrast the WCAG way', () => {
    expect(relativeLuminance('#000000')).toBe(0)
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 5)
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1)
    expect(contrastRatio('#123456', '#123456')).toBe(1)
  })

  it('derives the stage from the same tokens applyTheme paints', () => {
    const { element, props } = fakeElement()
    applyTheme(DEFAULT_THEME, element)
    expect(props.get('--slide-canvas-background')).toBe(stageColor(DEFAULT_THEME))
  })
})
