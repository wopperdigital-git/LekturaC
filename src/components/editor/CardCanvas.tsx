import type { RefObject } from 'react'
import type { Card } from '@/engine/contentBlocks'
import { LayoutRenderer } from '@/components/layouts/LayoutRenderer'
import { SlideSurface } from '@/components/theme/SlideSurface'

/**
 * Renders the deck. Cards are read-only here — the canvas has no selection or
 * editing of its own; `cardRefs` exists only so the outline sidebar can scroll
 * a card into view.
 */
export function CardCanvas({
  cards,
  cardRefs,
}: {
  cards: Card[]
  cardRefs: RefObject<Map<string, HTMLDivElement>>
}) {
  const sorted = [...cards].sort((a, b) => a.orderIndex - b.orderIndex)

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-10 px-6 py-10">
      {sorted.map((card, index) => (
        <div
          key={card.id}
          ref={(el) => {
            if (el) cardRefs.current.set(card.id, el)
            else cardRefs.current.delete(card.id)
          }}
        >
          <SlideSurface className="w-full rounded-slide p-8 shadow-slide sm:p-10">
            <LayoutRenderer card={card} context={{ isFirstCard: index === 0 }} />
          </SlideSurface>
        </div>
      ))}
    </div>
  )
}
