import { useAppTheme, type AppThemeMode } from '@/lib/appTheme'

interface ThemeOption {
  mode: AppThemeMode
  label: string
  hint: string
}

const OPTIONS: ThemeOption[] = [
  { mode: 'system', label: 'System', hint: 'Auto-adapt to OS' },
  { mode: 'light', label: 'Light', hint: 'Bright & clean' },
  { mode: 'dark', label: 'Dark', hint: 'Low-glare dark' },
]

/**
 * Executive visual theme preview for System, Light, and Dark modes.
 */
function ThemePreviewThumbnail({ mode }: { mode: AppThemeMode }) {
  if (mode === 'light') {
    return (
      <div className="relative h-20 w-full overflow-hidden rounded-md border border-black/10 bg-[#faf4fb] p-1.5 shadow-xs">
        {/* Left rail */}
        <div className="absolute inset-y-1.5 left-1.5 w-6 rounded bg-[#f5f0f8] p-0.5 flex flex-col gap-1 border-r border-[#e6e0eb]/60">
          <div className="size-2 rounded-full bg-[#9f50c3]" />
          <div className="h-1 w-full rounded bg-[#e6e0eb]" />
          <div className="h-1 w-full rounded bg-[#e6e0eb]" />
        </div>
        {/* Content body */}
        <div className="ml-7 flex h-full flex-col justify-between py-0.5">
          <div className="flex flex-col gap-1">
            <div className="h-1.5 w-12 rounded bg-[#13091b]/80" />
            <div className="h-1 w-16 rounded bg-[#726080]/60" />
          </div>
          {/* Mini card */}
          <div className="rounded border border-[#e6e0eb] bg-white p-1 shadow-2xs">
            <div className="h-1 w-10 rounded bg-[#9f50c3]/70" />
            <div className="mt-0.5 h-0.5 w-14 rounded bg-[#726080]/40" />
          </div>
        </div>
      </div>
    )
  }

  if (mode === 'dark') {
    return (
      <div className="relative h-20 w-full overflow-hidden rounded-md border border-white/10 bg-[#0a040b] p-1.5 shadow-xs">
        {/* Left rail */}
        <div className="absolute inset-y-1.5 left-1.5 w-6 rounded bg-[#17131b] p-0.5 flex flex-col gap-1 border-r border-[#332a3c]/60">
          <div className="size-2 rounded-full bg-[#8a3caf]" />
          <div className="h-1 w-full rounded bg-[#332a3c]" />
          <div className="h-1 w-full rounded bg-[#332a3c]" />
        </div>
        {/* Content body */}
        <div className="ml-7 flex h-full flex-col justify-between py-0.5">
          <div className="flex flex-col gap-1">
            <div className="h-1.5 w-12 rounded bg-[#eee4f6]/80" />
            <div className="h-1 w-16 rounded bg-[#a18eb4]/60" />
          </div>
          {/* Mini card */}
          <div className="rounded border border-[#332a3c] bg-[#17131b] p-1 shadow-2xs">
            <div className="h-1 w-10 rounded bg-[#8a3caf]/70" />
            <div className="mt-0.5 h-0.5 w-14 rounded bg-[#a18eb4]/40" />
          </div>
        </div>
      </div>
    )
  }

  // System mode: split diagonal preview
  return (
    <div className="relative h-20 w-full overflow-hidden rounded-md border border-app-border bg-[#faf4fb] shadow-xs">
      {/* Light side (Left) */}
      <div className="absolute inset-0 p-1.5">
        <div className="absolute inset-y-1.5 left-1.5 w-6 rounded bg-[#f5f0f8] p-0.5 flex flex-col gap-1 border-r border-[#e6e0eb]/60">
          <div className="size-2 rounded-full bg-[#9f50c3]" />
          <div className="h-1 w-full rounded bg-[#e6e0eb]" />
        </div>
        <div className="ml-7 flex h-full flex-col gap-1 py-0.5">
          <div className="h-1.5 w-8 rounded bg-[#13091b]/80" />
          <div className="h-1 w-10 rounded bg-[#726080]/60" />
        </div>
      </div>

      {/* Dark side (Right, clipped diagonally) */}
      <div
        className="absolute inset-0 bg-[#0a040b] p-1.5"
        style={{ clipPath: 'polygon(60% 0, 100% 0, 100% 100%, 35% 100%)' }}
      >
        <div className="ml-auto mr-1 flex h-full w-14 flex-col justify-between py-0.5">
          <div className="flex flex-col items-end gap-1">
            <div className="h-1.5 w-8 rounded bg-[#eee4f6]/80" />
            <div className="h-1 w-6 rounded bg-[#a18eb4]/60" />
          </div>
          <div className="rounded border border-[#332a3c] bg-[#17131b] p-1 shadow-2xs">
            <div className="h-1 w-8 rounded bg-[#8a3caf]/80" />
          </div>
        </div>
      </div>

      {/* Subtle diagonal divider line */}
      <svg
        className="pointer-events-none absolute inset-0 size-full text-app-border"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <line x1="60" y1="0" x2="35" y2="100" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    </div>
  )
}

