import { useContext, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import {
  MIN_SHAPE_SIZE,
  brushWidth,
  canAppendItem,
  contentFraction,
  decimate,
  inkHit,
  normalizeShapeRect,
  type OverlayItem,
  type Stroke,
} from '@/engine/overlay'
import { GRID_DIVISIONS, snapToGrid } from '@/engine/gridSnap'
import { eraserRadius } from '@/engine/penSettings'
import { newShape } from '@/engine/shapes'
import { DrawingContext } from './drawingContext'
import { useEditorGrid } from './gridContext'
import { OverlayLayer } from './OverlayLayer'

/** How far the surface reaches past the content box, so ink can start over the card's padding. */
const BLEED_PX = 256

interface Gesture {
  /** The content box's on-screen rect, captured at the press and never re-read. */
  rect: DOMRect
  points: [number, number][]
  hit: Set<string>
}

/**
 * The transparent layer that turns a drag into ink — a stroke with the pen, an
 * erase with the eraser, a shape with the shape tool — while one of those tools
 * is active.
 *
 * Coordinates come from the content box's own on-screen rect, not from a zoom
 * value: the canvas zoom is a CSS transform, so it scales that rect and the
 * pointer's distance from its corner together, and `contentFraction` is a
 * fraction of the content width at any zoom. Like every other gesture here it is
 * computed from the frame captured at the press.
 *
 * What is being drawn is held in local state and committed **once, on release**,
 * so a stroke, one sweep of the eraser or one shape is exactly one undo step and
 * one write. The press and click are stopped here: drawing must never select the
 * card or an element, or start a text edit.
 */
export function DrawingSurface({
  boxRef,
  width,
  onFading,
}: {
  /** The content box (`SlideBody`'s root): the origin coordinates are measured against. */
  boxRef: RefObject<HTMLElement | null>
  width: number
  /** Tells the layers which items the eraser is over, so they draw faded. */
  onFading: (ids: ReadonlySet<string>) => void
}) {
  const drawing = useContext(DrawingContext)
  const grid = useEditorGrid()
  const [live, setLive] = useState<OverlayItem | null>(null)
  const gesture = useRef<Gesture | null>(null)
  const pen = drawing?.settings
  const shapeTool = drawing?.shapeTool
  if (!drawing || (!pen && !shapeTool)) return null

  const erasing = pen?.tool === 'eraser'
  const keep = pen ? pen.keep : (shapeTool?.keep ?? 'slide')
  const target = keep === 'slide' ? drawing.storedOverlay : drawing.temporaryOverlay
  // A full card refuses new ink; the popover says why. Erasing is always allowed.
  const refused = !erasing && !canAppendItem(target)

  const pointOf = (event: ReactPointerEvent, g: Gesture) =>
    contentFraction({ x: event.clientX, y: event.clientY }, g.rect)

  const inkTool = pen?.tool === 'marker' ? 'marker' : 'pen'
  const strokeOf = (id: string, points: [number, number][]): Stroke => ({
    id,
    kind: 'stroke',
    tool: inkTool,
    color: pen?.color ?? 'accent',
    width: brushWidth(inkTool, pen?.size ?? 'small'),
    points,
  })

  /** The box a shape drag describes, snapped to the grid's lines when snap is on. */
  function shapeRect(from: [number, number], to: [number, number]) {
    const rect = normalizeShapeRect(from, to)
    if (!grid.snap) return rect
    const cell = Math.max(4, width / GRID_DIVISIONS) / width
    const left = snapToGrid(rect.x, cell)
    const top = snapToGrid(rect.y, cell)
    return {
      x: left,
      y: top,
      w: Math.max(MIN_SHAPE_SIZE, snapToGrid(rect.x + rect.w, cell) - left),
      h: Math.max(MIN_SHAPE_SIZE, snapToGrid(rect.y + rect.h, cell) - top),
    }
  }

  const shapeOf = (id: string, g: Gesture, last: [number, number]) =>
    newShape(
      id,
      shapeTool?.settings ?? { shape: 'rectangle', fill: false },
      shapeTool?.color ?? 'accent',
      shapeRect(g.points[0], last),
    )

  function extend(event: ReactPointerEvent, g: Gesture) {
    const point = pointOf(event, g)
    if (erasing) {
      const before = g.hit.size
      for (const id of inkHit(target, point, eraserRadius(pen?.size ?? 'small'))) g.hit.add(id)
      if (g.hit.size !== before) onFading(new Set(g.hit))
    } else if (shapeTool) {
      setLive(shapeOf('live', g, point))
    } else {
      g.points.push(point)
      setLive(strokeOf('live', [...g.points]))
    }
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    // Ctrl is the pan gesture; its capture-phase listener normally stops it before it gets here.
    if (event.button !== 0 || event.ctrlKey) return
    const box = boxRef.current
    if (!box) return
    const rect = box.getBoundingClientRect()
    if (rect.width <= 0) return
    event.preventDefault()
    event.stopPropagation()
    if (refused) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const g: Gesture = { rect, points: [], hit: new Set() }
    gesture.current = g
    // A shape's first point is its anchor corner; the pen's is the start of the path.
    if (shapeTool) g.points.push(pointOf(event, g))
    extend(event, g)
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const g = gesture.current
    if (g && event.currentTarget.hasPointerCapture(event.pointerId)) extend(event, g)
  }

  function finish(event: ReactPointerEvent<HTMLDivElement>) {
    const g = gesture.current
    gesture.current = null
    if (!g || !drawing) return
    setLive(null)
    onFading(new Set())
    if (erasing) {
      if (g.hit.size > 0) drawing.eraseItems([...g.hit], keep)
      return
    }
    const last = pointOf(event, g)
    if (shapeTool) {
      // A click with no drag drops a default-sized shape; `normalizeShapeRect` decides.
      drawing.commitShape(shapeOf(crypto.randomUUID(), g, last), keep)
      return
    }
    // The release position is the last point, so a stroke ends where the pen came up.
    g.points.push(last)
    drawing.commitStroke(strokeOf(crypto.randomUUID(), decimate(g.points)), keep)
  }

  function cancel() {
    gesture.current = null
    setLive(null)
    onFading(new Set())
  }

  return (
    <>
      {/* What is being drawn, before it is committed. */}
      <OverlayLayer items={live ? [live] : undefined} width={width} />
      <div
        aria-hidden="true"
        data-drawing-surface
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finish}
        onPointerCancel={cancel}
        // The card's own handlers select it on press and click; drawing must not.
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        className="absolute z-30"
        style={{
          inset: -BLEED_PX,
          touchAction: 'none',
          cursor: refused ? 'not-allowed' : 'crosshair',
        }}
      />
    </>
  )
}
