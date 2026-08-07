import type { RefObject } from 'react'
import type { Card } from '@/engine/contentBlocks'
import { LayoutRenderer } from '@/components/layouts/LayoutRenderer'

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
          className="w-full rounded-slide bg-slide-background p-8 shadow-slide sm:p-10"
        >
          <LayoutRenderer card={card} context={{ isFirstCard: index === 0 }} />
        </div>
      ))}
    </div>
  )
}
