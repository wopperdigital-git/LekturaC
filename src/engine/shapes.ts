import type { Frame } from './frame'
import { SHAPE_OUTLINE_WIDTH, type Shape, type ShapeKind } from './overlay'

/*
  What the shapes popover chooses, and the conversions between a stored shape
  (fractions of the card's content width) and the pixel `Frame` the selection box
  and the drag maths work in.

  A view setting like the pen's: not stored, not undoable. The shapes it produces
  are what get stored. Colour and where the ink is kept are shared with the pen
  (`PenSettings`), so they are not repeated here.
*/

export interface ShapeSettings {
  shape: ShapeKind
  /** Outline only, or the colour tinted inside the outline. */
  fill: boolean
}

export const DEFAULT_SHAPE_SETTINGS: ShapeSettings = { shape: 'rectangle', fill: false }

export const SHAPE_LABELS: Record<ShapeKind, string> = {
  rectangle: 'Rectangle',
  rounded: 'Rounded rectangle',
  ellipse: 'Ellipse',
  triangle: 'Triangle',
  diamond: 'Diamond',
  arrow: 'Arrow',
}

/** A new shape in the given box (fractions of the content width). */
export function newShape(
  id: string,
  settings: ShapeSettings,
  color: string,
  rect: { x: number; y: number; w: number; h: number },
): Shape {
  return {
    id,
    kind: 'shape',
    shape: settings.shape,
    color,
    width: SHAPE_OUTLINE_WIDTH,
    fill: settings.fill,
    ...rect,
  }
}

/** The shape as a pixel frame, for a content box `width` wide. Shapes do not rotate. */
export function shapeFrame(shape: Shape, width: number): Frame {
  return { x: shape.x * width, y: shape.y * width, w: shape.w * width, h: shape.h * width, rotation: 0 }
}

/** Stored values are rounded to five decimals: a drag emits a frame per pointer event and floats pile up noise. */
const round5 = (n: number) => Math.round(n * 1e5) / 1e5

/**
 * The shape moved or resized to a pixel frame. Everything but the rectangle is
 * kept, and the frame's rotation is ignored (there is none to keep).
 */
export function shapeWithFrame(shape: Shape, frame: Frame, width: number): Shape {
  return {
    ...shape,
    x: round5(frame.x / width),
    y: round5(frame.y / width),
    w: round5(frame.w / width),
    h: round5(frame.h / width),
  }
}
