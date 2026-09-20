import type { BulletListBlock, ComparisonGroupBlock, ContentBlock } from './contentBlocks'

/*
  Adding one item to a list by hand.

  Pure and store-free, like `cardTemplates.ts`, so the rules that decide what
  "add an item" may touch are testable without a store or a DOM.

  Two properties are load-bearing:

  - **An item is only ever appended.** Everything addressing text on a card — a
    `textRef` (`"3:items:2"`), a mark's offsets, an adjustment — names an item by
    its position, so inserting one in the middle would slide every later item's
    formatting onto its neighbour. Appending shifts nothing.
  - **No block is added, moved or removed.** A block's index is its address
    everywhere else in the app (see `engine/groups.ts`), and that stays true:
    only the `items` array inside one block grows.
*/

/** The text a fresh item starts with — instructional, and selected on arrival so typing replaces it. */
export const NEW_ITEM_TEXT = 'New item'

/**
 * The most items a list can be grown to by hand. The classifier and the layouts
 * cope with more, but a slide with a dozen bullets has stopped being a slide.
 */
export const MAX_LIST_ITEMS = 12

type ItemList = BulletListBlock | ComparisonGroupBlock

function isItemList(block: ContentBlock | undefined): block is ItemList {
  return block?.type === 'bulletList' || block?.type === 'comparisonGroup'
}

function hasRoom(block: ItemList): boolean {
  return block.items.length < MAX_LIST_ITEMS
}

/**
 * The block an "Add item" action would grow, or `null` when there is nothing it
 * could act on.
 *
 * With an element selected it acts on that element, and only if it is a list:
 * selecting a heading and pressing "add item" must not quietly grow some other
 * list on the card. With nothing selected it acts on the card's list, but only
 * when there is exactly one — with two, guessing which one was meant would be
 * wrong half the time.
 */
export function listTarget(blocks: ContentBlock[], selectedIndex: number | null): number | null {
  if (selectedIndex !== null) {
    const block = blocks[selectedIndex]
    return isItemList(block) && hasRoom(block) ? selectedIndex : null
  }
  const lists = blocks.flatMap((block, index) => (isItemList(block) ? [index] : []))
  if (lists.length !== 1) return null
  const only = blocks[lists[0]]
  return isItemList(only) && hasRoom(only) ? lists[0] : null
}

/**
 * `blocks` with one new item appended to the list at `blockIndex`, and the
 * position that item landed at. `null` when the block is not a list or is full.
 * The input is never mutated.
 */
export function withItemAdded(
  blocks: ContentBlock[],
  blockIndex: number,
): { blocks: ContentBlock[]; itemIndex: number } | null {
  const block = blocks[blockIndex]
  if (!isItemList(block) || !hasRoom(block)) return null
  const next: ItemList = { ...block, items: [...block.items, NEW_ITEM_TEXT] }
  return {
    blocks: blocks.map((existing, index) => (index === blockIndex ? next : existing)),
    itemIndex: block.items.length,
  }
}
