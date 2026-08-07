import { BUILTIN_THEMES, type ThemeTokens } from '@/lib/theme-tokens'

/** Preset-only theme gallery — no manual color/font/radius/spacing editing. */
export function ThemePanel({
  theme,
  onSelect,
}: {
  theme: ThemeTokens
  onSelect: (theme: ThemeTokens) => void
}) {
  return (
    <div className="flex flex-col gap-1.5 overflow-y-auto p-3">
      <p className="mb-1 px-1 text-xs font-medium uppercase tracking-wide text-app-muted">Theme</p>
      {BUILTIN_THEMES.map((t) => {
        const isActive = t.id === theme.id
        return (
          <button
            key={t.id}
            onClick={() => onSelect(t)}
            className={`flex cursor-pointer items-center gap-3 rounded-app-sm border p-2 text-left transition-colors ${
              isActive ? 'border-app-accent bg-app-surface' : 'border-transparent hover:bg-app-surface'
            }`}
          >
            <span
              className="flex h-9 w-12 shrink-0 items-center justify-center border border-app-border"
              style={{ background: t.colors.background, borderRadius: `${Math.min(t.shape.radius * 0.4, 0.5)}rem` }}
            >
              <span className="text-sm font-semibold" style={{ fontFamily: t.typography.headingFont, color: t.colors.accent }}>
                Aa
              </span>
            </span>
            <span className="flex flex-col overflow-hidden">
              <span className="truncate text-sm font-medium text-app-foreground">{t.name}</span>
              <span className="truncate text-xs text-app-muted">
                {t.typography.headingFont.split(',')[0].replace(/['"]/g, '')}
              </span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
