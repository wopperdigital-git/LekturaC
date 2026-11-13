import type { CardDrawing } from '@/components/editor/drawingContext'
import type { PenSettings } from '@/engine/penSettings'
import type { Stroke } from '@/engine/overlay'
import type { LaserPoint } from '@/present/liveInk'

const noop = () => {}

/**
 * The `CardDrawing` the presenter view gives one slide: live ink in the
 * temporary layer, no shapes, nothing selectable. With `settings` null (the
 * projector, or the console's pointer and laser) it only draws.
 */
export function presentDrawing({
  strokes,
  settings = null,
  laser,
  onCommit = noop,
  onErase = noop,
  onLiveStroke,
}: {
  strokes: readonly Stroke[] | undefined
  settings?: PenSettings | null
  laser?: readonly LaserPoint[]
  onCommit?: (stroke: Stroke) => void
  onErase?: (ids: string[]) => void
  onLiveStroke?: (stroke: Stroke | null) => void
}): CardDrawing {
  return {
    settings,
    shapeTool: null,
    storedOverlay: undefined,
    temporaryOverlay: strokes && strokes.length > 0 ? [...strokes] : undefined,
    commitStroke: (stroke) => onCommit(stroke),
    eraseItems: (ids) => onErase(ids),
    selectable: false,
    selectedShape: null,
    selectShape: noop,
    commitShape: noop,
    changeShape: noop,
    removeShape: noop,
    onLiveStroke,
    laser: laser && laser.length > 0 ? laser : undefined,
  }
}
