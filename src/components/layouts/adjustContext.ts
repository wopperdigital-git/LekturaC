import { createContext, useContext, type HTMLAttributes } from 'react'
import type { BlockAdjust, BlockAdjusts } from '@/engine/blockAdjust'
import { parseTextRef } from '@/engine/blockText'
import type { Card } from '@/engine/contentBlocks'

/**
 * Per-element data for one card: where each element was nudged to, and how its
 * own text was styled.
 *
 * Separate from `BlockAdjustContext` below, and the split is load-bearing. This
 * is *data*, and every surface that draws a slide has to provide it — the
 * editor canvas, the presenter view, the outline thumbnails — or an element the
 * user moved would sit where they put it on the canvas and snap back to its
 * layout position everywhere else. `BlockAdjustContext` is *interaction*, and
 * belongs to the editor alone.
 */
export interface BlockData {
  adjusts: BlockAdjusts | undefined
  /**
   * The card's `inline` record. Element-level styling lives in it under a bare
   * block index (see `blockStyleKey`); a single run's styling lives under a full
   * `textRef`. The two cannot collide, because `parseTextRef` rejects a key with
   * no field.
   */
  inline: Card['inline']
}

export const BlockDataContext = createContext<BlockData | null>(null)

/**
 * The `inline` key that addresses a whole element rather than one run of text
 * inside it.
 *
 * Reusing `card.inline` rather than adding a column: the record already exists,
 * is already persisted, and already carries style keyed by address. A bare index
 * is unambiguous, because `parseTextRef` needs at least `index:field` — so
 * nothing that reads runs can mistake this for one.
 */
export function blockStyleKey(index: number): string {
  return String(index)
}

/**
 * The block a `textRef` addresses, or `null` if the string is not one.
 *
 * Several components are handed a `textRef` and need the block index inside it
 * — `Heading` and `StatBlockView` to wrap themselves, `EditableText` to ask
 * whether its own element is the one carrying a selection box. It parses
 * through `parseTextRef` rather than splitting on `:` by hand so there is one
 * definition of what a ref is, and it returns `null` rather than falling back
 * to a number: an index guessed for an unparseable ref would be a *real*
 * block's index, and two holders stamped with the same `data-block-index`
 * leave `measureBlock`'s `querySelector` picking whichever came first in the
 * DOM — a selection box drawn around the wrong element.
 */
export function blockIndexOf(ref: string): number | null {
  return parseTextRef(ref)?.blockIndex ?? null
}

/**
 * What a rendered element needs in order to be selectable and adjustable.
 *
 * Passed by context rather than by props for exactly the reason
 * `textEditingContext` is: the twelve layout components sit between the canvas
 * and the elements, and threading props through every one of them — for
 * something only the editor uses — would make the presenter view and the
 * outline thumbnails carry editing plumbing they never exercise.
 */
export interface BlockAdjusting {
  /** The element carrying the selection box, or null. */
  selected: number | null
  /**
   * The item of `selected` that is picked out, or null. Only meaningful with a
   * selected element: an item belongs to a list, so it is a refinement of that
   * element rather than a second selection beside it.
   */
  selectedItem: number | null
  select: (index: number | null) => void
  /** A press on one item of a list — one bullet, one entry of a comparison group. */
  selectItem: (blockIndex: number, itemIndex: number) => void
  /** `commit` marks the release of a gesture, which is persisted right away. */
  change: (index: number, adjust: BlockAdjust, commit?: boolean) => void
}

export const BlockAdjustContext = createContext<BlockAdjusting | null>(null)

export function useBlockAdjusting(): BlockAdjusting | null {
  return useContext(BlockAdjustContext)
}

/**
 * The attribute an item carries while it is the selected one. The highlight is
 * plain CSS on this attribute (see `index.css`) rather than a box we draw, which
 * is what lets every arrangement's own container — a chip, a tile, a row, a table
 * cell — be the thing that lights up without any of them knowing about selection.
 */
export const ITEM_SELECTED_ATTR = 'data-item-selected'

const NO_ITEM_PROPS = (): HTMLAttributes<HTMLElement> => ({})

/**
 * What to spread onto an item's own container so it can be picked out on its own.
 *
 * Returned as a function of the item's address so a layout that draws a whole
 * list calls the hook once and then spreads per item. With no editing context —
 * the presenter, the thumbnails — it spreads nothing, so those surfaces carry no
 * handlers and no attribute.
 *
 * The press stops here. Left to bubble, the `Adjustable` around the list would
 * read it as a press on the list and replace the item selection with a list
 * selection in the same gesture; a press in the *gap* between items still
 * reaches it, which is how the list itself is picked.
 */
export function useItemProps(): (blockIndex: number, itemIndex: number) => HTMLAttributes<HTMLElement> {
  const adjusting = useContext(BlockAdjustContext)
  if (!adjusting) return NO_ITEM_PROPS
  return (blockIndex, itemIndex) => ({
    onPointerDown: (event) => {
      event.stopPropagation()
      adjusting.selectItem(blockIndex, itemIndex)
    },
    onClick: (event) => event.stopPropagation(),
    ...(adjusting.selected === blockIndex && adjusting.selectedItem === itemIndex
      ? { [ITEM_SELECTED_ATTR]: '' }
      : {}),
  })
}

/**
 * The attribute `Adjustable` stamps on its holder, and the only way
 * `SelectionLayer` finds an element to measure.
 *
 * Measured off the DOM rather than computed, because only the browser knows
 * where an element ended up: the position is whatever one of twelve
 * hand-designed layout components decided, after the text wrapped at the card's
 * current width. An attribute rather than a registration callback, so there is
 * no lifecycle to keep in sync and no render in which the layer holds a stale
 * node.
 */
export const BLOCK_INDEX_ATTR = 'data-block-index'

/**
 * The index of the nearest `Adjustable` above, so it cannot wrap itself twice.
 *
 * Load-bearing, not tidiness. `BlockRenderer` wraps every block, and `Heading`
 * and `StatBlockView` wrap themselves as well — they are rendered directly by
 * most of the twelve layouts, which never go through `BlockRenderer`. A heading
 * reached through `BlockRenderer` therefore nests two holders, and since both
 * are `display: contents`, the outer one's first element child is *another*
 * boxless div: `getBoundingClientRect` returns all zeroes and the selection box
 * collapses to a dot in the corner of the card.
 */
export const AdjustedIndexContext = createContext<number | null>(null)

/**
 * The element a holder actually stands for.
 *
 * `display: contents` generates no box, so the holder itself cannot be measured
 * or styled — and neither can a nested holder. This walks down to the first
 * descendant that really is laid out, which is the node the layout produced.
 */
export function measurableNode(holder: Element): HTMLElement | null {
  let node: Element | null = holder.firstElementChild
  while (node) {
    if (node instanceof HTMLElement && getComputedStyle(node).display !== 'contents') return node
    node = node.firstElementChild
  }
  return null
}

/**
 * The card's content box, which is the coordinate space every adjustment is
 * measured against.
 *
 * Separate from the two above because it has a different source: whatever draws
 * the card provides it, and it is needed even with no editing at all —
 * `Adjustable` reads it to turn a stored fraction back into pixels.
 */
export const CardBoxContext = createContext<{ width: number } | null>(null)

/**
 * The attribute `SlideBody` stamps on the element that defines a card's
 * coordinate space.
 *
 * The toolbar acts on elements it is not drawing a box around, so it has to
 * find that space itself. Locating it by attribute keeps `SlideBody` usable at
 * its three call sites with no ref threaded through any of them.
 */
export const SLIDE_BODY_ATTR = 'data-slide-body'
