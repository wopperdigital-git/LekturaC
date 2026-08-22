import type { ContentBlock } from '@/engine/contentBlocks'

/*
  The editor finds what you clicked through two data attributes rather than any
  React wiring, which is what keeps the twelve layout components free of
  selection/editing concerns:

    data-block-index  the block's position in `card.blocks`
    data-text-path    which text on that block this node renders (see engine/blockText)

  Layouts pick blocks by type (`blocksOfType`), so they hold the block object but
  not its index — `idx` recovers it by identity. Blocks are never copied between
  a card and its render, so reference equality is exact here.

  A node with only `data-block-index` is selectable but not editable (an image);
  a node with both is editable text.
*/
export function idx(blocks: ContentBlock[], block: ContentBlock | undefined): number | undefined {
  if (!block) return undefined
  const found = blocks.indexOf(block)
  return found < 0 ? undefined : found
}
