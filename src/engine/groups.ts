import type {
  BulletListBlock,
  ComparisonGroupBlock,
  ContentBlock,
  ImageBlock,
  LayoutType,
  StatBlock,
  TimelineStepBlock,
} from './contentBlocks'
import { MAX_CHIP_ITEMS, SHORT_ITEM_MAX_CHARS } from './layoutEngine'

/**
 * Gamma-style arrangement per run of items, derived at render time.
 *
 * A card's layout used to be chosen for the whole card, so any block outside
 * the winning layout's vocabulary had nowhere to go. Here a card is read as a
 * sequence of render nodes instead: a *leaf* is one block drawn on its own, a
 * *group* is a run of same-type blocks drawn in one arrangement. One card can
 * then hold a timeline and a stat row and a paragraph, each in its place.
 *
 * Nothing here is stored. That is safe only because of one invariant, which
 * `groups.test.ts` pins exhaustively:
 *
 *   inferGroups never reorders, drops or duplicates a block, and every block
 *   keeps its ORIGINAL index.
 *
 * The index is the block's address everywhere else in the app — its `textRef`
 * (`"4:value"`), its `card.adjusts` key, its `data-block-index` attribute, the
 * editor's `selectedBlockIndex`. Keeping it means grouping changes how a card
 * looks and nothing about how it is stored, edited, nudged, exported or
 * narrated. Design: docs/superpowers/specs/2026-09-18-smart-layout-groups-design.md
 */

/** A block together with its index in `card.blocks`. */
export interface Indexed<T extends ContentBlock = ContentBlock> {
  block: T
  index: number
}

/** One block drawn on its own. */
export interface LeafNode {
  kind: 'leaf'
  block: ContentBlock
  index: number
}

/**
 * A run of blocks drawn in one arrangement. Each arrangement belongs to exactly
 * one block type, so `GroupRenderer`'s switch narrows `items` to that type with
 * no casts. A bullet list is a group of ONE block: its arrangement applies to
 * the items inside that list, not to a run of lists.
 */
export type GroupNode =
  | { kind: 'group'; arrangement: 'boxes'; items: Indexed<StatBlock>[] }
  | { kind: 'group'; arrangement: 'timeline'; items: Indexed<TimelineStepBlock>[] }
  | { kind: 'group'; arrangement: 'columns'; items: Indexed<ComparisonGroupBlock>[] }
  | { kind: 'group'; arrangement: 'gallery'; items: Indexed<ImageBlock>[] }
  | { kind: 'group'; arrangement: 'chips' | 'numbered'; items: [Indexed<BulletListBlock>] }

export type RenderNode = LeafNode | GroupNode

export type Arrangement = GroupNode['arrangement']

/**
 * A run shorter than this stays as leaves: a one-step timeline is not a
 * timeline, a lone stat is not a grid. It matches the classifier, which needs
 * two of each before it will award `statGrid`, `timeline`, `comparison` or
 * `gallery`.
 */
export const MIN_RUN = 2

/** Block types whose consecutive runs become groups. */
const RUN_TYPES: ReadonlySet<ContentBlock['type']> = new Set([
  'stat',
  'timelineStep',
  'comparisonGroup',
  'image',
])

/**
 * How a bullet list is arranged.
 *
 * An explicit layout wins, which is what keeps the Level 2 picker working: a
 * user who chose "Numbered list" for a card of three short items gets numbers,
 * not chips. Otherwise it is the classifier's own `iconGrid` rule, read from the
 * same exported constants so the two cannot drift apart.
 */
export function listArrangement(list: BulletListBlock, hint: LayoutType): 'chips' | 'numbered' {
  if (hint === 'iconGrid') return 'chips'
  if (hint === 'numberedList') return 'numbered'
  const short =
    list.items.length <= MAX_CHIP_ITEMS && list.items.every((item) => item.length <= SHORT_ITEM_MAX_CHARS)
  return short ? 'chips' : 'numbered'
}

/*
  Turns a run into its group, or null when the run is too short.

  The casts are sound rather than convenient: every block in `run` shares
  `run[0].block.type`, because `inferGroups` only ever extends a run while the
  type matches. TypeScript cannot follow that across the loop, so it is
  asserted here, once, next to the switch that proves which type it is.
*/
function runGroup(run: Indexed[]): GroupNode | null {
  if (run.length < MIN_RUN) return null
  switch (run[0].block.type) {
    case 'stat':
      return { kind: 'group', arrangement: 'boxes', items: run as Indexed<StatBlock>[] }
    case 'timelineStep':
      return { kind: 'group', arrangement: 'timeline', items: run as Indexed<TimelineStepBlock>[] }
    case 'comparisonGroup':
      return { kind: 'group', arrangement: 'columns', items: run as Indexed<ComparisonGroupBlock>[] }
    case 'image':
      return { kind: 'group', arrangement: 'gallery', items: run as Indexed<ImageBlock>[] }
    default:
      return null
  }
}

/**
 * A card's blocks as render nodes, in their original order.
 *
 * Runs are **consecutive only**. Two stats separated by a paragraph are two
 * leaves and a paragraph, in that order — never a grid with the paragraph moved
 * to the end. The old whole-card layouts reordered content to fit their shape;
 * keeping the author's order is what lets every index stay put.
 *
 * `hint` is the card's stored `layout` (usually `'auto'`), passed so an
 * explicit picker choice still governs a bullet list's arrangement.
 */
export function inferGroups(blocks: ContentBlock[], hint: LayoutType = 'auto'): RenderNode[] {
  const nodes: RenderNode[] = []
  let i = 0
  while (i < blocks.length) {
    const block = blocks[i]

    if (block.type === 'bulletList') {
      nodes.push({
        kind: 'group',
        arrangement: listArrangement(block, hint),
        items: [{ block, index: i }],
      })
      i += 1
      continue
    }

    if (RUN_TYPES.has(block.type)) {
      let end = i + 1
      while (end < blocks.length && blocks[end].type === block.type) end += 1
      const run = blocks.slice(i, end).map((item, offset) => ({ block: item, index: i + offset }))
      const group = runGroup(run)
      if (group) nodes.push(group)
      else for (const item of run) nodes.push({ kind: 'leaf', block: item.block, index: item.index })
      i = end
      continue
    }

    nodes.push({ kind: 'leaf', block, index: i })
    i += 1
  }
  return nodes
}

/**
 * Every block the nodes hold, in order, with its index. The inverse of
 * `inferGroups` — `flattenNodes(inferGroups(b))` is `b` indexed — which is the
 * invariant the tests pin. Also how `GroupRenderer` draws an arrangement it
 * does not implement yet: as the plain blocks it is made of.
 */
export function flattenNodes(nodes: RenderNode[]): Indexed[] {
  return nodes.flatMap((node): Indexed[] =>
    node.kind === 'leaf' ? [{ block: node.block, index: node.index }] : [...node.items],
  )
}

/**
 * A stable React key for a node: its first block's index. Unique within a card
 * because no block belongs to two nodes, and stable because a block's index is
 * fixed for the card's whole life.
 */
export function nodeKey(node: RenderNode): number {
  return node.kind === 'leaf' ? node.index : node.items[0].index
}
