import { COLOR_CHOICES } from './textStyle'
import type { BrushSize } from './overlay'

/*
  What the pen popover chooses: a view setting like zoom and the grid — not
  stored, not undoable. The strokes it produces are what get stored.
*/

export type PenKind = 'pen' | 'marker' | 'eraser'

/** Whether a stroke is part of the slide (stored) or a temporary annotation (this browser only). */
export type InkKeep = 'slide' | 'temporary'

export interface PenSettings {
  tool: PenKind
  size: BrushSize
  /** 'accent' | 'foreground' (theme colours) or '#rrggbb'. */
  color: string
  keep: InkKeep
}

export const DEFAULT_PEN_SETTINGS: PenSettings = { tool: 'pen', size: 'small', color: 'accent', keep: 'slide' }

/** The colour row: the deck's own accent and text colour first, then the shared presets. */
export const INK_COLORS: readonly { label: string; value: string }[] = [
  { label: 'Accent', value: 'accent' },
  { label: 'Text', value: 'foreground' },
  ...COLOR_CHOICES.map(({ label, value }) => ({ label, value })),
]

export function isFixedInkColor(color: string): boolean {
  return color.startsWith('#')
}

/** How close the eraser must get to a stroke, as a fraction of the content width, by brush size. */
export const ERASER_RADIUS: Record<BrushSize, number> = { dot: 0.008, small: 0.018, big: 0.04 }

export function eraserRadius(size: BrushSize): number {
  return ERASER_RADIUS[size]
}
