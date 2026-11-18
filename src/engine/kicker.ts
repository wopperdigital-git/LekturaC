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

/** Whether a stored kicker says nothing (empty or whitespace only), which the app treats as no kicker. */
export function isBlankKicker(kicker: string | undefined): boolean {
  return kicker !== undefined && kicker.trim() === ''
}

/**
 * The read boundary's repair: a stored kicker that trims empty is absent. The editor holds
 * `kicker: ""` only while its run is open (it is removed when editing ends), but a debounced
 * save can land first, or the tab can close; either way a deck never reads back with an
 * empty one. The marks held under a removed kicker's address go with it. Nothing changes
 * (the same arrays come back) when no heading has a blank kicker.
 */
export function withoutBlankKickers<I extends Record<string, unknown> | undefined>(
  blocks: ContentBlock[],
  inline: I,
): { blocks: ContentBlock[]; inline: I } {
  if (!blocks.some((b) => b.type === 'heading' && isBlankKicker(b.kicker))) return { blocks, inline }
  let nextInline: Record<string, unknown> | undefined = inline
  const next = blocks.map((b, i) => {
    if (b.type !== 'heading' || !isBlankKicker(b.kicker)) return b
    if (nextInline && `${i}:kicker` in nextInline) {
      const { [`${i}:kicker`]: _dropped, ...rest } = nextInline
      void _dropped
      nextInline = rest
    }
    return withKicker(b, null)
  })
  return { blocks: next, inline: nextInline as I }
}
