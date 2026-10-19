import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { Card } from '@/engine/contentBlocks'
import type { ThemeTokens } from '@/lib/theme-tokens'
import { mergeTextStyle, type TextStyle } from '@/engine/textStyle'
import { ThemeProvider } from '@/components/theme/ThemeProvider'
import { ScaledSlide } from '@/components/theme/ScaledSlide'
import { SlideSurface } from '@/components/theme/SlideSurface'
import { TextStyleScope } from '@/components/theme/TextStyleScope'
import { SlideBody } from '@/components/layouts/SlideBody'
import { LayoutRenderer } from '@/components/layouts/LayoutRenderer'

/*
  What a phone gets at /deck/:id instead of the editor (`lib/editorLayout.ts`): no room
  for a slide beside any panel, and editing by touch at that size would be guesswork.
  It is read-only. The slides are drawn the way the presenter draws them (`ScaledSlide`,
  laid out at the editor's width and scaled), each with its narration script, and the
  page keeps what is worth doing on a phone: present, and the Create & export menu (quiz,
  narrated video, PowerPoint, script), which the editor passes in already wired.
*/

const stroke = {
  viewBox: '0 0 20 20',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const

export function PhoneDeckView({
  title,
  cards,
  theme,
  textStyle,
  presentHref,
  exportMenu,
}: {
  title: string
  cards: Card[]
  theme: ThemeTokens
  textStyle: TextStyle
  presentHref: string
  exportMenu: ReactNode
}) {
  const sorted = [...cards].sort((a, b) => a.orderIndex - b.orderIndex)

  return (
    <div className="flex min-h-screen flex-col bg-app-canvas">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-app-border bg-app-background px-4 py-2">
        <Link
          to="/"
          aria-label="Back to home"
          title="Back to home"
          className="flex size-10 shrink-0 items-center justify-center rounded-full border border-app-border bg-app-surface text-app-foreground/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent"
        >
          <svg {...stroke} className="size-[18px]">
            <path d="M16 10H4.5M9.5 4.5L4 10l5.5 5.5" />
          </svg>
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-base font-semibold text-app-foreground">{title}</h1>
        <Link
          to={presentHref}
          aria-label="Present"
          title="Present this deck"
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-app-accent text-app-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="size-4">
            <path d="M6 4.5v11l9-5.5-9-5.5z" />
          </svg>
        </Link>
      </header>

      <div className="flex flex-col gap-3 px-4 pt-4">
        <p className="rounded-app-sm border border-app-border bg-app-surface p-3 text-sm text-app-muted">
          Editing slides needs a wider screen, like a tablet or laptop. Here you can read the deck and its
          scripts, present it, or make a quiz or video from it.
        </p>
        <div className="self-start">{exportMenu}</div>
      </div>

      {sorted.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-app-muted">No slides yet.</p>
      ) : (
        <ThemeProvider theme={theme}>
          <ol className="flex flex-col gap-8 px-4 py-6">
            {sorted.map((card, i) => {
              const script = card.narration?.text.trim() ?? ''
              return (
                <li key={card.id} aria-labelledby={`phone-slide-${card.id}`} className="flex flex-col gap-2">
                  <h2 id={`phone-slide-${card.id}`} className="text-xs font-semibold text-app-muted">
                    Slide {i + 1}
                  </h2>
                  <ScaledSlide>
                    <TextStyleScope style={mergeTextStyle(textStyle, card.textStyle)}>
                      <SlideSurface className="w-full rounded-slide p-10 shadow-slide-card">
                        <SlideBody card={card}>
                          <LayoutRenderer card={card} context={{ isFirstCard: i === 0 }} />
                        </SlideBody>
                      </SlideSurface>
                    </TextStyleScope>
                  </ScaledSlide>
                  <div className="rounded-app-sm bg-app-background p-3">
                    <p className="text-xs font-medium text-app-muted">Script</p>
                    {script ? (
                      <p className="mt-1 text-sm leading-relaxed whitespace-pre-wrap text-app-foreground">{script}</p>
                    ) : (
                      <p className="mt-1 text-sm text-app-muted italic">No script</p>
                    )}
                  </div>
                </li>
              )
            })}
          </ol>
        </ThemeProvider>
      )}
    </div>
  )
}
