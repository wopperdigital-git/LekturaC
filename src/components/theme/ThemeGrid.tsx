import { BUILTIN_THEMES, stageColor, type ThemeTokens } from '@/lib/theme-tokens'

/**
 * A low-fidelity picture of a theme: its stage, a card on it, and bars standing
 * in for the accent mark, a heading and a subheading — each in the theme's own
 * colour. No words, fonts or backdrop: the picker is for telling palettes apart
 * at a glance, the way the layout picker's wireframes tell arrangements apart,
 * and the slide itself shows the rest the moment a theme is picked.
 *
 * Drawn straight from the tokens rather than through a `ThemeProvider`, so it
 * needs no scoped `--slide-*` values and costs one small SVG per theme.
 */
function ThemeWireframe({ theme }: { theme: ThemeTokens }) {
  const { colors } = theme
  return (
    <svg viewBox="0 0 160 90" aria-hidden="true" className="block w-full rounded-[4px]">
      <rect width="160" height="90" fill={stageColor(theme)} />
      <rect x="12" y="10" width="136" height="70" rx="5" fill={colors.background} stroke={colors.border} />
      <rect x="24" y="24" width="22" height="4" rx="2" fill={colors.accent} />
      <rect x="48" y="24" width="10" height="4" rx="2" fill={colors.accentSoft} />
      <rect x="24" y="36" width="84" height="9" rx="2" fill={colors.foreground} />
      <rect x="24" y="52" width="60" height="5" rx="2" fill={colors.muted} />
      <rect x="24" y="62" width="44" height="5" rx="2" fill={colors.muted} />
    </svg>
  )
}

/**
 * Preset-only theme picker, as a two-column grid of wireframes — no manual
 * colour/font/radius/spacing editing. It lives in the editor's tools panel, so
 * every theme is on screen at once with just a name under its picture.
 */
export function ThemeGrid({
  theme,
  onSelect,
}: {
  theme: ThemeTokens
  onSelect: (theme: ThemeTokens) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {BUILTIN_THEMES.map((t) => {
        const isActive = t.id === theme.id
        return (
          <button
            key={t.id}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onSelect(t)}
            aria-pressed={isActive}
            title={t.name}
            className={`flex min-w-0 cursor-pointer flex-col items-stretch gap-1 rounded-app-sm border p-1 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent ${
              isActive
                ? 'border-app-accent bg-app-accent/10'
                : 'border-transparent hover:bg-app-foreground/5'
            }`}
          >
            <ThemeWireframe theme={t} />
            <span className="truncate px-0.5 text-[11px] font-medium text-app-foreground">
              {t.name}
            </span>
          </button>
        )
      })}
    </div>
  )
}
