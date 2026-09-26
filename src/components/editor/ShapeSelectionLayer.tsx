import { useRef, type RefObject } from 'react'
import type { Frame } from '@/engine/frame'
import { clampFrame } from '@/engine/frameGeometry'
import { gridCell, snapMove, snapResize } from '@/engine/gridSnap'
import type { Handle } from '@/engine/frame'
import type { Shape } from '@/engine/overlay'
import { shapeFrame, shapeWithFrame } from '@/engine/shapes'
import { ElementActions } from './ElementActions'
import { SelectionOverlay, type GestureKind } from './SelectionOverlay'
import { useEditorGrid } from './gridContext'

/**
 * The selection box on one shape: drag an edge to move it, a handle to resize it,
 * the bin to delete it. The same `SelectionOverlay` and `ElementActions` an
 * element gets, minus the rotate handle (shapes do not rotate here).
 *
 * The frame is worked out from the shape as it is *now*, gesture maths are done in
 * pixels of the card, and the result goes back through `shapeWithFrame` into
 * fractions of the content width. A gesture's intermediate shapes are reported
 * through `onLive` so the shape tracks the pointer, and the last one is committed
 * **once, on release** — one undo step and one write, like a stroke.
 *
 * With the grid's Snap on (the default) a move snaps the shape's top-left to a
 * line and a resize snaps the edges being dragged, the same arithmetic as an
 * element's nudge.
 */
export function ShapeSelectionLayer({
  shape,
  width,
  boxRef,
  onLive,
  onCommit,
  onRemove,
}: {
  /** The shape as it is right now, including any unfinished gesture. */
  shape: Shape
  width: number
  /** The content box, for its height (a move keeps the shape's centre on the card). */
  boxRef: RefObject<HTMLElement | null>
  /** The shape mid-gesture, or `null` when it ends. */
  onLive: (shape: Shape | null) => void
  /** The gesture ended: `shape` is what it settled on. */
  onCommit: (shape: Shape) => void
  onRemove: () => void
}) {
  const grid = useEditorGrid()
  const frame = shapeFrame(shape, width)
  // The last shape a gesture produced. Read on release, by a callback that was
  // created at the press, so it cannot come from props or state.
  const last = useRef<Shape | null>(null)

  function onChange(next: Frame, kind: GestureKind, handle?: Handle) {
    if (kind === 'rotate') return
    const height = boxRef.current?.clientHeight ?? Number.POSITIVE_INFINITY
    let placed = kind === 'move' ? clampFrame(next, { w: width, h: height }) : next
    if (grid.snap) {
      const cell = gridCell(width)
      if (kind === 'move') placed = snapMove(placed, cell)
      else if (handle) placed = snapResize(placed, handle, cell)
    }
    const moved = shapeWithFrame(shape, placed, width)
    last.current = moved
    onLive(moved)
  }

  function onEnd() {
    const settled = last.current
    last.current = null
    onLive(null)
    if (settled) onCommit(settled)
  }

  return (
    <>
      <SelectionOverlay frame={frame} rotatable={false} onChange={onChange} onCommit={onEnd} />
      <ElementActions frame={frame} removeLabel="Remove shape" onRemove={onRemove} />
    </>
  )
}
