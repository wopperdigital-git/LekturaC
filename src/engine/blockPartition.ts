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

/**
 * The card's one photo, with its index, or `null` unless it holds exactly one.
 *
 * Exactly one is the rule the classifier uses (`chooseLayout` sets a single photo
 * aside and places it by what else the card holds); two or more are a gallery and
 * are not "the photo" of anything. The layouts that place a photo themselves
 * (background, split, beside a figure, band, image slide) ask this, so a card
 * with several images never has one of them promoted to a background.
 */
export function singlePhoto(
  blocks: ContentBlock[],
): { block: Extract<ContentBlock, { type: 'image' }>; index: number } | null {
  const found = blocks
    .map((block, index) => ({ block, index }))
    .filter((entry): entry is { block: Extract<ContentBlock, { type: 'image' }>; index: number } => entry.block.type === 'image')
  return found.length === 1 ? found[0] : null
}
