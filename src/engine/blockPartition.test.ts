import { describe, expect, it } from 'vitest'
import type { ContentBlock } from './contentBlocks'
import { leftoverBlocks } from './blockPartition'

/**
 * The guard on the defect this module exists for.
 *
 * Eleven of the twelve layout components once rendered only the block types
 * they expected, so a paragraph on a timeline card was drawn nowhere — while
 * the PPTX export (`card.blocks.forEach`) and the narration script
 * (`contentLines`) both carried it. One card, three different contents, and the
 * AI decides which blocks a card holds, so it could generate text the user
 * never saw.
 *
 * Five frame layouts now declare the indices they drew and render whatever is
 * left, which makes "did this layout account for every block?" a question about
 * a pure function rather than about five hand-written JSX trees. Family layouts
 * (stat grid, timeline, comparison, icon grid, numbered list, gallery) were
 * deleted; those cards now render through `FlowLayout`/`GroupRenderer` instead.
 */
const heading: ContentBlock = { type: 'heading', text: 'A heading' }
const para: ContentBlock = { type: 'paragraph', text: 'A paragraph.' }
const stat: ContentBlock = { type: 'stat', value: '42%', label: 'of teams' }
const step: ContentBlock = { type: 'timelineStep', label: 'Q1', text: 'Kickoff' }
const quote: ContentBlock = { type: 'quote', text: 'A line worth quoting' }

const mixed = [heading, stat, para, step, quote]

describe('leftoverBlocks', () => {
  it('returns every block when a layout drew nothing', () => {
    expect(leftoverBlocks(mixed, [])).toEqual([
      { block: heading, index: 0 },
      { block: stat, index: 1 },
      { block: para, index: 2 },
      { block: step, index: 3 },
      { block: quote, index: 4 },
    ])
  })

  it('returns nothing when a layout drew everything', () => {
    expect(leftoverBlocks(mixed, [0, 1, 2, 3, 4])).toEqual([])
  })

  it('returns exactly what was not drawn, with each block keeping its own index', () => {
    // The index is load-bearing: it is what every text run's address is built
    // from (`textRef`), so a leftover rendered under a renumbered index would
    // store its formatting against a different block.
    expect(leftoverBlocks(mixed, [0, 3])).toEqual([
      { block: stat, index: 1 },
      { block: para, index: 2 },
      { block: quote, index: 4 },
    ])
  })

  it('is total: consumed and leftover together cover every index exactly once', () => {
    for (const consumed of [[], [0], [1, 3], [0, 1, 2], [4], [0, 2, 4]]) {
      const leftover = leftoverBlocks(mixed, consumed).map((entry) => entry.index)
      const all = [...consumed, ...leftover].sort((a, b) => a - b)
      expect(all).toEqual([0, 1, 2, 3, 4])
      expect(new Set(all).size).toBe(all.length)
    }
  })

  it('accepts the consumed indices in any order', () => {
    // Layouts build this list by concatenating several `blocksOfTypeIndexed`
    // results, so it arrives grouped by type rather than sorted by position.
    expect(leftoverBlocks(mixed, [3, 0]).map((e) => e.index)).toEqual([1, 2, 4])
  })

  it('tolerates a repeated index', () => {
    // A layout that draws the same block twice (a heading used in two slots)
    // must not cause that block to reappear as a leftover.
    expect(leftoverBlocks(mixed, [0, 0, 1]).map((e) => e.index)).toEqual([2, 3, 4])
  })

  it('ignores an index that is not in the card', () => {
    // Defensive: a layout that filters a stale copy of the blocks must not make
    // a real block vanish from the output.
    expect(leftoverBlocks(mixed, [99, -1, 1]).map((e) => e.index)).toEqual([0, 2, 3, 4])
  })

  it('handles an empty card', () => {
    expect(leftoverBlocks([], [])).toEqual([])
  })
})
