import { z } from 'zod'
import { MAX_STROKES_PER_CARD, parseOverlay, type BrushSize, type Stroke } from '@/engine/overlay'
import type { PenSettings } from '@/engine/penSettings'

/*
  Live ink in the presenter view: what the teacher draws over a slide while
  presenting. Kept per slide for the length of the talk (and across a reload of
  the console), never written to the deck, gone when the presentation ends.

  Strokes are the editor's own `Stroke`s, in the same unit (fractions of the
  content width), so they are drawn by the same `OverlayLayer` and captured by
  the same `DrawingSurface`.

  The whiteboard is one more "slide" in the same store, under `WHITEBOARD_ID`,
  so its ink gets the same undo, eraser, reload and mirroring for free. Only the
  whiteboard takes typed text (`LiveText`).
*/

export type LiveTool = 'pointer' | 'pen' | 'highlighter' | 'laser' | 'eraser' | 'text'

/** The whiteboard's key in `LiveInk`. Never a card id (those are UUIDs). */
export const WHITEBOARD_ID = 'whiteboard'

/** Typed text on the whiteboard. `x`, `y` (its top-left) and `size` are fractions of the content width, like ink. */
export interface LiveText {
  id: string
  kind: 'text'
  x: number
  y: number
  text: string
  color: string
  size: number
}

export const MAX_TEXT_LENGTH = 500

export type LiveItem = Stroke | LiveText

export function isLiveStroke(item: LiveItem): item is Stroke {
  return item.kind === 'stroke'
}

export function isLiveText(item: LiveItem): item is LiveText {
  return item.kind === 'text'
}

export type LiveTextSize = 'small' | 'medium' | 'large'

/** The whiteboard's text sizes, as fractions of the page width: about 24, 34 and 54px on the 976px page. */
export const LIVE_TEXT_SIZES: Record<LiveTextSize, number> = { small: 0.025, medium: 0.035, large: 0.055 }

export interface LivePen {
  tool: LiveTool
  /** The pen's colour, which typed text shares. */
  penColor: string
  highlighterColor: string
  penSize: BrushSize
  highlighterSize: BrushSize
  eraserSize: BrushSize
  textSize: LiveTextSize
}

export const DEFAULT_LIVE_PEN: LivePen = {
  tool: 'pointer',
  penColor: '#ef4444',
  highlighterColor: '#facc15',
  penSize: 'small',
  highlighterSize: 'big',
  eraserSize: 'small',
  textSize: 'medium',
}

/** Which tools open a settings menu when pressed again, and what it holds. */
export function liveToolMenu(tool: LiveTool): { size: boolean; color: boolean } | null {
  switch (tool) {
    case 'pen':
    case 'highlighter':
    case 'text':
      return { size: true, color: true }
    case 'eraser':
      return { size: true, color: false }
    default:
      return null
  }
}

/** A short row that reads on any theme and from the back of a room. */
export const LIVE_COLORS: readonly { label: string; value: string }[] = [
  { label: 'Red', value: '#ef4444' },
  { label: 'Yellow', value: '#facc15' },
  { label: 'Green', value: '#22c55e' },
  { label: 'Blue', value: '#3b82f6' },
  { label: 'Text colour', value: 'foreground' },
]

/** Live ink by card id (and `WHITEBOARD_ID`). A slide with no ink has no entry. */
export type LiveInk = Readonly<Record<string, readonly LiveItem[]>>

/** What `DrawingSurface` captures with, or `null` when a press should draw nothing. */
export function livePenSettings(pen: LivePen): PenSettings | null {
  switch (pen.tool) {
    case 'pen':
      return { tool: 'pen', size: pen.penSize, color: pen.penColor, keep: 'temporary' }
    case 'highlighter':
      return { tool: 'marker', size: pen.highlighterSize, color: pen.highlighterColor, keep: 'temporary' }
    case 'eraser':
      return { tool: 'eraser', size: pen.eraserSize, color: pen.penColor, keep: 'temporary' }
    // 'text' places text with its own layer; the pointer and the laser draw nothing.
    default:
      return null
  }
}

export function slideHasInk(ink: LiveInk, cardId: string): boolean {
  return (ink[cardId]?.length ?? 0) > 0
}

/** The ink with `item` on `cardId`; the same object when the slide is full. */
export function addLiveItem(ink: LiveInk, cardId: string, item: LiveItem): LiveInk {
  const current = ink[cardId] ?? []
  if (current.length >= MAX_STROKES_PER_CARD) return ink
  return { ...ink, [cardId]: [...current, item] }
}

