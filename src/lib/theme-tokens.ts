import type { CelestialDecor } from './celestial'
export type { CelestialDecor } from './celestial'

export interface ThemeTokens {
  id: string
  name: string
  typography: {
    headingFont: string
    bodyFont: string
    /** [h1, h2, h3, body] sizes in rem */
    scale: [number, number, number, number]
    lineHeight: number
    letterSpacing: number
  }
  colors: {
    background: string
    foreground: string
    accent: string
    /** Ink for text sitting on top of a solid `accent` fill. */
    accentForeground: string
    /** The second accent — a lighter companion to `accent`, for two-tone markers and rules. */
    accentSoft: string
    muted: string
    border: string
    surface: string
    /** The dark ground a title slide is drawn on. */
    deep: string
    /** Ink for text sitting on the `deep` ground. */
    deepForeground: string
    /** A light (or, on a dark theme, a lifted) ground for a quote or a stat hero. */
    tint: string
  }
  spacing: {
    /** base spacing unit in rem; drives every Tailwind spacing utility (p-*, gap-*, m-*) */
    unit: number
  }
  shape: {
    radius: number
    radiusSm: number
    shadow: 'none' | 'soft' | 'hard' | 'glow' | 'flare'
  }
  /** The theme's celestial identity — see `lib/celestial.ts`. */
  celestial: CelestialDecor
}

// `soft` and `hard` are black-based and go invisible on a dark card, so the two
// dark themes get their own: a violet halo for Deep Space, an amber offset for
// Solar Flare.
const SHADOW_VALUES: Record<ThemeTokens['shape']['shadow'], string> = {
  none: 'none',
  soft: '0 2px 6px rgba(0,0,0,0.05), 0 12px 28px rgba(0,0,0,0.08)',
  hard: '4px 4px 0 0 rgba(0,0,0,0.9)',
  glow: '0 0 0 1px rgba(124,108,255,0.16), 0 24px 64px rgba(4,6,18,0.8)',
  flare: '6px 6px 0 0 rgba(255,90,31,0.85)',
}

/** Canvas sits this many HSL lightness points below the theme background — a subtle, uniform tint in both light and dark themes. */
const CANVAS_DARKEN_AMOUNT = 5

/*
  The floating-card shadow, shared by every theme.

  Deliberately *not* `SHADOW_VALUES[shape.shadow]`: those are per-theme
  statements (Bold's hard 4px offset, Sage's orange flare) that were designed
  for a card sitting on a flat canvas. Now that the theme's decoration lives
  behind the cards, an offset slab reads as a sticker on top of the artwork
  rather than a panel floating above it, so all five themes share one restrained
  elevation instead.

  Three stacked layers do the lifting — a tight contact shadow, a mid diffusion,
  and a wide ambient one — which is what separates a modern floating surface
  from a single blurred drop shadow. The leading hairline ring is what keeps the
  card readable on the dark themes, where a black shadow has nothing to darken.
*/
const CARD_SHADOW = [
  '0 0 0 1px color-mix(in srgb, var(--slide-border) 45%, transparent)',
  '0 1px 2px rgba(0, 0, 0, 0.05)',
  '0 6px 16px rgba(0, 0, 0, 0.09)',
  '0 20px 44px rgba(0, 0, 0, 0.12)',
].join(', ')

function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  const l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0)
        break
      case g:
        h = (b - r) / d + 2
        break
      default:
        h = (r - g) / d + 4
    }
    h /= 6
  }
  return [h * 360, s * 100, l * 100]
}

