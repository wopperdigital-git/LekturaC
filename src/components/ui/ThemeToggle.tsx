import { useAppTheme } from '@/lib/appTheme'

/**
 * Light/dark switch for the app chrome. The two icons are cross-faded and
 * counter-rotated rather than swapped, so the control never jumps.
 *
 * `onDark` swaps the `app-*` surface for white-alpha, for the always-dark
 * surfaces that don't follow this toggle (the auth panel, the dashboard rail).
 */
export function ThemeToggle({
  className = '',
  onDark = false,
}: {
  className?: string
  onDark?: boolean
}) {
  const theme = useAppTheme((s) => s.theme)
  const toggleTheme = useAppTheme((s) => s.toggleTheme)
  const isDark = theme === 'dark'

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={`relative grid size-9 cursor-pointer place-items-center rounded-full border transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 ${
        onDark
          ? 'border-white/12 bg-white/5 text-white/70 hover:bg-white/12 hover:text-white focus-visible:outline-white/50'
          : 'border-app-border bg-app-background text-app-foreground hover:bg-app-surface focus-visible:outline-app-accent'
      } ${className}`}
    >
      <svg
        className={`absolute size-4 transition-all duration-300 ${
          isDark ? 'scale-50 rotate-90 opacity-0' : 'scale-100 rotate-0 opacity-100'
        }`}
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <circle cx="10" cy="10" r="3.6" />
        <path d="M10 2.4v1.7M10 15.9v1.7M17.6 10h-1.7M4.1 10H2.4M15.4 4.6l-1.2 1.2M5.8 14.2l-1.2 1.2M15.4 15.4l-1.2-1.2M5.8 5.8L4.6 4.6" />
      </svg>
      <svg
        className={`absolute size-4 transition-all duration-300 ${
          isDark ? 'scale-100 rotate-0 opacity-100' : 'scale-50 -rotate-90 opacity-0'
        }`}
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M16.5 12.4A7 7 0 017.6 3.5a7 7 0 108.9 8.9z" />
      </svg>
    </button>
  )
}
