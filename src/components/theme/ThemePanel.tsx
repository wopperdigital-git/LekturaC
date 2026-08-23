import { BUILTIN_THEMES, type ThemeTokens } from '@/lib/theme-tokens'
import { ThemeProvider } from './ThemeProvider'
import { SlideSurface } from './SlideSurface'

// The preview is a real slide rendered at presentation size and shrunk with a
// transform, exactly like the outline sidebar's thumbnails. Rendering it small
// instead would misrepresent every theme: star radii, ring strokes and grid
// spacing are all in px, so at a fifth of the size they would read as boulders.
const PREVIEW_BASE_WIDTH = 640
const PREVIEW_BASE_HEIGHT = 360
const PREVIEW_DISPLAY_WIDTH = 196
const PREVIEW_SCALE = PREVIEW_DISPLAY_WIDTH / PREVIEW_BASE_WIDTH
const PREVIEW_DISPLAY_HEIGHT = PREVIEW_BASE_HEIGHT * PREVIEW_SCALE

/**
 * A miniature slide in the theme's own palette, type and backdrop.
 *
 * The sample copy is deliberately generic — the point is to show the theme, so
 * the words have to stay out of the way while still exercising a heading, a
 * subheading and an accent mark.
 *
 * Spacing is set in px rather than Tailwind's spacing utilities: `applyTheme`
 * rewrites `--spacing` per theme, which would otherwise make each preview a
 * different size and stop them being comparable.
 */
function ThemePreview({ theme }: { theme: ThemeTokens }) {
  return (
    <div
      className="relative overflow-hidden rounded-app-sm"
      style={{ width: PREVIEW_DISPLAY_WIDTH, height: PREVIEW_DISPLAY_HEIGHT }}
    >
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{
          width: PREVIEW_BASE_WIDTH,
          height: PREVIEW_BASE_HEIGHT,
          transform: `scale(${PREVIEW_SCALE})`,
        }}
      >
        <SlideSurface className="h-full w-full" style={{ padding: 48 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <span
              style={{
                width: 64,
                height: 5,
                borderRadius: 999,
                background: `linear-gradient(90deg, ${theme.colors.accent}, ${theme.colors.accentSoft})`,
              }}
            />
            <span
              className="text-slide-foreground"
              style={{
                fontFamily: theme.typography.headingFont,
                fontSize: 46,
                lineHeight: 1.1,
                letterSpacing: `${theme.typography.letterSpacing}px`,
                fontWeight: 600,
              }}
            >
              Exploring Life
            </span>
            <span
              className="text-slide-muted"
              style={{ fontFamily: theme.typography.bodyFont, fontSize: 22, lineHeight: 1.4 }}
            >
              A friendly guide to biology
            </span>
          </div>
        </SlideSurface>
      </div>
    </div>
  )
}

/** Preset-only theme gallery — no manual color/font/radius/spacing editing. */
export function ThemePanel({
  theme,
  onSelect,
}: {
  theme: ThemeTokens
  onSelect: (theme: ThemeTokens) => void
}) {
  return (
    // The heading sits outside the scroll container rather than sticking to the
    // top of it: a sticky header inside a padded scrollport leaves the padding
    // strip above it uncovered, and scrolled previews show through that gap.
    // `h-full` on the shell is what gives the list below a height to overflow
    // against — without it the list just grows past the dock.
    <div className="flex h-full flex-col overflow-hidden p-3">
      <p className="mb-2 px-1 text-xs font-medium uppercase tracking-wide text-app-muted">Theme</p>
      <div className="flex flex-col gap-2 overflow-y-auto">
        {BUILTIN_THEMES.map((t) => {
          const isActive = t.id === theme.id
          return (
            <button
              key={t.id}
              onClick={() => onSelect(t)}
              aria-pressed={isActive}
              // `shrink-0`: these are flex children of a scrolling column, so
              // without it the previews compress instead of overflowing.
              className={`flex shrink-0 cursor-pointer flex-col items-stretch gap-2 rounded-app-sm border p-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent ${
                isActive ? 'border-app-accent bg-app-surface' : 'border-transparent hover:bg-app-surface'
              }`}
            >
              {/* Each preview needs its own scope: it renders a theme that is not
                  the deck's, so it cannot inherit the surrounding --slide-* values. */}
              <ThemeProvider theme={t}>
                <ThemePreview theme={t} />
              </ThemeProvider>
              <span className="flex items-baseline justify-between gap-2 px-0.5">
                <span className="truncate text-sm font-medium text-app-foreground">{t.name}</span>
                <span className="shrink-0 text-xs text-app-muted">
                  {t.typography.headingFont.split(',')[0].replace(/['"]/g, '')}
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
