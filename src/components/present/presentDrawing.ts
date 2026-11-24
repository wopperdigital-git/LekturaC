import type { CardDrawing } from '@/components/editor/drawingContext'
import type { PenSettings } from '@/engine/penSettings'
import type { Stroke } from '@/engine/overlay'
import { isLiveStroke, type LaserPoint, type LiveItem } from '@/present/liveInk'

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
  bleed,
}: {
  /** The slide's live items; only the strokes are ink (the whiteboard draws its text itself). */
  strokes: readonly LiveItem[] | undefined
  settings?: PenSettings | null
  laser?: readonly LaserPoint[]
  onCommit?: (stroke: Stroke) => void
  onErase?: (ids: string[]) => void
  onLiveStroke?: (stroke: Stroke | null) => void
  /** How far past the content box the pen reaches (the whiteboard's is everywhere). */
  bleed?: number
}): CardDrawing {
  const ink = strokes?.filter(isLiveStroke) ?? []
  return {
    settings,
    shapeTool: null,
    storedOverlay: undefined,
    temporaryOverlay: ink.length > 0 ? ink : undefined,
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
    bleed,
  }
}
