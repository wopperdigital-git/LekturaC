import { MAX_STROKES_PER_CARD, parseOverlay, type Stroke } from '@/engine/overlay'
import type { PenSettings } from '@/engine/penSettings'

/*
  Live ink in the presenter view: what the teacher draws over a slide while
  presenting. Kept per slide for the length of the talk (and across a reload of
  the console), never written to the deck, gone when the presentation ends.

  Strokes are the editor's own `Stroke`s, in the same unit (fractions of the
  content width), so they are drawn by the same `OverlayLayer` and captured by
  the same `DrawingSurface`.
*/

export type LiveTool = 'pointer' | 'pen' | 'highlighter' | 'laser' | 'eraser'

export interface LivePen {
  tool: LiveTool
  penColor: string
  highlighterColor: string
}

export const DEFAULT_LIVE_PEN: LivePen = { tool: 'pointer', penColor: '#ef4444', highlighterColor: '#facc15' }

/** A short row that reads on any theme and from the back of a room. */
export const LIVE_COLORS: readonly { label: string; value: string }[] = [
  { label: 'Red', value: '#ef4444' },
  { label: 'Yellow', value: '#facc15' },
  { label: 'Green', value: '#22c55e' },
  { label: 'Blue', value: '#3b82f6' },
  { label: 'Text colour', value: 'foreground' },
]

/** Live ink by card id. A slide with no ink has no entry. */
export type LiveInk = Readonly<Record<string, readonly Stroke[]>>

/** What `DrawingSurface` captures with, or `null` when a press should draw nothing. */
export function livePenSettings(pen: LivePen): PenSettings | null {
  switch (pen.tool) {
    case 'pen':
      return { tool: 'pen', size: 'small', color: pen.penColor, keep: 'temporary' }
    case 'highlighter':
      return { tool: 'marker', size: 'big', color: pen.highlighterColor, keep: 'temporary' }
    case 'eraser':
      return { tool: 'eraser', size: 'small', color: pen.penColor, keep: 'temporary' }
    default:
      return null
  }
}

export function slideHasInk(ink: LiveInk, cardId: string): boolean {
  return (ink[cardId]?.length ?? 0) > 0
}

/** The ink with `stroke` on `cardId`; the same object when the slide is full. */
export function addLiveStroke(ink: LiveInk, cardId: string, stroke: Stroke): LiveInk {
  const current = ink[cardId] ?? []
  if (current.length >= MAX_STROKES_PER_CARD) return ink
  return { ...ink, [cardId]: [...current, stroke] }
}

/** The ink without the named strokes on `cardId`; the same object when none matched. */
export function eraseLiveStrokes(ink: LiveInk, cardId: string, ids: readonly string[]): LiveInk {
  const current = ink[cardId]
  if (!current) return ink
  const gone = new Set(ids)
  const kept = current.filter((s) => !gone.has(s.id))
  if (kept.length === current.length) return ink
  return withSlide(ink, cardId, kept)
}

export function clearLiveSlide(ink: LiveInk, cardId: string): LiveInk {
  return ink[cardId] ? withSlide(ink, cardId, []) : ink
}

function withSlide(ink: LiveInk, cardId: string, strokes: readonly Stroke[]): LiveInk {
  const next: Record<string, readonly Stroke[]> = { ...ink }
  if (strokes.length > 0) next[cardId] = strokes
  else delete next[cardId]
  return next
}

/** Ink from another window or from storage: untrusted, so every stroke is re-checked. */
export function parseLiveInk(raw: unknown): LiveInk {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {}
  const ink: Record<string, Stroke[]> = {}
  for (const [cardId, items] of Object.entries(raw)) {
    const strokes = (parseOverlay(items) ?? []).filter((item): item is Stroke => item.kind === 'stroke')
    if (strokes.length > 0) ink[cardId] = strokes.slice(0, MAX_STROKES_PER_CARD)
  }
  return ink
}

/** The laser pointer: a dot with a short fading trail. Draws nothing that stays. */
export interface LaserPoint {
  x: number
  y: number
  at: number
}

export const LASER_TRAIL_MS = 400
export const LASER_MAX_POINTS = 24

/** The trail after the pointer moved to `point`, or left the slide (`null`). */
export function pushLaser(trail: readonly LaserPoint[], point: [number, number] | null, now: number): LaserPoint[] {
  if (!point) return []
  return [...trail, { x: point[0], y: point[1], at: now }].slice(-LASER_MAX_POINTS)
}

/** The trail without points older than the fade; the newest point (the dot) always stays. */
export function pruneLaser(trail: readonly LaserPoint[], now: number): LaserPoint[] {
  if (trail.length === 0) return []
  const last = trail[trail.length - 1]
  return [...trail.slice(0, -1).filter((p) => now - p.at < LASER_TRAIL_MS), last]
}