/**
 * The app-chrome light/dark setting, presented as Executive Theme Selection Cards.
 */
export function AppearanceSection() {
  const mode = useAppTheme((s) => s.mode)
  const setMode = useAppTheme((s) => s.setMode)

  return (
    <div className="flex flex-col gap-4">
      <div
        role="radiogroup"
        aria-label="Appearance"
        className="grid grid-cols-1 gap-3 sm:grid-cols-3"
      >
        {OPTIONS.map((option) => {
          const selected = mode === option.mode
          return (
            <button
              key={option.mode}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setMode(option.mode)}
              className={`group relative flex cursor-pointer flex-col gap-2.5 rounded-app-sm border p-2.5 text-left transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent ${
                selected
                  ? 'border-app-accent bg-app-accent/8 ring-2 ring-app-accent/25 shadow-2xs'
                  : 'border-app-border bg-app-surface/50 hover:border-app-border/90 hover:bg-app-surface'
              }`}
            >
              {/* Graphical mini UI mockup */}
              <div className="relative">
                <ThemePreviewThumbnail mode={option.mode} />
                {/* Active check pill */}
                <div
                  className={`absolute top-2 right-2 grid size-5 place-items-center rounded-full transition-transform duration-150 ${
                    selected
                      ? 'scale-100 bg-app-accent text-app-accent-foreground shadow-xs'
                      : 'scale-90 border border-app-border/80 bg-app-background/90 text-transparent opacity-40 group-hover:opacity-75'
                  }`}
                  aria-hidden="true"
                >
                  <svg
                    className="size-3"
                    viewBox="0 0 12 12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M2.5 6.5l2.5 2.5 5-5" />
                  </svg>
                </div>
              </div>

              {/* Labels */}
              <div className="flex flex-col px-0.5">
                <div className="flex items-center justify-between">
                  <span
                    className={`text-sm font-semibold tracking-tight ${
                      selected ? 'text-app-foreground' : 'text-app-foreground/90'
                    }`}
                  >
                    {option.label}
                  </span>
                </div>
                <span className="text-xs text-app-muted">{option.hint}</span>
              </div>
            </button>
          )
        })}
      </div>

      <div className="flex items-center gap-2 rounded-app-sm border border-app-border/70 bg-app-surface/40 px-3 py-2 text-xs text-app-muted">
        <svg
          className="size-3.5 shrink-0 text-app-accent"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <circle cx="8" cy="8" r="6" />
          <path d="M8 7.5v3.5M8 5h.01" />
        </svg>
        <span>
          Deck slide themes are authored individually and will preserve their colors regardless of app theme.
        </span>
      </div>
    </div>
  )
}