function hslToHex(h: number, s: number, l: number): string {
  const sN = s / 100
  const lN = l / 100
  const c = (1 - Math.abs(2 * lN - 1)) * sN
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = lN - c / 2
  let [r, g, b] = [0, 0, 0]
  if (h < 60) [r, g, b] = [c, x, 0]
  else if (h < 120) [r, g, b] = [x, c, 0]
  else if (h < 180) [r, g, b] = [0, c, x]
  else if (h < 240) [r, g, b] = [0, x, c]
  else if (h < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  const toHex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

/** Darkens a hex color by `amount` HSL-lightness points (clamped at 0), preserving hue/saturation. */
export function darken(hex: string, amount: number): string {
  const [h, s, l] = hexToHsl(hex)
  return hslToHex(h, s, Math.max(0, l - amount))
}

/**
 * The colour of the ground a deck's cards sit on — the stage — for a theme.
 * The same derivation `applyTheme` writes as `--slide-canvas-background`, so what
 * is measured against and what is painted cannot disagree.
 */
export function stageColor(theme: Pick<ThemeTokens, 'colors'>): string {
  return darken(theme.colors.background, CANVAS_DARKEN_AMOUNT)
}

/** WCAG relative luminance of a `#rrggbb`: 0 for black, 1 for white. */
export function relativeLuminance(hex: string): number {
  const value = hex.replace(/^#/, '')
  const channel = (i: number) => {
    const c = parseInt(value.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4)
}

/** WCAG contrast ratio between two `#rrggbb` colours, from 1 (identical) to 21 (black on white). */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x)
  return (light + 0.05) / (dark + 0.05)
}

/** Mixes two `#rrggbb` colours channel by channel in sRGB; `weightA` (0 to 1) is how much of `a` is kept. */
export function mixHex(a: string, b: string, weightA: number): string {
  const channel = (hex: string, i: number) => parseInt(hex.slice(i, i + 2), 16)
  const mixed = (i: number) =>
    Math.round(channel(a, i) * weightA + channel(b, i) * (1 - weightA))
      .toString(16)
      .padStart(2, '0')
  return `#${mixed(1)}${mixed(3)}${mixed(5)}`
}

/** How much of the ink survives in muted text on the deep ground. */
export const DEEP_MUTED_WEIGHT = 0.72

/** Muted text on the deep ground: the deep ink pulled toward the ground. Derived, so no theme stores it. */
export function deepMuted(colors: Pick<ThemeTokens['colors'], 'deep' | 'deepForeground'>): string {
  return mixHex(colors.deepForeground, colors.deep, DEEP_MUTED_WEIGHT)
}

/**
 * Writes a ThemeTokens object onto `root` as --slide-* CSS custom properties,
 * scoped to that element (never document.documentElement) so it only affects
 * descendants — the slide content rendered inside a ThemeProvider wrapper.
 *
 * Also overrides Tailwind's own `--spacing` multiplier on that same scope, so
 * a theme's spacing density affects only the slides it wraps, never app chrome.
 *
 * Writes the *theme's* typography only. The editor toolbar's overrides are
 * applied per card by `components/theme/TextStyleScope`, which layers inline
 * custom properties over whatever this wrote — keeping this function a pure
 * function of the theme, and keeping deck/card precedence in one place.
 */
/**
 * The custom properties carrying a slide's two fonts.
 *
 * Named once here because three different scopes write them — `applyTheme`
 * below, `TextStyleScope` per card, `Adjustable` per element — and every layout
 * reads them. Deriving the `var(...)` readers from the same constants is what
 * keeps a writer and a reader from drifting onto different property names, which
 * is exactly how the fonts came to be unchangeable: the layouts were reading a
 * Tailwind `@theme inline` alias instead. An alias is declared on `:root`, and a
 * custom property's `var()` is substituted where it is *declared*, so it froze
 * on the `:root` font and never saw a single scoped override. Read these, not
 * `var(--font-slide-*)`.
 */
export const SLIDE_FONT_VARS = {
  heading: '--slide-font-heading',
  body: '--slide-font-body',
} as const

/** The heading font, for a `fontFamily` on any element inside a slide. */
export const SLIDE_HEADING_FONT = `var(${SLIDE_FONT_VARS.heading})`
/** The body font. Every element of a card that carries words should set one of the two. */
export const SLIDE_BODY_FONT = `var(${SLIDE_FONT_VARS.body})`

/** Steps that are ratios of the body size, resolved where they are used so an element's own size carries. */
export const SLIDE_SIZE = {
  eyebrow: 'calc(var(--slide-size-body) * 0.65)',
  lead: 'calc(var(--slide-size-body) * 1.2)',
  caption: 'calc(var(--slide-size-body) * 0.7)',
} as const

/** The gap scale layouts use between slide elements; the values live on `:root` in index.css. */
export const SLIDE_GAP = {
  tight: 'var(--slide-gap-tight)',
  group: 'var(--slide-gap-group)',
  section: 'var(--slide-gap-section)',
} as const

export function applyTheme(theme: ThemeTokens, root: HTMLElement) {
  const { typography, colors, spacing, shape } = theme
  const [h1, h2, h3, body] = typography.scale
  const headingFont = typography.headingFont
  const bodyFont = typography.bodyFont

  const vars: Record<string, string> = {
    '--slide-background': colors.background,
    '--slide-canvas-background': darken(colors.background, CANVAS_DARKEN_AMOUNT),
    '--slide-foreground': colors.foreground,
    '--slide-accent': colors.accent,
    '--slide-accent-foreground': colors.accentForeground,
    '--slide-accent-soft': colors.accentSoft,
    '--slide-muted': colors.muted,
    '--slide-border': colors.border,
    '--slide-surface': colors.surface,
    '--slide-ground-deep': colors.deep,
    '--slide-ground-deep-foreground': colors.deepForeground,
    '--slide-ground-deep-muted': deepMuted(colors),
    '--slide-ground-tint': colors.tint,

    [SLIDE_FONT_VARS.heading]: headingFont,
    [SLIDE_FONT_VARS.body]: bodyFont,

    '--slide-size-h1': `${h1}rem`,
    '--slide-size-h2': `${h2}rem`,
    '--slide-size-h3': `${h3}rem`,
    '--slide-size-body': `${body}rem`,
    '--slide-line-height': String(typography.lineHeight),
    '--slide-letter-spacing': `${typography.letterSpacing}px`,

    '--slide-radius': `${shape.radius}rem`,
    '--slide-radius-sm': `${shape.radiusSm}rem`,
    '--slide-shadow': SHADOW_VALUES[shape.shadow],
    '--slide-card-shadow': CARD_SHADOW,

    // The atmospheric layer. Structured decoration (stars, orbits, bodies) can't
    // be a custom property, so `SlideBackdrop` reads it off the theme object via
    // ThemeProvider's context instead.
    '--slide-backdrop-image': theme.celestial.glow,

    '--spacing': `${spacing.unit}rem`,
  }

  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value)
  }
}

