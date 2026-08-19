import { create } from 'zustand'

export type AppTheme = 'light' | 'dark'

const STORAGE_KEY = 'lekturac:app-theme'

/**
 * Light/dark for the *app chrome* only (the app-* token namespace in index.css).
 * Deck themes (slide-*) are authored per deck and are deliberately unaffected —
 * a light deck still previews light while the editor around it is dark.
 */
interface AppThemeState {
  theme: AppTheme
  setTheme: (theme: AppTheme) => void
  toggleTheme: () => void
}

function readStored(): AppTheme | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored === 'light' || stored === 'dark' ? stored : null
  } catch {
    // private mode / storage disabled — fall back to the system preference
    return null
  }
}

function systemTheme(): AppTheme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(theme: AppTheme) {
  document.documentElement.dataset.theme = theme
}

const initialTheme = readStored() ?? systemTheme()
applyTheme(initialTheme)

export const useAppTheme = create<AppThemeState>((set, get) => ({
  theme: initialTheme,
  setTheme: (theme) => {
    applyTheme(theme)
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      // non-fatal: the choice just won't survive a reload
    }
    set({ theme })
  },
  toggleTheme: () => {
    get().setTheme(get().theme === 'dark' ? 'light' : 'dark')
  },
}))

// follow the OS only while the user hasn't made an explicit choice
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
  if (readStored()) return
  const next: AppTheme = e.matches ? 'dark' : 'light'
  applyTheme(next)
  useAppTheme.setState({ theme: next })
})
