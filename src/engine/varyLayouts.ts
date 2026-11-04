import type { ContentBlock, LayoutType } from './contentBlocks'
import { cardKind, chooseLayout, componentsForKind } from './layoutEngine'

/**
 * The arrangement a card moves to when it would repeat the previous one, keyed
 * on what the classifier resolves it to. Unordered items go to a checklist
 * (not a numbered list: numbering implies an order they do not have), and a
 * stat grid goes to a stat list (not `statHero`, which draws only the first
 * stat large and leaves the rest as leftovers).
 */
const SUCCESSOR: Partial<Record<LayoutType, Exclude<LayoutType, 'auto'>>> = {
  iconGrid: 'checklist',
  numberedList: 'checklist',
  statGrid: 'statList',
  timeline: 'timelineRow',
  comparison: 'comparisonTable',
}

/**
 * Neighbouring slides never share an arrangement.
 *
 * Run once at ingest, after `generatedLayout`. Walks the cards in order keeping
 * the layout the previous card will actually render with (its explicit layout,
 * including one assigned here, else what the classifier resolves it to). A card
 * still on `'auto'` whose own resolution equals that is given its successor
 * from `SUCCESSOR` as an explicit layout, but only when both the resolved
 * layout and the successor belong to the card's own kind (a quote plus a list
 * has kind quote but resolves to a list layout; a list variety there would be
 * wrong, so it stays `'auto'`). Otherwise it stays `'auto'`.
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
        const successor = SUCCESSOR[rendered]
        const own = componentsForKind(cardKind(card.blocks, context), card.blocks)
        if (successor && own.includes(rendered as Exclude<LayoutType, 'auto'>) && own.includes(successor)) {
          layout = successor
          rendered = successor
        }
      }
    }
    out.push(layout)
    previous = rendered
  })
  return out
}
