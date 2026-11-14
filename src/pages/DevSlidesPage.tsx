import { useSearchParams } from 'react-router-dom'
import { CPP_DECK, withStyle } from '@/engine/fixtures/cppDeck'
import { GALLERY_DECK } from '@/engine/fixtures/galleryDeck'
import { resolveLayout } from '@/engine/layoutEngine'
import type { VisualStyle } from '@/engine/contentBlocks'
import { BUILTIN_THEMES, DEFAULT_THEME, stageColor } from '@/lib/theme-tokens'
import { SLIDE_WIDTH_PX } from '@/lib/slideSize'
import { EMPTY_TEXT_STYLE } from '@/engine/textStyle'
import { ThemeProvider } from '@/components/theme/ThemeProvider'
import { PresentSlide } from '@/components/present/PresentSlide'

/**
 * Development only (`/dev/slides`, mounted in `App.tsx` under `import.meta.env.DEV`):
 * the fixture deck drawn the way the presenter draws it, one slide under another at
 * the width every surface lays a slide out at. No account, no database.
 *
 * `?theme=<id>` picks the theme (default: the default theme), `?style=expressive`
 * the visual treatment, `?all=1` draws every theme one after another,
 * `?deck=gallery` draws the gallery deck (one slide per arrangement) instead of
 * the C++ deck, and `?only=<card id>` draws just that card of the chosen deck.
 * Each slide has a caption above it: `id · resolved layout · style`.
 */
export function DevSlidesPage() {
  const [params] = useSearchParams()
  const style: VisualStyle = params.get('style') === 'expressive' ? 'expressive' : 'structured'
  const gallery = params.get('deck') === 'gallery'
  const deckParam = gallery ? '&deck=gallery' : ''
  const only = params.get('only')
  const shown = withStyle(gallery ? GALLERY_DECK : CPP_DECK, style)
    .map((card, i) => ({ card, i }))
    .filter(({ card }) => only === null || card.id === only)
  const chosen = BUILTIN_THEMES.find((t) => t.id === params.get('theme')) ?? DEFAULT_THEME
  const themes = params.get('all') ? BUILTIN_THEMES : [chosen]

  return (
    <div className="min-h-screen">
      <nav className="flex flex-wrap gap-2 p-3 text-sm">
        {BUILTIN_THEMES.map((t) => (
          <a key={t.id} className="underline" href={`?theme=${t.id}&style=${style}${deckParam}`}>
            {t.name}
          </a>
        ))}
        <a className="underline" href={`?theme=${chosen.id}&style=${style === 'expressive' ? 'structured' : 'expressive'}${deckParam}`}
        >
          [{style}]
        </a>
        <a className="underline" href={`?theme=${chosen.id}&style=${style}`}>
          [C++ deck]
        </a>
        <a className="underline" href={`?theme=${chosen.id}&style=${style}&deck=gallery`}>
          [gallery deck]
        </a>
      </nav>
      {themes.map((theme) => (
        <ThemeProvider key={theme.id} theme={theme}>
          <section
            data-dev-theme={theme.id}
            className="flex flex-col items-center gap-10 px-10 py-10"
            style={{ background: stageColor(theme) }}
          >
            {shown.map(({ card, i }) => (
              <div key={card.id} data-dev-slide={gallery ? card.id : i} style={{ width: SLIDE_WIDTH_PX }}>
                <p className="mb-2 w-fit rounded bg-app-surface px-2 py-0.5 text-xs text-app-muted">
                  {card.id} · {resolveLayout(card.layout, card.blocks, { isFirstCard: i === 0 })} · {card.visualStyle}
                </p>
                <PresentSlide card={card} textStyle={EMPTY_TEXT_STYLE} isFirstCard={i === 0} />
              </div>
            ))}
          </section>
        </ThemeProvider>
      ))}
    </div>
  )
}
