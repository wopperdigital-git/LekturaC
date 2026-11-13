import { createContext } from 'react'
import type { OverlayItem, Shape, Stroke } from '@/engine/overlay'
import type { InkKeep, PenSettings } from '@/engine/penSettings'
import type { ShapeSettings } from '@/engine/shapes'
import type { TempInk } from '@/lib/temporaryInk'
import type { LaserPoint } from '@/present/liveInk'

/** The shape tool's settings with the colour and destination it shares with the pen already resolved. */
export interface ShapeTool {
  settings: ShapeSettings
  color: string
  keep: InkKeep
}

/**
 * What one card needs to be drawn on, provided per card by `CardCanvas` the way
 * `BlockAdjustContext` is, with the card's id already applied to the callbacks.
 *
 * The editor provides it, and so does the presenter view for its live ink (pen,
 * highlighter, laser; `components/present/presentDrawing.ts`). Nothing else does,
 * so the editor's temporary ink never shows up in the single-window presenter,
 * the narration viewer or a thumbnail.
 */
export interface CardDrawing {
  /** The pen's settings while the pen tool is active; `null` otherwise (ink still draws, nothing captures presses). */
  settings: PenSettings | null
  /** The shape tool's settings while it is active; `null` otherwise. */
  shapeTool: ShapeTool | null
  /** This card's stored ink, for hit-testing the eraser and the per-card limit. */
  storedOverlay: OverlayItem[] | undefined
  /** This card's temporary ink: drawn by the editor only, kept in this browser. */
  temporaryOverlay: OverlayItem[] | undefined
  /** A finished stroke, committed once on release. */
  commitStroke: (stroke: Stroke, keep: InkKeep) => void
  /** Items the eraser swept over, removed once on release. */
  eraseItems: (ids: string[], keep: InkKeep) => void

  /** Whether pressing a shape selects it (the Select elements tool is active). */
  selectable: boolean
  /** The selected shape, when it is on this card. */
  selectedShape: { id: string; keep: InkKeep } | null
  /** A press on a shape. */
  selectShape: (id: string, keep: InkKeep) => void
  /** A new shape drawn with the shape tool, committed once on release. */
  commitShape: (shape: Shape, keep: InkKeep) => void
  /** The selected shape moved or resized, committed once on release. */
  changeShape: (shape: Shape, keep: InkKeep) => void
  removeShape: (id: string, keep: InkKeep) => void

  /** Presenter view: the stroke being drawn, on every move, then `null` once it is committed or abandoned. */
  onLiveStroke?: (stroke: Stroke | null) => void
  /** Presenter view: the laser pointer's dot and trail on this slide. */
  laser?: readonly LaserPoint[]
}

export const DrawingContext = createContext<CardDrawing | null>(null)

/**
 * The whole canvas's drawing state, as `EditorPage` holds it. `CardCanvas` turns
 * it into a `CardDrawing` per card.
 */
export interface CanvasDrawing {
  settings: PenSettings | null
  shapeTool: ShapeTool | null
  /** Temporary ink by card id. */
  temporary: TempInk
  selectable: boolean
  selectedShape: { cardId: string; id: string; keep: InkKeep } | null
  onCommitStroke: (cardId: string, stroke: Stroke, keep: InkKeep) => void
  onEraseItems: (cardId: string, ids: string[], keep: InkKeep) => void
  onSelectShape: (cardId: string, id: string, keep: InkKeep) => void
  onCommitShape: (cardId: string, shape: Shape, keep: InkKeep) => void
  onChangeShape: (cardId: string, shape: Shape, keep: InkKeep) => void
  onRemoveShape: (cardId: string, id: string, keep: InkKeep) => void
}

const noop = () => {}

/** Nothing drawn on, nothing to draw with: the default for a canvas that is not given drawing state. */
export const NO_DRAWING: CanvasDrawing = {
  settings: null,
  shapeTool: null,
  temporary: {},
  selectable: false,
  selectedShape: null,
  onCommitStroke: noop,
  onEraseItems: noop,
  onSelectShape: noop,
  onCommitShape: noop,
  onChangeShape: noop,
  onRemoveShape: noop,
}
