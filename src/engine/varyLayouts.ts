import type { ContentBlock, LayoutType } from './contentBlocks'
import { cardKind, chooseLayout, componentsForKind } from './layoutEngine'

/**
 * Neighbouring slides never share an arrangement.
 *
 * Run once at ingest, after `generatedLayout`. Walks the cards in order keeping
 * the layout the previous card will actually render with (its explicit layout,
 * including one assigned here, else what the classifier resolves it to). A card
 * still on `'auto'` whose own resolution equals that gets the first layout of
 * its own kind that differs from it, as an explicit layout. A kind with no
 * other component (quote, title, gallery) stays `'auto'`.
 *
 * Only `layout` is returned: blocks are never touched, so the block-index
 * invariant (textRef, adjusts, inline keys) holds. The classifier itself still
 * never awards the varieties; only this ingest step does.
 */
export function varyLayouts(cards: { blocks: ContentBlock[]; layout: LayoutType }[]): LayoutType[] {
  const out: LayoutType[] = []
  let previous: LayoutType | null = null
  cards.forEach((card, i) => {
    const context = { isFirstCard: i === 0 }
    let layout: LayoutType = card.layout
    let rendered: LayoutType = card.layout
    if (card.layout === 'auto') {
      rendered = chooseLayout(card.blocks, context)
      if (rendered === previous) {
        const alternative = componentsForKind(cardKind(card.blocks, context), card.blocks).find(
          (candidate) => candidate !== previous,
        )
        if (alternative) {
          layout = alternative
          rendered = alternative
        }
      }
    }
    out.push(layout)
    previous = rendered
  })
  return out
}
