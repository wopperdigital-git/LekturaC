import type { ContentBlock } from './contentBlocks'

/**
 * The blocks a layout did NOT draw, so it can stack them below what it did.
 *
 * Eleven of the twelve layout components once picked the block types they
 * understood out of the card (`blocksOfTypeIndexed`) and rendered only those.
 * Anything else on the card was drawn nowhere — while the PPTX export walks
 * `card.blocks.forEach` and the narration script walks `contentLines(blocks)`,
 * so the same card had one content on screen, another in the .pptx and a third
 * in the script. The AI chooses what blocks a card holds, so it could put text
 * on a slide that the user only discovered by exporting it.
 *
 * Five frame layouts now name the indices they drew and render the remainder,
 * which turns "does this layout account for every block?" into a property of
 * one pure function instead of five hand-written JSX trees. Family layouts
 * (stat grid, timeline, comparison, icon grid, numbered list, gallery) were
 * deleted; those cards now render through `FlowLayout`/`GroupRenderer` instead.
 * There are no component tests in this repo by design, so being pure is what
 * makes the guarantee testable at all.
 *
 * The index travels with the block because it is the address every text run is
 * built from (`textRef`) and the key `card.adjusts` uses: a leftover rendered
 * under a fresh, renumbered index would store its formatting and its nudge
 * against a different block.
 */
export function leftoverBlocks(
  blocks: ContentBlock[],
  consumed: Iterable<number>,
): { block: ContentBlock; index: number }[] {
  // A Set because callers build `consumed` by concatenating several
  // `blocksOfTypeIndexed` results: it arrives grouped by type rather than
  // sorted, and a block a layout draws in two slots arrives twice.
  const drawn = new Set(consumed)
  const out: { block: ContentBlock; index: number }[] = []
  blocks.forEach((block, index) => {
    if (!drawn.has(index)) out.push({ block, index })
  })
  return out
}
