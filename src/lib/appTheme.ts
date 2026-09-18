import { create } from 'zustand'

/** The rendered side. This is what `data-theme` and every `dark:` utility see. */
export type AppTheme = 'light' | 'dark'
/** The user's *setting*, which may defer to the OS. */
export type AppThemeMode = AppTheme | 'system'

const STORAGE_KEY = 'lekturac:app-theme'

/**
 * Light/dark for the *app chrome* only (the app-* token namespace in index.css).
 * Deck themes (slide-*) are authored per deck and are deliberately unaffected —
 * a light deck still previews light while the editor around it is dark.
 *
 * `mode` is the setting and `theme` is what it currently resolves to; both are
 * exposed because the settings modal has to show which of the three is chosen,
 * while everything that paints only cares about the resolved side. Before the
 * modal existed, "follow the OS" was inferred from *nothing being stored* —
 * which made it a fallback rather than a choice, and meant a user whose OS was
 * dark could not ask for dark without the setting looking unset.
 */
interface AppThemeState {
  mode: AppThemeMode
  theme: AppTheme
  setMode: (mode: AppThemeMode) => void
  toggleTheme: () => void
}

function readStoredMode(): AppThemeMode | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    // 'light'/'dark' are also what the pre-`system` module wrote, so an
    // existing choice survives this change without a migration.
    return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : null
  } catch {
    // private mode / storage disabled — fall back to the system preference
    return null
  }
}

function darkQuery(): MediaQueryList {
  return window.matchMedia('(prefers-color-scheme: dark)')
}

function systemTheme(): AppTheme {
  return darkQuery().matches ? 'dark' : 'light'
}

function resolveTheme(mode: AppThemeMode): AppTheme {
  return mode === 'system' ? systemTheme() : mode
}

function applyTheme(theme: AppTheme) {
  document.documentElement.dataset.theme = theme
}

const initialMode = readStoredMode() ?? 'system'
const initialTheme = resolveTheme(initialMode)
applyTheme(initialTheme)

export const useAppTheme = create<AppThemeState>((set, get) => ({
  mode: initialMode,
  theme: initialTheme,
  setMode: (mode) => {
    const theme = resolveTheme(mode)
    applyTheme(theme)
    try {
      localStorage.setItem(STORAGE_KEY, mode)
    } catch {
      // non-fatal: the choice just won't survive a reload
    }
    set({ mode, theme })
  },
  /**
   * Flips the *rendered* side and commits to it. Called from `ThemeToggle`,
   * which is a two-state control and still used on /login, where there is no
   * account and so no settings modal. Committing matters: from `system` a
   * toggle that only re-resolved would appear to do nothing whenever the OS
   * already sat on the side being switched away from.
   */
  toggleTheme: () => {
    get().setMode(get().theme === 'dark' ? 'light' : 'dark')
  },
}))

// Follow the OS only while the setting actually says to. Read from the store
// rather than from storage, so a mode change takes effect without a reload.
darkQuery().addEventListener('change', (e) => {
  if (useAppTheme.getState().mode !== 'system') return
  const next: AppTheme = e.matches ? 'dark' : 'light'
  applyTheme(next)
  useAppTheme.setState({ theme: next })
})