/*
  Ten themes: five celestial, then five that are not (see below). Each celestial one owns a distinct palette, a distinct atmospheric
  treatment, and its own two or three decorative elements — the restraint is the
  design. A theme carrying stars *and* constellations *and* orbits *and* a grid
  would stop being distinguishable from its neighbours.

  Every backdrop is built from gradients and shapes, never a photograph, so it
  stays crisp at any card size and never competes with the text on top of it.
*/
export const BUILTIN_THEMES: ThemeTokens[] = [
  {
    id: 'minimal',
    name: 'Moonlight',
    typography: {
      headingFont: "'Inter', system-ui, sans-serif",
      bodyFont: "'Inter', system-ui, sans-serif",
      scale: [3.5, 2.5, 1.625, 1.25],
      lineHeight: 1.55,
      letterSpacing: -0.2,
    },
    colors: {
      background: '#f7f5fa',
      foreground: '#17151c',
      accent: '#6c63ff',
      accentForeground: '#0d0a14',
      accentSoft: '#a9a3ff',
      muted: '#6f6a78',
      border: '#e4e0ee',
      surface: '#fdfcff',
      deep: '#2a2550',
      deepForeground: '#f1eefb',
      tint: '#f0edf7',
    },
    spacing: { unit: 0.26 },
    shape: { radius: 1, radiusSm: 0.5, shadow: 'soft' },
    // Quiet moonlight: one moon, a scatter of faint stars, and nothing else.
    // The lightest theme, so the glow has to stay well under the text.
    celestial: {
      glow: [
        'radial-gradient(120% 80% at 80% -12%, rgba(169,163,255,0.30) 0%, rgba(169,163,255,0) 58%)',
        'radial-gradient(95% 65% at 8% 110%, rgba(108,99,255,0.11) 0%, rgba(108,99,255,0) 62%)',
        'radial-gradient(65% 50% at 46% 44%, rgba(255,255,255,0.75) 0%, rgba(255,255,255,0) 100%)',
      ].join(', '),
      stars: { count: 16, color: '#8f87c9', maxRadiusPx: 1.7, opacity: 0.5, avoidCenter: true },
      bodies: [
        {
          cx: 83,
          cy: 15,
          size: 15,
          fill: 'radial-gradient(circle at 36% 32%, #ffffff 0%, #f4f1ff 48%, rgba(214,208,255,0.35) 74%, rgba(214,208,255,0) 100%)',
          opacity: 0.95,
        },
      ],
    },
  },
  {
    id: 'editorial',
    name: 'Cosmic Observatory',
    typography: {
      headingFont: "'Georgia', 'Times New Roman', serif",
      bodyFont: "'Inter', system-ui, sans-serif",
      scale: [3.5, 2.5, 1.625, 1.25],
      lineHeight: 1.6,
      letterSpacing: 0,
    },
    colors: {
      background: '#f5efe5',
      foreground: '#201b18',
      accent: '#b85c16',
      accentForeground: '#fffdf8',
      accentSoft: '#d49a62',
      muted: '#6f6257',
      border: '#e0d5c3',
      surface: '#fbf6ec',
      deep: '#3d2a1c',
      deepForeground: '#f5efe5',
      tint: '#ece2d0',
    },
    spacing: { unit: 0.3 },
    shape: { radius: 0.375, radiusSm: 0.25, shadow: 'none' },
    // A page from an old astronomy book: a ruled chart grid, two plotted
    // constellations, orbital arcs, and warm cosmic dust in the corners.
    celestial: {
      glow: [
        'radial-gradient(100% 70% at 88% 4%, rgba(184,92,22,0.11) 0%, rgba(184,92,22,0) 56%)',
        'radial-gradient(85% 60% at 4% 98%, rgba(118,105,93,0.13) 0%, rgba(118,105,93,0) 60%)',
        'radial-gradient(140% 110% at 50% 50%, rgba(245,239,229,0) 52%, rgba(32,27,24,0.055) 100%)',
      ].join(', '),
      grid: { color: '#201b18', opacity: 0.05, sizePx: 64 },
      stars: { count: 9, color: '#76695d', maxRadiusPx: 1.3, opacity: 0.5, avoidCenter: true },
      orbits: [
        { cx: 90, cy: 12, size: 34, color: '#b85c16', opacity: 0.28, widthPx: 1, dashed: true },
        { cx: 8, cy: 94, size: 46, color: '#76695d', opacity: 0.22, widthPx: 1 },
      ],
      constellation: {
        color: '#b85c16',
        opacity: 0.42,
        widthPx: 1,
        paths: [
          [
            [7, 12],
            [14, 22],
            [24, 17],
            [30, 28],
          ],
          [
            [78, 84],
            [86, 76],
            [94, 82],
          ],
        ],
      },
    },
  },
  {
    id: 'midnight',
    name: 'Deep Space',
    typography: {
      headingFont: "'Inter', system-ui, sans-serif",
      bodyFont: "'Inter', system-ui, sans-serif",
      scale: [3.5, 2.5, 1.625, 1.25],
      lineHeight: 1.55,
      letterSpacing: -0.2,
    },
    colors: {
      background: '#080b1a',
      foreground: '#f7f7ff',
      accent: '#7c6cff',
      accentForeground: '#0a0d1f',
      accentSoft: '#3fa9f5',
      muted: '#a9b2d0',
      border: '#242b4d',
      surface: '#121734',
      deep: '#1b1650',
      deepForeground: '#f0efff',
      tint: '#10152e',
    },
    spacing: { unit: 0.26 },
    shape: { radius: 1, radiusSm: 0.5, shadow: 'glow' },
    // The strongest of the five: three overlapping nebula fields in violet,
    // magenta and blue, and the densest star field. The last gradient is a
    // deliberate *darkening* of the card's center — the nebula has to stay out
    // from behind the headline, which is the only reason this reads as elegant
    // rather than busy.
    celestial: {
      glow: [
        'radial-gradient(120% 85% at 16% 6%, rgba(124,108,255,0.32) 0%, rgba(124,108,255,0) 56%)',
        'radial-gradient(105% 80% at 88% 20%, rgba(179,108,255,0.24) 0%, rgba(179,108,255,0) 54%)',
        'radial-gradient(115% 90% at 64% 110%, rgba(63,169,245,0.22) 0%, rgba(63,169,245,0) 60%)',
        'radial-gradient(75% 55% at 44% 52%, rgba(8,11,26,0.82) 0%, rgba(8,11,26,0) 100%)',
      ].join(', '),
      stars: { count: 64, color: '#ffffff', maxRadiusPx: 1.9, opacity: 0.8 },
      bodies: [
        {
          cx: 88,
          cy: 86,
          size: 11,
          fill: 'radial-gradient(circle at 32% 30%, rgba(179,108,255,0.62) 0%, rgba(124,108,255,0.30) 55%, rgba(8,11,26,0) 78%)',
          opacity: 0.85,
        },
      ],
      orbits: [{ cx: 88, cy: 86, size: 26, color: '#3fa9f5', opacity: 0.16, widthPx: 1 }],
    },
  },
  {
    id: 'bold',
    name: 'Solar Flare',
    typography: {
      headingFont: "'Arial Black', system-ui, sans-serif",
      bodyFont: "'Inter', system-ui, sans-serif",
      scale: [3.25, 2.25, 1.5, 1.2],
      lineHeight: 1.45,
      letterSpacing: -0.5,
    },
    colors: {
      background: '#111111',
      foreground: '#f6f1ea',
      accent: '#ff5a1f',
      accentForeground: '#180a03',
      accentSoft: '#ffb000',
      muted: '#a8a29e',
      border: '#2f2f2f',
      surface: '#1c1a19',
      deep: '#3a1608',
      deepForeground: '#fbeee4',
      tint: '#1b1816',
    },
    spacing: { unit: 0.28 },
    shape: { radius: 0, radiusSm: 0, shadow: 'flare' },
    // A star sitting just off the bottom-right corner: the corona is the light
    // spilling back into frame and the rings are its orbital paths. The
    // gradients stop well short of the center, which is what keeps a solar
    // flare from turning into fire.
    celestial: {
      glow: [
        'radial-gradient(95% 95% at 104% 110%, rgba(255,90,31,0.44) 0%, rgba(255,90,31,0) 54%)',
        'radial-gradient(70% 70% at 100% 104%, rgba(255,176,0,0.38) 0%, rgba(255,176,0,0) 44%)',
        'radial-gradient(42% 42% at 100% 102%, rgba(255,226,122,0.36) 0%, rgba(255,226,122,0) 38%)',
        'radial-gradient(120% 100% at 14% 6%, rgba(255,90,31,0.08) 0%, rgba(255,90,31,0) 58%)',
      ].join(', '),
      stars: { count: 11, color: '#ffe27a', maxRadiusPx: 1.4, opacity: 0.38, avoidCenter: true },
      orbits: [
        { cx: 102, cy: 106, size: 62, color: '#ffb000', opacity: 0.3, widthPx: 2 },
        { cx: 102, cy: 106, size: 96, color: '#ff5a1f', opacity: 0.2, widthPx: 2 },
        { cx: 102, cy: 106, size: 134, color: '#ff5a1f', opacity: 0.1, widthPx: 2 },
      ],
    },
  },
  {
    id: 'sage',
    name: 'Aurora',
    typography: {
      headingFont: "'Inter', system-ui, sans-serif",
      bodyFont: "'Inter', system-ui, sans-serif",
      scale: [3.5, 2.5, 1.625, 1.25],
      lineHeight: 1.6,
      letterSpacing: 0,
    },
    colors: {
      background: '#f1f5f1',
      foreground: '#19332d',
      accent: '#4c8a72',
      accentForeground: '#07160f',
      accentSoft: '#86bfa2',
      muted: '#586a64',
      border: '#d6e2d9',
      surface: '#f0f5f1',
      deep: '#1d3b33',
      deepForeground: '#eef5ef',
      tint: '#e3ece4',
    },
    spacing: { unit: 0.3 },
    shape: { radius: 1.25, radiusSm: 0.6, shadow: 'soft' },
    // Seen from orbit: aurora bands drawn across the top of the card, and the
    // curve of a planet's limb rising into the bottom. The limb is one very
    // large disc mostly outside the frame, which is what gives the curve its
    // sense of scale.
    celestial: {
      glow: [
        'radial-gradient(120% 55% at 18% -10%, rgba(76,138,114,0.24) 0%, rgba(76,138,114,0) 60%)',
        'radial-gradient(100% 50% at 76% -6%, rgba(134,191,162,0.32) 0%, rgba(134,191,162,0) 56%)',
        'radial-gradient(90% 58% at 56% 2%, rgba(63,169,245,0.15) 0%, rgba(63,169,245,0) 54%)',
      ].join(', '),
      stars: { count: 13, color: '#61736d', maxRadiusPx: 1.5, opacity: 0.42, avoidCenter: true },
      bodies: [
        {
          cx: 50,
          cy: 172,
          size: 190,
          fill: 'radial-gradient(circle at 50% 22%, rgba(134,191,162,0.42) 0%, rgba(76,138,114,0.22) 34%, rgba(25,51,45,0.08) 62%)',
          opacity: 0.75,
        },
      ],
      // The atmosphere itself, as a hairline just above the limb.
      orbits: [{ cx: 50, cy: 172, size: 198, color: '#86bfa2', opacity: 0.5, widthPx: 1 }],
    },
  },
  /*
    The second five are not celestial: each is a different kind of surface (a
    ruled page, a board, a drawing, a poster, a handout). They carry their mood
    in `glow` layers, which is the one field every export path already reads
    (the PPTX backdrop parses its radial layers and drops the rest, so a
    stripe or a ruled line is screen-only there and nothing breaks).

    Their fonts are web fonts, loaded by `main.tsx`. The stack puts the real
    family first and Fontsource's "<Family> Variable" alias second: the browser
    finds the alias, and the PPTX export, which names a face by the first
    family, asks PowerPoint for a font it can actually have.
  */
  {
    id: 'paper',
    name: 'Paper',
    typography: {
      headingFont: "'Source Serif 4', 'Source Serif 4 Variable', Georgia, serif",
      bodyFont: "'Source Serif 4', 'Source Serif 4 Variable', Georgia, serif",
      scale: [3.5, 2.5, 1.625, 1.25],
      lineHeight: 1.6,
      letterSpacing: -0.1,
    },
    colors: {
      background: '#f6f1e7',
      foreground: '#1b1a17',
      accent: '#b3261e',
      accentForeground: '#fbf8f1',
      accentSoft: '#c2453c',
      muted: '#6b6458',
      border: '#ddd3bf',
      surface: '#fbf8f1',
      deep: '#5c1712',
      deepForeground: '#f6f1e7',
      tint: '#ede5d3',
    },
    spacing: { unit: 0.3 },
    shape: { radius: 0.125, radiusSm: 0.0625, shadow: 'soft' },
    // Ruled notebook paper: faint blue-grey lines every 40px (the card is laid
    // out at one width, so a pixel pitch is stable), one red margin line left
    // of the text, and a warm vignette that darkens the corners like an old page.
    celestial: {
      glow: [
        'linear-gradient(to right, transparent 0, transparent 4.2%, rgba(179,38,30,0.42) 4.2%, rgba(179,38,30,0.42) calc(4.2% + 1.5px), transparent calc(4.2% + 1.5px))',
        'repeating-linear-gradient(to bottom, transparent 0, transparent 39px, rgba(70,90,120,0.13) 39px, rgba(70,90,120,0.13) 40px)',
        'radial-gradient(140% 110% at 50% 50%, rgba(246,241,231,0) 55%, rgba(120,95,50,0.1) 100%)',
      ].join(', '),
    },
  },
  {
    id: 'chalk',
    name: 'Chalkboard',
    typography: {
      // Caveat is a handwriting face: it carries headings only. Body copy in it
      // stops being legible at a few lines, so the body is Atkinson Hyperlegible.
      headingFont: "'Caveat', cursive",
      bodyFont: "'Atkinson Hyperlegible', system-ui, sans-serif",
      // Caveat sets small for its size, so its steps run larger than the others.
      scale: [4.5, 3.25, 2, 1.3],
      lineHeight: 1.5,
      letterSpacing: 0,
    },
    colors: {
      background: '#1f2a24',
      foreground: '#f2f0e6',
      accent: '#f2c94c',
      accentForeground: '#1b1a0e',
      accentSoft: '#8fc9a0',
      muted: '#b4bfb4',
      border: '#3a4a40',
      surface: '#28362e',
      deep: '#16201b',
      deepForeground: '#f2f0e6',
      tint: '#263329',
    },
    spacing: { unit: 0.28 },
    shape: { radius: 0.5, radiusSm: 0.25, shadow: 'none' },
    // A slate that has been wiped: two broad smears of lighter dust, and a field
    // of fine chalk specks (the seeded star generator, in chalk colour, so the
    // dust is the same on every surface and in the export).
    celestial: {
      glow: [
        'radial-gradient(90% 45% at 22% 8%, rgba(242,240,230,0.07) 0%, rgba(242,240,230,0) 100%)',
        'radial-gradient(80% 40% at 78% 96%, rgba(242,240,230,0.06) 0%, rgba(242,240,230,0) 100%)',
        'radial-gradient(140% 110% at 50% 50%, rgba(0,0,0,0) 58%, rgba(0,0,0,0.22) 100%)',
      ].join(', '),
      stars: { count: 70, color: '#f2f0e6', maxRadiusPx: 1.6, opacity: 0.3, avoidCenter: true },
    },
  },
  {
    id: 'blueprint',
    name: 'Blueprint',
    typography: {
      headingFont: "'JetBrains Mono', 'JetBrains Mono Variable', ui-monospace, monospace",
      bodyFont: "'Atkinson Hyperlegible', system-ui, sans-serif",
      // A monospace sets wide, so the heading steps stay at the floor.
      scale: [3.25, 2.25, 1.5, 1.25],
      lineHeight: 1.55,
      letterSpacing: -0.4,
    },
    colors: {
      background: '#0f3057',
      foreground: '#eaf2ff',
      accent: '#7fd1ff',
      accentForeground: '#06203c',
      accentSoft: '#4a9fd8',
      muted: '#a9c3e0',
      border: '#2a5588',
      surface: '#163e6c',
      deep: '#0a2140',
      deepForeground: '#eaf2ff',
      tint: '#133761',
    },
    spacing: { unit: 0.26 },
    shape: { radius: 0.25, radiusSm: 0.125, shadow: 'none' },
    // Drafting paper: a fine 24px grid (the shared `grid`, which the export
    // draws too) with a heavier line every fifth cell (120px), drawn as glow
    // layers because a grid declares one pitch.
    celestial: {
      glow: [
        'repeating-linear-gradient(to bottom, transparent 0, transparent 119px, rgba(234,242,255,0.12) 119px, rgba(234,242,255,0.12) 120px)',
        'repeating-linear-gradient(to right, transparent 0, transparent 119px, rgba(234,242,255,0.12) 119px, rgba(234,242,255,0.12) 120px)',
        'radial-gradient(110% 80% at 50% 0%, rgba(127,209,255,0.14) 0%, rgba(127,209,255,0) 70%)',
      ].join(', '),
      grid: { color: '#eaf2ff', opacity: 0.07, sizePx: 24 },
    },
  },
  {
    id: 'pop',
    name: 'Pop',
    typography: {
      headingFont: "'Bricolage Grotesque', 'Bricolage Grotesque Variable', system-ui, sans-serif",
      bodyFont: "'Bricolage Grotesque', 'Bricolage Grotesque Variable', system-ui, sans-serif",
      scale: [3.75, 2.5, 1.75, 1.25],
      lineHeight: 1.45,
      letterSpacing: -0.8,
    },
    colors: {
      background: '#fffaf0',
      foreground: '#111111',
      // Darkened from #ff4f1f (3.3:1) so the accent reads as small label text on the ground and
      // the surface (4.5:1+); ink on it is therefore white, and the soft end of the badge
      // gradient is a deep amber that holds white too. The yellow lives on in the corner block.
      accent: '#cf350a',
      accentForeground: '#fffaf0',
      accentSoft: '#b45309',
      muted: '#4a4a4a',
      border: '#111111',
      surface: '#fff7e0',
      deep: '#1a1a1a',
      deepForeground: '#fff7e0',
      tint: '#fff1cc',
    },
    spacing: { unit: 0.28 },
    shape: { radius: 0.75, radiusSm: 0.375, shadow: 'hard' },
    // Two flat colour blocks pushed into opposite corners. Each is a radial
    // gradient whose stops sit two points apart, which is a hard edge (and a
    // shape the PPTX backdrop parser reads, so it exports as a block too). The
    // orange block keeps the bright orange, not the darker accent: dark text over
    // it stays above 4.5:1.
    celestial: {
      glow: [
        'radial-gradient(21% 38% at 104% -6%, rgba(255,79,31,1) 98%, rgba(255,79,31,0) 100%)',
        'radial-gradient(14% 26% at -4% 108%, rgba(255,210,63,1) 98%, rgba(255,210,63,0) 100%)',
      ].join(', '),
    },
  },
  {
    id: 'boardroom',
    name: 'Boardroom',
    typography: {
      headingFont: "'Hanken Grotesk', 'Hanken Grotesk Variable', system-ui, sans-serif",
      bodyFont: "'Hanken Grotesk', 'Hanken Grotesk Variable', system-ui, sans-serif",
      scale: [3.5, 2.5, 1.625, 1.25],
      lineHeight: 1.55,
      letterSpacing: -0.2,
    },
    colors: {
      background: '#f4f5f7',
      foreground: '#16202c',
      accent: '#1f4e8c',
      accentForeground: '#f4f5f7',
      accentSoft: '#3d6fb3',
      muted: '#5b6675',
      border: '#d9dde3',
      surface: '#fafbfc',
      deep: '#16304f',
      deepForeground: '#f4f5f7',
      tint: '#e9ecf1',
    },
    spacing: { unit: 0.28 },
    shape: { radius: 0.375, radiusSm: 0.1875, shadow: 'soft' },
    // Nothing beyond a faint rule across the top and a breath of light behind it.
    celestial: {
      glow: [
        'linear-gradient(to bottom, rgba(31,78,140,0.55) 0, rgba(31,78,140,0.55) 4px, transparent 4px)',
        'radial-gradient(120% 60% at 50% -10%, rgba(31,78,140,0.07) 0%, rgba(31,78,140,0) 70%)',
      ].join(', '),
    },
  },
]

export const DEFAULT_THEME = BUILTIN_THEMES[0]

/**
 * Resolves a theme loaded from storage back to its current preset definition.
 *
 * Deck rows store the whole theme object as JSON, so a deck saved before a
 * redesign carries that older shape — no `celestial`, no `accentSoft`. Themes
 * are preset-only (there is no custom-theme storage), so `id` is a complete
 * key: matching on it means every existing deck picks up the current design
 * instead of rendering a half-populated theme.
 */
export function resolveTheme(stored: unknown): ThemeTokens {
  const id = (stored as { id?: unknown } | null | undefined)?.id
  return BUILTIN_THEMES.find((t) => t.id === id) ?? DEFAULT_THEME
}
