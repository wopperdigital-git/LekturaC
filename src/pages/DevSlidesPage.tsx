import { useSearchParams } from 'react-router-dom'
import { CPP_DECK, withStyle } from '@/engine/fixtures/cppDeck'
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
 * the visual treatment, `?all=1` draws every theme one after another.
 */
export function DevSlidesPage() {
  const [params] = useSearchParams()
  const style: VisualStyle = params.get('style') === 'expressive' ? 'expressive' : 'structured'
  const cards = withStyle(CPP_DECK, style)
  const chosen = BUILTIN_THEMES.find((t) => t.id === params.get('theme')) ?? DEFAULT_THEME
  const themes = params.get('all') ? BUILTIN_THEMES : [chosen]

  return (
    <div className="min-h-screen">
      <nav className="flex flex-wrap gap-2 p-3 text-sm">
        {BUILTIN_THEMES.map((t) => (
          <a key={t.id} className="underline" href={`?theme=${t.id}&style=${style}`}>
            {t.name}
          </a>
        ))}
        <a className="underline" href={`?theme=${chosen.id}&style=${style === 'expressive' ? 'structured' : 'expressive'}`}>
          [{style}]
        </a>
      </nav>
      {themes.map((theme) => (
        <ThemeProvider key={theme.id} theme={theme}>
          <section
            data-dev-theme={theme.id}
            className="flex flex-col items-center gap-10 px-10 py-10"
            style={{ background: stageColor(theme) }}
          >
            {cards.map((card, i) => (
              <div key={card.id} data-dev-slide={i} style={{ width: SLIDE_WIDTH_PX }}>
                <PresentSlide card={card} textStyle={EMPTY_TEXT_STYLE} isFirstCard={i === 0} />
              </div>
            ))}
          </section>
        </ThemeProvider>
      ))}
    </div>
  )
}
