import { BUILTIN_THEMES, type ThemeTokens } from '@/lib/theme-tokens'
import { ThemeProvider } from './ThemeProvider'
import { SlideSurface } from './SlideSurface'
import { SlideStage } from './SlideStage'

// The preview is a real slide rendered at presentation size and shrunk with a
// transform, exactly like the outline sidebar's thumbnails. Rendering it small
// instead would misrepresent every theme: star radii, ring strokes and grid
// spacing are all in px, so at a fifth of the size they would read as boulders.
const PREVIEW_BASE_WIDTH = 640
const PREVIEW_BASE_HEIGHT = 360
/** How wide each option is drawn in the strip. */
const OPTION_WIDTH = 108

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
function ThemePreview({ theme, displayWidth }: { theme: ThemeTokens; displayWidth: number }) {
  const scale = displayWidth / PREVIEW_BASE_WIDTH
  return (
    <div
      className="relative overflow-hidden rounded-app-sm"
      style={{ width: displayWidth, height: PREVIEW_BASE_HEIGHT * scale }}
    >
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{
          width: PREVIEW_BASE_WIDTH,
          height: PREVIEW_BASE_HEIGHT,
          transform: `scale(${scale})`,
        }}
      >
        {/* Stage behind, solid card on top — the same composition as the real
            canvas. The stage's inset is what makes the themes distinguishable
            here at all now that the decoration lives behind the card rather
            than inside it. */}
        <SlideStage className="h-full w-full" style={{ padding: 32 }}>
          <SlideSurface
            className="h-full w-full rounded-slide shadow-slide-card"
            style={{ padding: 40 }}
          >
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
        </SlideStage>
      </div>
    </div>
  )
}

/**
 * Preset-only theme picker, as one small horizontally scrolling row — no manual
 * colour/font/radius/spacing editing. It lives in the editor's tools panel, so it
 * has to be compact: the previews are the whole of each option, with just a name
 * under them.
 */
export function ThemeStrip({
  theme,
  onSelect,
}: {
  theme: ThemeTokens
  onSelect: (theme: ThemeTokens) => void
}) {
  return (
    // No visible scrollbar (`scrollbar-none`) but it still scrolls by wheel,
    // trackpad, touch and keyboard, like the slide rail. `shrink-0` on the
    // options: they are flex children of a scrolling row, so without it they
    // compress instead of overflowing.
    <div className="scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1 py-1">
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
            className={`flex shrink-0 cursor-pointer flex-col items-stretch gap-1 rounded-app-sm border p-1 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent ${
              isActive
                ? 'border-app-accent bg-app-accent/10'
                : 'border-transparent hover:bg-app-foreground/5'
            }`}
            style={{ width: OPTION_WIDTH + 10 }}
          >
            {/* Each preview needs its own scope: it renders a theme that is not
                the deck's, so it cannot inherit the surrounding --slide-* values. */}
            <ThemeProvider theme={t}>
              <ThemePreview theme={t} displayWidth={OPTION_WIDTH} />
            </ThemeProvider>
            <span className="truncate px-0.5 text-[11px] font-medium text-app-foreground">
              {t.name}
            </span>
          </button>
        )
      })}
    </div>
  )
}
