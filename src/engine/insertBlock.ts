import type { Card, ContentBlock } from './contentBlocks'
import { pointRuns } from './groups'
import { MAX_BLOCKS } from './newContent'
import { isBareIndex, orUndefined, remapInline, spell } from './removeElement'

/*
  Inserting a block in the middle of a card — the plus under a run of term rows.

  Pure and store-free, and the exact inverse of `withBlockRemoved`: both share the same key
  rules (`remapInline`, `spell`), so `withBlockRemoved(withBlockInserted(card, i, b), i)` is the
  original card. That matters because a block's index is its address everywhere — `textRef`,
  `card.adjusts` key, the bare-index typography key in `card.inline` — so putting a block at `at`
  moves every address from `at` up by one, and each of those keys has to follow its element or the
  marks and nudges slide onto the neighbour. The new block itself starts with none.

  The Insert menu still only appends (nothing shifts); this is for the one place a position
  matters, a row added to the middle of a table.
*/

type Insertable = Pick<Card, 'blocks' | 'inline' | 'adjusts'>

/** What an insertion produces: the three pieces of a card that are addressed by position. */
export interface Insertion {
  blocks: ContentBlock[]
  inline: Card['inline']
  adjusts: Card['adjusts']
}

/**
 * The card with `block` inserted at index `at` (0 to the block count, so the end is allowed),
 * every address from `at` up renumbered by one. `null` when `at` is out of range or the card
 * already holds `MAX_BLOCKS`. Keys that are not addresses are kept as they are. The input is
 * never mutated.
 */
export function withBlockInserted(card: Insertable, at: number, block: ContentBlock): Insertion | null {
  if (!Number.isInteger(at) || at < 0 || at > card.blocks.length) return null
  if (card.blocks.length >= MAX_BLOCKS) return null

  const inline = remapInline(card.inline, ({ blockIndex, field, itemIndex }) =>
    spell(blockIndex >= at ? blockIndex + 1 : blockIndex, field, itemIndex),
  )

  const adjusts: NonNullable<Card['adjusts']> = {}
  for (const [key, value] of Object.entries(card.adjusts ?? {})) {
    if (!isBareIndex(key)) {
      adjusts[key] = value
      continue
    }
    const index = Number(key)
    adjusts[String(index >= at ? index + 1 : index)] = value
  }

  return {
    blocks: [...card.blocks.slice(0, at), block, ...card.blocks.slice(at)],
    inline,
    adjusts: orUndefined(adjusts),
  }
}

/**
 * The consecutive run of `point` blocks that holds `index`, as its first and last index; `null`
 * when `index` is not a point. A lone point is a run of one. Agrees with `pointRuns`, which is
 * what the frames draw a table from.
 */
export function pointRun(blocks: ContentBlock[], index: number): { start: number; end: number } | null {
  if (blocks[index]?.type !== 'point') return null
  const unit = pointRuns(
    blocks,
    blocks.map((_, i) => i),
  ).find((run) => run.includes(index))
  if (!unit) return null
  return { start: unit[0], end: unit[unit.length - 1] }
}

/**
 * Which block carries the add-row plus when `selected` is picked: the last row of the run of term
 * rows holding it (the plus sits under the table, not under whichever row was picked), or `null`
 * when `selected` is not a point or the card is full (`MAX_BLOCKS`, so no row could be added).
 */
export function rowPlusCarrier(blocks: ContentBlock[], selected: number): number | null {
  if (blocks.length >= MAX_BLOCKS) return null
  return pointRun(blocks, selected)?.end ?? null
}
