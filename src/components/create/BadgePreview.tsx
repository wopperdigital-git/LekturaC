import { forwardRef, useMemo, useRef } from 'react'
import { SlidePreview } from '@/components/editor/SlidePreview'
import type { Card } from '@/engine/contentBlocks'
import { EMPTY_TEXT_STYLE } from '@/engine/textStyle'
import { DEFAULT_THEME } from '@/lib/theme-tokens'
import { rise, useMotion } from '@/lib/motion'

export interface BadgeMetaPart {
  text: string
  /** Shown muted: the brief has no answer here yet. */
  missing?: boolean
}

/**
 * The deck's dashboard badge (DeckCard's silhouette: punched lanyard slot,
 * 16:9 cover, track stripe, title and meta) filled in from the brief as it is
 * written. Purely a picture of the brief, so it is hidden from assistive tech;
 * the form itself carries every answer.
 *
 * The cover goes through the dashboard's own path (`SlidePreview`): slide 1 of
 * every generated deck is a hero title slide in the default theme, so a hero
 * card holding the topic is the closest honest picture of it. The track stripe
 * is neutral: a deck's track is a hash of its id, and the deck has none yet.
 */
export const BadgePreview = forwardRef<HTMLDivElement, { topic: string; meta: BadgeMetaPart[] }>(
  function BadgePreview({ topic, meta }, ref) {
    const metaKey = meta.map((part) => part.text).join('|')

    const cover = useMemo<Card>(
      () => ({
        id: 'brief-preview',
        orderIndex: 0,
        blocks: [{ type: 'heading', text: topic || 'Your topic goes here' }],
        layout: 'hero',
        visualStyle: 'structured',
      }),
      [topic],
    )

    // A changed setting re-lands on the badge; the first render just shows it.
    const firstRun = useRef(true)
    const metaRef = useMotion<HTMLParagraphElement>(
      ({ reduce, root }) => {
        if (firstRun.current) {
          firstRun.current = false
          return
        }
        rise(root, reduce, { y: 4, duration: 0.26 })
      },
      [metaKey],
    )

    return (
      <div
        ref={ref}
        aria-hidden="true"
        className="relative rounded-app border border-app-foreground bg-app-background shadow-app"
      >
        <span className="pointer-events-none absolute top-2.5 left-1/2 z-10 h-2 w-10 -translate-x-1/2 rounded-full bg-app-canvas shadow-[inset_0_1px_2px_rgba(17,17,17,0.35)] ring-1 ring-app-foreground/40" />
        <SlidePreview
          card={cover}
          theme={DEFAULT_THEME}
          textStyle={EMPTY_TEXT_STYLE}
          isFirstCard
          className={`aspect-video w-full rounded-t-app ${topic ? '' : 'opacity-60'}`}
        />
        <div className="h-1.5 bg-app-border" />
        <div className="px-5 py-4">
          <p className={`line-clamp-2 font-bold ${topic ? 'text-app-foreground' : 'text-app-muted'}`}>
            {topic || 'Untitled presentation'}
          </p>
          <p ref={metaRef} className="mt-1 text-xs text-app-muted">
            {meta.map((part, i) => (
              <span key={i}>
                {i > 0 && ' · '}
                <span className={part.missing ? undefined : 'text-app-foreground'}>{part.text}</span>
              </span>
            ))}
          </p>
        </div>
      </div>
    )
  },
)
