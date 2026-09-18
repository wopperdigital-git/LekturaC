import { useAppTheme, type AppThemeMode } from '@/lib/appTheme'

const OPTIONS: { mode: AppThemeMode; label: string; hint: string }[] = [
  { mode: 'system', label: 'System', hint: 'Match your device' },
  { mode: 'light', label: 'Light', hint: 'Always light' },
  { mode: 'dark', label: 'Dark', hint: 'Always dark' },
]

/**
 * The app-chrome light/dark setting, as three mutually exclusive choices.
 *
 * A radio group rather than a switch because there are three states and one of
 * them ("System") is not a side — a two-position control cannot express it,
 * which is why this exists alongside the two-state `ThemeToggle` still used in
 * the two places with no settings modal to host this instead: /login (no
 * account yet) and the editor's `TopBar`. Flipping that two-state toggle from
 * either place silently commits a `system` preference to whichever side is
 * currently rendered — there's no way back to "System" except from here.
 * Deck themes are untouched by design: a light deck previews light inside a
 * dark editor.
 */
export function AppearanceSection() {
  const mode = useAppTheme((s) => s.mode)
  const setMode = useAppTheme((s) => s.setMode)

  return (
    <div role="radiogroup" aria-label="Appearance" className="grid grid-cols-3 gap-2">
      {OPTIONS.map((option) => {
        const selected = mode === option.mode
        return (
          <button
            key={option.mode}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => setMode(option.mode)}
            className={`flex cursor-pointer flex-col items-center gap-1 rounded-app-sm border px-3 py-3 text-center transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent ${
              selected
                ? 'border-app-accent bg-app-accent/10 text-app-foreground'
                : 'border-app-border bg-app-surface text-app-muted hover:bg-app-border/40'
            }`}
          >
            <span className="text-sm font-medium">{option.label}</span>
            <span className="text-xs text-app-muted">{option.hint}</span>
          </button>
        )
      })}
    </div>
  )
}
