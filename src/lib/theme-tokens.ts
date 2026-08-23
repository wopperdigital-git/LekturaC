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
 * Writes a ThemeTokens object onto `root` as --slide-* CSS custom properties,
 * scoped to that element (never document.documentElement) so it only affects
 * descendants — the slide content rendered inside a ThemeProvider wrapper.
 *
 * Also overrides Tailwind's own `--spacing` multiplier on that same scope, so
 * a theme's spacing density affects only the slides it wraps, never app chrome.
 */
export function applyTheme(theme: ThemeTokens, root: HTMLElement) {
  const { typography, colors, spacing, shape } = theme
  const [h1, h2, h3, body] = typography.scale

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

    '--slide-font-heading': typography.headingFont,
    '--slide-font-body': typography.bodyFont,

    '--slide-size-h1': `${h1}rem`,
    '--slide-size-h2': `${h2}rem`,
    '--slide-size-h3': `${h3}rem`,
    '--slide-size-body': `${body}rem`,
    '--slide-line-height': String(typography.lineHeight),
    '--slide-letter-spacing': `${typography.letterSpacing}px`,

    '--slide-radius': `${shape.radius}rem`,
    '--slide-radius-sm': `${shape.radiusSm}rem`,
    '--slide-shadow': SHADOW_VALUES[shape.shadow],

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
  Five celestial themes. Each owns a distinct palette, a distinct atmospheric
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
      scale: [2.75, 1.875, 1.375, 1],
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
      scale: [3, 2, 1.5, 1.05],
      lineHeight: 1.6,
      letterSpacing: 0,
    },
    colors: {
      background: '#f5efe5',
      foreground: '#201b18',
      accent: '#b85c16',
      accentForeground: '#ffffff',
      accentSoft: '#d49a62',
      muted: '#76695d',
      border: '#e0d5c3',
      surface: '#fbf6ec',
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
      scale: [2.75, 1.875, 1.375, 1],
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
      scale: [3.25, 2.1, 1.5, 1.05],
      lineHeight: 1.45,
      letterSpacing: -0.5,
    },
    colors: {
      background: '#111111',
      foreground: '#ffffff',
      accent: '#ff5a1f',
      accentForeground: '#180a03',
      accentSoft: '#ffb000',
      muted: '#a8a29e',
      border: '#2f2f2f',
      surface: '#1c1a19',
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
      scale: [2.5, 1.75, 1.3, 1],
      lineHeight: 1.6,
      letterSpacing: 0,
    },
    colors: {
      background: '#f1f5f1',
      foreground: '#19332d',
      accent: '#4c8a72',
      accentForeground: '#07160f',
      accentSoft: '#86bfa2',
      muted: '#61736d',
      border: '#d6e2d9',
      surface: '#f0f5f1',
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
