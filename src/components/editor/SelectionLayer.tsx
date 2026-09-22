import { useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { NO_ADJUST, type BlockAdjust } from '@/engine/blockAdjust'
import type { Frame } from '@/engine/frame'
import { clampFrame } from '@/engine/frameGeometry'
import { BlockAdjustContext, BlockDataContext } from '@/components/layouts/adjustContext'
import { currentFrame, measureAt, measureBlock, toAdjust, type Measured } from './measureBlock'
import { SelectionOverlay, type GestureKind } from './SelectionOverlay'
import { ElementActions } from './ElementActions'

/*
  Draws the selection box over whichever element is selected, and turns the
  gestures it reports back into stored adjustments.

  It sits inside the card as a sibling of the content, so it positions itself in
  the card's own coordinate space and is clipped by the card's rounded corners
  like everything else. It never wraps an element and never styles one — how an
  element looks is `Adjustable`'s business, and the box is strictly drawn on top.
*/

export function SelectionLayer({ cardRef }: { cardRef: RefObject<HTMLDivElement | null> }) {
  const adjusting = useContext(BlockAdjustContext)
  const data = useContext(BlockDataContext)
  const selected = adjusting?.selected ?? null
  /*
    No box while an item is picked out. The box belongs to the whole element and
    its handles would move or resize the list; with one item lit up that reads as
    the item being what you are holding. The list is still selected underneath,
    and Escape steps back out to it. The element is still *measured* though — the
    bin and the plus hang off its frame whether or not the box is drawn.
  */
  const itemPicked = adjusting?.selectedItem != null
  const adjust = selected === null ? undefined : data?.adjusts?.[String(selected)]

  const [measured, setMeasured] = useState<Measured | null>(null)
  // Bumped to re-measure when nothing in props changed but the layout did — a
  // window resize, or the card reflowing around an edit.
  const [revision, bump] = useState(0)

  useLayoutEffect(() => {
    const cardNode = cardRef.current
    if (!cardNode || selected === null) {
      setMeasured(null)
      return
    }
    setMeasured(measureBlock(cardNode, selected))
  }, [cardRef, selected, adjust, revision])

  // The card is responsive and reflows as its text is edited, so the box has to
  // be re-measured rather than pinned where it was first drawn.
  useEffect(() => {
    const cardNode = cardRef.current
    if (!cardNode || selected === null) return
    const observer = new ResizeObserver(() => bump((n) => n + 1))
    observer.observe(cardNode)
    return () => observer.disconnect()
  }, [cardRef, selected])

  // Read inside the gesture callbacks, which outlive the render that made them.
  const live = useRef({ measured, adjust, selected, adjusting })
  live.current = { measured, adjust, selected, adjusting }

  // The last value a gesture produced, re-sent on release so the store can
  // persist it immediately. Cleared after, so releasing without having moved
  // writes nothing.
  const pending = useRef<BlockAdjust | null>(null)

  const onChange = useCallback((next: Frame, kind: GestureKind) => {
    const state = live.current
    if (!state.measured || state.selected === null || !state.adjusting) return
    const { natural, card, node, cardNode } = state.measured

    // Moves are held to the card so an element can hang off an edge but never
    // be dragged somewhere `overflow-hidden` makes it unreachable. A resize is
    // not clamped: that would move the anchor the user is holding fixed.
    const placed = kind === 'move' ? clampFrame(next, card) : next

    /*
      A resize has to ask the layout where it would put the element *at the new
      size* before the displacement can be worked out. Most of the twelve
      layouts align their children, so widening a heading inside `items-center`
      re-centres it — and measured against the old position, that re-centring
      would be mistaken for the user having dragged it, leaving the anchored
      edge sliding by half the size change on every resize.
    */
    const base =
      kind === 'resize' ? measureAt(node, cardNode, { w: placed.w, h: placed.h }) : natural

    const nextAdjust = toAdjust(placed, base, card, state.adjust ?? NO_ADJUST, kind === 'resize')
    pending.current = nextAdjust
    state.adjusting.change(state.selected, nextAdjust)
  }, [])

  /*
    Pointer released. The same value goes again with `commit`, which costs one
    redundant store write and buys the row being written now rather than 500ms
    from now — the window in which a reload, or a jump to the presenter, used to
    lose the drag entirely. It cannot add an undo step: `setBlockAdjust`
    coalesces on the same key well inside the window this lands in.
  */
  const onCommit = useCallback(() => {
    const state = live.current
    const last = pending.current
    pending.current = null
    if (!last || state.selected === null || !state.adjusting) return
    state.adjusting.change(state.selected, last, true)
  }, [])

  if (!measured || selected === null) return null

  const frame = currentFrame(measured.natural, adjust, measured.card)
  return (
    <>
      {!itemPicked && <SelectionOverlay frame={frame} onChange={onChange} onCommit={onCommit} />}
      <ElementActions
        frame={frame}
        removeLabel={itemPicked ? 'Remove item' : 'Remove element'}
        onRemove={adjusting?.remove}
        onAddItem={
          adjusting?.canAddItem?.(selected) && adjusting.addItem
            ? () => adjusting.addItem?.(selected)
            : undefined
        }
      />
    </>
  )
}
