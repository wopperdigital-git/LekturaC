import type { Card, ContentBlock } from './contentBlocks'
import { parseTextRef } from './blockText'

/*
  Removing an element from a card, or one item from a list inside it.

  Pure and store-free, like `listItems.ts` and `cardTemplates.ts`, so the part
  that is easy to get silently wrong — what happens to everything *keyed by
  position* — is testable without a store or a DOM.

  That is the whole difficulty. A block's index is its address everywhere: its
  `textRef` (`"3:items:2"`), its `card.adjusts` key, the bare-index key that
  carries its own typography in `card.inline`. Deleting block 2 makes block 3 the
  new block 2, so every one of those keys has to follow it or the formatting and
  the nudges slide onto whatever element moved into the gap — silently and
  permanently. The same holds one level down for an item: removing item 1 of a
  list makes item 2 the new item 1.

  So a removal is never just "filter the array". It returns the new `blocks`
  together with the `inline` and `adjusts` those blocks need, rewritten in the
  same step.
*/

/** What a removal produces: the three pieces of a card that are addressed by position. */
export interface Removal {
  blocks: ContentBlock[]
  inline: Card['inline']
  adjusts: Card['adjusts']
  /** Whether a whole block went — always true for `withBlockRemoved`, and for `withItemRemoved` only when it emptied a list. */
  blockRemoved: boolean
}

type Removable = Pick<Card, 'blocks' | 'inline' | 'adjusts'>

/** `inline` is keyed by a bare block index for an element's own style, or a full `textRef` for a run. */
function isBareIndex(key: string): boolean {
  return /^\d+$/.test(key)
}

/** `undefined` rather than an empty record: an untouched card has neither, and that is how absence is stored. */
function orUndefined<T extends Record<string, unknown>>(record: T): T | undefined {
  return Object.keys(record).length > 0 ? record : undefined
}

/**
 * Rewrites every key of `inline` for a removal: `remap` gets the block, field and
 * item a key addresses (`field` is `null` for a bare block index) and returns the
 * key's new spelling, or `null` to drop it. A key that is not an address at all is
 * kept as it is — losing data nobody asked to lose is the worse mistake.
 */
function remapInline(
  inline: Card['inline'],
  remap: (address: { blockIndex: number; field: string | null; itemIndex?: number }) => string | null,
): Card['inline'] {
  if (!inline) return undefined
  const next: NonNullable<Card['inline']> = {}
  for (const [key, value] of Object.entries(inline)) {
    let renamed: string | null
    if (isBareIndex(key)) {
      renamed = remap({ blockIndex: Number(key), field: null })
    } else {
      const parsed = parseTextRef(key)
      renamed = parsed ? remap(parsed) : key
    }
    if (renamed !== null) next[renamed] = value
  }
  return orUndefined(next)
}

function spell(blockIndex: number, field: string | null, itemIndex?: number): string {
  if (field === null) return String(blockIndex)
  return itemIndex === undefined ? `${blockIndex}:${field}` : `${blockIndex}:${field}:${itemIndex}`
}

/**
 * The card without block `blockIndex`, with every later block's formatting and
 * nudges renumbered to follow it and the removed block's own dropped.
 *
 * `null` only when there is nothing to remove: an index out of range.
 *
 * The card's last block *can* go, and what is left is a card with no blocks —
 * a clear, blank slide. Removing the last element removes the element and
 * nothing more; the card is the user's, and deleting it is a different act with
 * its own control. A blank card is still a real card: it stays in the deck,
 * stays selectable, and "change slide type" gives it content again.
 */
export function withBlockRemoved(card: Removable, blockIndex: number): Removal | null {
  if (!card.blocks[blockIndex]) return null

  const inline = remapInline(card.inline, ({ blockIndex: at, field, itemIndex }) => {
    if (at === blockIndex) return null
    return spell(at > blockIndex ? at - 1 : at, field, itemIndex)
  })

  const adjusts: NonNullable<Card['adjusts']> = {}
  for (const [key, value] of Object.entries(card.adjusts ?? {})) {
    const at = Number(key)
    if (at === blockIndex) continue
    adjusts[String(at > blockIndex ? at - 1 : at)] = value
  }

  return {
    blocks: card.blocks.filter((_, index) => index !== blockIndex),
    inline,
    adjusts: orUndefined(adjusts),
    blockRemoved: true,
  }
}

/**
 * The card with item `itemIndex` of the list at `blockIndex` removed. Works on a
 * bullet list and on a comparison group's items; anything else is `null`.
 *
 * Only the addresses of *that list's* items after the removed one move, and
 * each by one; nothing about any other block changes. A bullet list left with no
 * items is removed as a block — an empty list draws nothing and could not be
 * selected again — even when it was the card's only element, which leaves the
 * card blank. A comparison group keeps its heading when its last item goes.
 */
export function withItemRemoved(card: Removable, blockIndex: number, itemIndex: number): Removal | null {
  const block = card.blocks[blockIndex]
  if (!block || (block.type !== 'bulletList' && block.type !== 'comparisonGroup')) return null
  if (itemIndex < 0 || itemIndex >= block.items.length) return null

  if (block.type === 'bulletList' && block.items.length === 1) return withBlockRemoved(card, blockIndex)

  const inline = remapInline(card.inline, ({ blockIndex: at, field, itemIndex: item }) => {
    if (at !== blockIndex || field !== 'items' || item === undefined) return spell(at, field, item)
    if (item === itemIndex) return null
    return spell(at, field, item > itemIndex ? item - 1 : item)
  })

  const next: ContentBlock = { ...block, items: block.items.filter((_, index) => index !== itemIndex) }
  return {
    blocks: card.blocks.map((existing, index) => (index === blockIndex ? next : existing)),
    inline,
    adjusts: card.adjusts,
    blockRemoved: false,
  }
}
