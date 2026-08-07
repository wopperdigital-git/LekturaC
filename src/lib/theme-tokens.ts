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
    accentForeground: string
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
    shadow: 'none' | 'soft' | 'hard'
  }
}

const SHADOW_VALUES: Record<ThemeTokens['shape']['shadow'], string> = {
  none: 'none',
  soft: '0 2px 6px rgba(0,0,0,0.05), 0 12px 28px rgba(0,0,0,0.08)',
  hard: '4px 4px 0 0 rgba(0,0,0,0.9)',
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

    '--spacing': `${spacing.unit}rem`,
  }

  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value)
  }
}

export const BUILTIN_THEMES: ThemeTokens[] = [
  {
    id: 'minimal',
    name: 'Minimal',
    typography: {
      headingFont: "'Inter', system-ui, sans-serif",
      bodyFont: "'Inter', system-ui, sans-serif",
      scale: [2.75, 1.875, 1.375, 1],
      lineHeight: 1.55,
      letterSpacing: -0.2,
    },
    colors: {
      background: '#ffffff',
      foreground: '#111114',
      accent: '#4f46e5',
      accentForeground: '#ffffff',
      muted: '#6b7280',
      border: '#e5e7eb',
      surface: '#f8f8fa',
    },
    spacing: { unit: 0.26 },
    shape: { radius: 1, radiusSm: 0.5, shadow: 'soft' },
  },
  {
    id: 'editorial',
    name: 'Editorial',
    typography: {
      headingFont: "'Georgia', 'Times New Roman', serif",
      bodyFont: "'Inter', system-ui, sans-serif",
      scale: [3, 2, 1.5, 1.05],
      lineHeight: 1.6,
      letterSpacing: 0,
    },
    colors: {
      background: '#fbf9f4',
      foreground: '#1c1917',
      accent: '#b45309',
      accentForeground: '#fffaf0',
      muted: '#78716c',
      border: '#e7e0d3',
      surface: '#f3efe4',
    },
    spacing: { unit: 0.3 },
    shape: { radius: 0.375, radiusSm: 0.25, shadow: 'none' },
  },
  {
    id: 'midnight',
    name: 'Midnight',
    typography: {
      headingFont: "'Inter', system-ui, sans-serif",
      bodyFont: "'Inter', system-ui, sans-serif",
      scale: [2.75, 1.875, 1.375, 1],
      lineHeight: 1.55,
      letterSpacing: -0.2,
    },
    colors: {
      background: '#0b0c10',
      foreground: '#f4f4f5',
      accent: '#8b5cf6',
      accentForeground: '#ffffff',
      muted: '#9ca3af',
      border: '#26272f',
      surface: '#15161c',
    },
    spacing: { unit: 0.26 },
    shape: { radius: 1, radiusSm: 0.5, shadow: 'soft' },
  },
  {
    id: 'bold',
    name: 'Bold',
    typography: {
      headingFont: "'Arial Black', system-ui, sans-serif",
      bodyFont: "'Inter', system-ui, sans-serif",
      scale: [3.25, 2.1, 1.5, 1.05],
      lineHeight: 1.45,
      letterSpacing: -0.5,
    },
    colors: {
      background: '#fefce8',
      foreground: '#111114',
      accent: '#dc2626',
      accentForeground: '#ffffff',
      muted: '#57534e',
      border: '#111114',
      surface: '#fff9c4',
    },
    spacing: { unit: 0.28 },
    shape: { radius: 0, radiusSm: 0, shadow: 'hard' },
  },
  {
    id: 'sage',
    name: 'Sage',
    typography: {
      headingFont: "'Inter', system-ui, sans-serif",
      bodyFont: "'Inter', system-ui, sans-serif",
      scale: [2.5, 1.75, 1.3, 1],
      lineHeight: 1.6,
      letterSpacing: 0,
    },
    colors: {
      background: '#f4f7f2',
      foreground: '#1f2a1e',
      accent: '#3f6b3a',
      accentForeground: '#ffffff',
      muted: '#5f7159',
      border: '#dbe5d6',
      surface: '#e9f0e6',
    },
    spacing: { unit: 0.3 },
    shape: { radius: 1.25, radiusSm: 0.6, shadow: 'soft' },
  },
]

export const DEFAULT_THEME = BUILTIN_THEMES[0]
