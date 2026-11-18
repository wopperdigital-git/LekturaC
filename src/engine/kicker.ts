import type { ContentBlock } from './contentBlocks'

/*
  The small heading over a heading ("kicker"), added by hand. It is a field of the
  heading block, addressed as `textRef(index, 'kicker')`, so it moves, nudges and
  carries marks with the heading it belongs to. Pure and immutable, like the rest
  of the editing engine.
*/

/** The text a kicker starts with; selected on arrival so the first keystroke replaces it. */
export const KICKER_PLACEHOLDER = 'Small heading'

/**
 * A heading with its kicker set to `text`. Empty or whitespace-only text, or `null`,
 * removes the field: a kicker is never stored as `""`. Anything that is not a heading
 * is returned as it is. The input is never mutated.
 */
export function withKicker(block: ContentBlock, text: string | null): ContentBlock {
  if (block.type !== 'heading') return block
  const { kicker: _removed, ...rest } = block
  void _removed
  if (text === null || text.trim() === '') return rest
  return { ...rest, kicker: text }
}

/**
 * `blocks` with the heading at `blockIndex` given (or stripped of) its kicker. Every
 * other block keeps its object and its index. `null` when that block is not a heading.
 */
export function withKickerAt(blocks: ContentBlock[], blockIndex: number, text: string | null): ContentBlock[] | null {
  const block = blocks[blockIndex]
  if (!block || block.type !== 'heading') return null
  return blocks.map((b, i) => (i === blockIndex ? withKicker(b, text) : b))
}

/** Whether "Add small heading" is on offer: a heading that has no kicker yet. */
export function canAddKicker(block: ContentBlock | undefined): boolean {
  return block?.type === 'heading' && !block.kicker
}
