import { useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { HANDLES, type Frame, type Handle } from '@/engine/frame'
import { HANDLE_CURSOR, HANDLE_POSITION, resizeFrame } from '@/engine/frameGeometry'
import { startPointerDrag } from './pointerDrag'
import { useCanvasZoom } from './zoomContext'

/*
  The selection box for one element.

  It is an *overlay*, not a wrapper: it draws over the element's rectangle as a
  sibling, and the element's own markup is untouched. A border on the element
  itself would be less code and would also change what the user is editing —
  two pixels on every side, reflowing its text the moment it is selected.

  The interior is `pointer-events: none`, so the element's text stays clickable
  and a caret can still be placed in it. The *border* is not: dragging an edge
  moves the element. That split is what lets one gesture vocabulary cover both
  editing text and moving the box, with no modifier key and no mode.

  Every gesture is computed from the frame captured at the press, never from the
  live one. The live frame changes underneath as each move is committed, so
  accumulating against it would double every delta and send the element off at
  twice the speed of the pointer.
*/

/**
 * Handle and border sizes. They are drawn inside the card, so they scale with the
 * canvas zoom like everything else on it.
 */
const HANDLE_PX = 9
const BORDER_PX = 1.5
/** How wide the draggable edge is — wider than the visible line, so it can be hit. */
const EDGE_GRAB_PX = 7
const ROTATE_ARM_PX = 22

/** Rotation snaps to this many degrees while shift is held. */
const ROTATE_SNAP_DEG = 15

export type GestureKind = 'move' | 'resize' | 'rotate'

export function SelectionOverlay({
  frame,
  onChange,
  onCommit,
}: {
  frame: Frame
  /*
    Called on every pointer move, not once at the end. The store coalesces the
    burst into a single history entry (see `setBlockAdjust`), so a live-updating
    drag still undoes as one action — and the element tracks the cursor instead
    of jumping when the button is released.
  */
  onChange: (next: Frame, kind: GestureKind) => void
  /*
    Fired once when the pointer is released, so the value the gesture settled on
    can be persisted immediately instead of waiting out a debounce that exists
    only to absorb the moves.
  */
  onCommit: () => void
}) {
  const root = useRef<HTMLDivElement>(null)
  // The canvas may be zoomed. The pointer moves in screen pixels; the frame is in
  // the card's own, so a drag is divided by the zoom before it becomes a delta.
  const zoom = useCanvasZoom()

  function begin(
    event: ReactPointerEvent,
    run: (dx: number, dy: number, live: PointerEvent) => void,
  ) {
    // Stops the press reaching the element underneath, which would re-select it
    // and start a second gesture at the same time.
    event.preventDefault()
    event.stopPropagation()
    startPointerDrag(event, (dx, dy, live) => run(dx / zoom, dy / zoom, live), onCommit)
  }

  function beginMove(event: ReactPointerEvent) {
    const start = frame
    begin(event, (dx, dy) => onChange({ ...start, x: start.x + dx, y: start.y + dy }, 'move'))
  }

  function beginResize(event: ReactPointerEvent, which: Handle) {
    const start = frame
    begin(event, (dx, dy) => onChange(resizeFrame(start, which, dx, dy), 'resize'))
  }

  function beginRotate(event: ReactPointerEvent) {
    const box = root.current?.getBoundingClientRect()
    if (!box) return
    const start = frame

    /*
      An absolute angle about the element's centre, rather than one accumulated
      from the drag delta. The centre does not move during a rotation, so
      absolute angles cannot drift however far the pointer travels, and the
      handle stays exactly under the cursor.

      The centre comes off the overlay's own bounding rect, taken once at the
      press: that rect is the rotated box's axis-aligned bounds, whose centre is
      the box's own centre.
    */
    const cx = box.left + box.width / 2
    const cy = box.top + box.height / 2
    const angleAt = (x: number, y: number) => (Math.atan2(y - cy, x - cx) * 180) / Math.PI

    const fromX = event.clientX
    const fromY = event.clientY
    const startAngle = angleAt(fromX, fromY)

    begin(event, (dx, dy, live) => {
      // `dx`/`dy` are in card pixels; the angle is measured on screen, where the
      // centre and the pointer both are, so the zoom goes back on.
      const swept = angleAt(fromX + dx * zoom, fromY + dy * zoom) - startAngle
      onChange({ ...start, rotation: snap(start.rotation + swept, live.shiftKey) }, 'rotate')
    })
  }

  /** One of the four draggable edges, as a strip straddling the outline. */
  function edgeStyle(edge: 'top' | 'bottom' | 'left' | 'right'): CSSProperties {
    const horizontal = edge === 'top' || edge === 'bottom'
    const offset = -EDGE_GRAB_PX / 2
    return {
      cursor: 'move',
      width: horizontal ? '100%' : EDGE_GRAB_PX,
      height: horizontal ? EDGE_GRAB_PX : '100%',
      left: edge === 'right' ? frame.w + offset : offset,
      top: edge === 'bottom' ? frame.h + offset : offset,
    }
  }

  return (
    <div
      ref={root}
      // Above the card's content, so a handle is never buried under an element
      // that happens to overlap this one.
      className="pointer-events-none absolute z-20"
      style={{
        left: frame.x,
        top: frame.y,
        width: frame.w,
        height: frame.h,
        transform: frame.rotation ? `rotate(${frame.rotation}deg)` : undefined,
        transformOrigin: 'center',
      }}
    >
      {/* `outline` rather than `border`, so the box adds nothing to the size it
          describes and the handles stay centred on the true edge. */}
      <div
        className="absolute inset-0 outline-app-accent"
        style={{ outlineStyle: 'solid', outlineWidth: BORDER_PX }}
      />

      {/* Four strips rather than one full-size box, so the middle of the element
          stays click-through for its own text. */}
      {(['top', 'bottom', 'left', 'right'] as const).map((edge) => (
        <div
          key={edge}
          aria-hidden="true"
          onPointerDown={beginMove}
          className="pointer-events-auto absolute"
          style={edgeStyle(edge)}
        />
      ))}

      {/* The stem joining the rotate handle to the box — decoration only. */}
      <div
        aria-hidden="true"
        className="absolute bg-app-accent"
        style={{
          width: BORDER_PX,
          height: ROTATE_ARM_PX,
          left: frame.w / 2 - BORDER_PX / 2,
          top: -ROTATE_ARM_PX,
        }}
      />
      <div
        role="button"
        aria-label="Rotate element"
        onPointerDown={beginRotate}
        className="pointer-events-auto absolute rounded-full border-app-accent bg-app-background"
        style={{
          width: HANDLE_PX,
          height: HANDLE_PX,
          left: frame.w / 2 - HANDLE_PX / 2,
          top: -ROTATE_ARM_PX - HANDLE_PX / 2,
          borderStyle: 'solid',
          borderWidth: BORDER_PX,
          cursor: 'grab',
        }}
      />

      {HANDLES.map((which) => {
        const at = HANDLE_POSITION[which]
        return (
          <div
            key={which}
            role="button"
            aria-label={`Resize ${which}`}
            onPointerDown={(event) => beginResize(event, which)}
            className="pointer-events-auto absolute rounded-[2px] border-app-accent bg-app-background"
            style={{
              width: HANDLE_PX,
              height: HANDLE_PX,
              left: at.x * frame.w - HANDLE_PX / 2,
              top: at.y * frame.h - HANDLE_PX / 2,
              borderStyle: 'solid',
              borderWidth: BORDER_PX,
              // The unrotated cursor for the handle's compass point. Deliberately
              // not corrected for the element's rotation: that would need the
              // cursor remapped per 45° arc, and every editor worth copying
              // leaves it alone.
              cursor: HANDLE_CURSOR[which],
            }}
          />
        )
      })}
    </div>
  )
}

/** Keeps rotation in (-180, 180], snapping to a fixed step while shift is held. */
function snap(degrees: number, shift: boolean): number {
  const stepped = shift ? Math.round(degrees / ROTATE_SNAP_DEG) * ROTATE_SNAP_DEG : degrees
  return ((((stepped + 180) % 360) + 360) % 360) - 180
}