/** The ink with text `id` on `cardId` reading `text` (cut to the limit); the same object when unchanged. */
export function setLiveText(ink: LiveInk, cardId: string, id: string, text: string): LiveInk {
  const current = ink[cardId]
  const clipped = text.slice(0, MAX_TEXT_LENGTH)
  if (!current?.some((item) => item.id === id && isLiveText(item) && item.text !== clipped)) return ink
  return withSlide(
    ink,
    cardId,
    current.map((item) => (item.id === id && isLiveText(item) ? { ...item, text: clipped } : item)),
  )
}

/** The ink without the named items on `cardId`; the same object when none matched. */
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

function withSlide(ink: LiveInk, cardId: string, items: readonly LiveItem[]): LiveInk {
  const next: Record<string, readonly LiveItem[]> = { ...ink }
  if (items.length > 0) next[cardId] = items
  else delete next[cardId]
  return next
}

const fraction = z.number().refine(Number.isFinite)

const liveTextSchema = z.object({
  id: z.string().min(1).max(64),
  kind: z.literal('text'),
  x: fraction,
  y: fraction,
  text: z.string().max(MAX_TEXT_LENGTH),
  color: z.string().regex(/^(accent|foreground|#[0-9a-fA-F]{6})$/),
  size: z.number().positive().max(0.2),
})

/** One item from another window or from storage, or `null` when it is neither a valid stroke nor text. */
function parseLiveItem(raw: unknown): LiveItem | null {
  if (typeof raw === 'object' && raw !== null && (raw as { kind?: unknown }).kind === 'text') {
    const parsed = liveTextSchema.safeParse(raw)
    return parsed.success ? parsed.data : null
  }
  const item = parseOverlay([raw])?.[0]
  return item?.kind === 'stroke' ? item : null
}

/** Ink from another window or from storage: untrusted, so every item is re-checked. */
export function parseLiveInk(raw: unknown): LiveInk {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {}
  const ink: Record<string, LiveItem[]> = {}
  for (const [cardId, items] of Object.entries(raw)) {
    if (!Array.isArray(items)) continue
    const kept = items.map(parseLiveItem).filter((item): item is LiveItem => item !== null)
    if (kept.length > 0) ink[cardId] = kept.slice(0, MAX_STROKES_PER_CARD)
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

/** How many steps back one slide's ink can be undone. */
export const INK_UNDO_LIMIT = 50

/** One slide's undo and redo: the slide's strokes before each change, newest last. */
export interface SlideHistory {
  past: readonly (readonly LiveItem[])[]
  future: readonly (readonly LiveItem[])[]
}

/** Undo history by card id, so Undo only ever changes the slide on screen. Not kept across a reload. */
export type InkHistory = Readonly<Record<string, SlideHistory>>

/** The history after `cardId` changed from `before`: one more undo step, and no redo. */
export function recordInk(history: InkHistory, cardId: string, before: readonly LiveItem[]): InkHistory {
  const past = [...(history[cardId]?.past ?? []), before].slice(-INK_UNDO_LIMIT)
  return { ...history, [cardId]: { past, future: [] } }
}

export function canUndoInk(history: InkHistory, cardId: string): boolean {
  return (history[cardId]?.past.length ?? 0) > 0
}

export function canRedoInk(history: InkHistory, cardId: string): boolean {
  return (history[cardId]?.future.length ?? 0) > 0
}

/** The slide's ink one change back, or `null` when there is nothing to undo. */
export function undoInk(ink: LiveInk, history: InkHistory, cardId: string): { ink: LiveInk; history: InkHistory } | null {
  const slide = history[cardId]
  if (!slide || slide.past.length === 0) return null
  const previous = slide.past[slide.past.length - 1]
  return {
    ink: withSlide(ink, cardId, previous),
    history: { ...history, [cardId]: { past: slide.past.slice(0, -1), future: [...slide.future, ink[cardId] ?? []] } },
  }
}

/** The slide's ink one undone change forward again, or `null` when there is nothing to redo. */
export function redoInk(ink: LiveInk, history: InkHistory, cardId: string): { ink: LiveInk; history: InkHistory } | null {
  const slide = history[cardId]
  if (!slide || slide.future.length === 0) return null
  const next = slide.future[slide.future.length - 1]
  return {
    ink: withSlide(ink, cardId, next),
    history: { ...history, [cardId]: { past: [...slide.past, ink[cardId] ?? []], future: slide.future.slice(0, -1) } },
  }
}
