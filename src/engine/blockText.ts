import type { ContentBlock } from './contentBlocks'

/*
  Reading and writing one named text field inside a card's blocks.

  Level 3 addresses text by position — "block 2's `text`", "block 3's `items[1]`"
  — so something has to turn that address back into a field on a discriminated
  union without giving every call site a switch over eight block types. That is
  this module.

  Writes are immutable and *narrow*: only the addressed field changes, and the
  block keeps its type. Nothing here can turn a paragraph into a heading or add
  a field the schema doesn't have, which is what keeps inline editing from
  drifting outside the shape zod validates on the way in.
*/

export interface ParsedTextRef {
  blockIndex: number
  field: string
  itemIndex?: number
}

/** Parses a `textRef` string back into its parts; null if it isn't one. */
export function parseTextRef(ref: string): ParsedTextRef | null {
  const parts = ref.split(':')
  if (parts.length < 2 || parts.length > 3) return null
  const blockIndex = Number(parts[0])
  if (!Number.isInteger(blockIndex) || blockIndex < 0) return null
  const field = parts[1]
  if (!field) return null
  if (parts.length === 2) return { blockIndex, field }
  const itemIndex = Number(parts[2])
  if (!Number.isInteger(itemIndex) || itemIndex < 0) return null
  return { blockIndex, field, itemIndex }
}

/** The current text at `ref`, or null if the address doesn't resolve to a string field. */
export function blockFieldText(blocks: ContentBlock[], ref: ParsedTextRef): string | null {
  const block = blocks[ref.blockIndex]
  if (!block) return null

  if (ref.itemIndex !== undefined) {
    const list = (block as Record<string, unknown>)[ref.field]
    if (!Array.isArray(list)) return null
    const item = list[ref.itemIndex]
    return typeof item === 'string' ? item : null
  }

  const value = (block as Record<string, unknown>)[ref.field]
  return typeof value === 'string' ? value : null
}

/**
 * Returns a new block list with the text at `ref` replaced.
 *
 * The original array and every block in it are left untouched — the store keeps
 * previous block arrays alive inside undo snapshots, so mutating in place here
 * would rewrite history as well as the present.
 */
export function setBlockFieldText(
  blocks: ContentBlock[],
  ref: ParsedTextRef,
  nextText: string,
): ContentBlock[] {
  const block = blocks[ref.blockIndex]
  if (!block) return blocks
  if (blockFieldText(blocks, ref) === null) return blocks

  const updated =
    ref.itemIndex === undefined
      ? { ...block, [ref.field]: nextText }
      : {
          ...block,
          [ref.field]: (block as unknown as Record<string, string[]>)[ref.field].map((item, i) =>
            i === ref.itemIndex ? nextText : item,
          ),
        }

  return blocks.map((b, i) => (i === ref.blockIndex ? (updated as ContentBlock) : b))
}
