/**
 * Pure geometry for the /welcome page: which cube rotation shows which face,
 * where a callout's leader line runs, and how a card on the theme strip tilts.
 * No DOM here, so all of it is testable in node.
 */

export type FaceNumber = 1 | 2 | 3 | 4 | 5 | 6

/**
 * Where each face sits on the cube (CSS 3D, y points down). Opposite faces sum
 * to 7 like a real die: front/back = 1/6, top/bottom = 2/5, right/left = 3/4.
 */
export const FACE_TRANSFORMS: Record<FaceNumber, string> = {
  1: 'rotateY(0deg)',
  2: 'rotateX(90deg)',
  3: 'rotateY(90deg)',
  4: 'rotateY(-90deg)',
  5: 'rotateX(-90deg)',
  6: 'rotateY(180deg)',
}

/**
 * The cube's `rotateX(x) rotateY(y)` that brings each face to the front.
 * Each step keeps winding the same way (extra full turns), so scrubbing from
 * one chapter to the next reads as the die tumbling forward, never unwinding.
 */
export const FACE_ROTATIONS: Record<FaceNumber, { x: number; y: number }> = {
  1: { x: 0, y: 0 },
  2: { x: -90, y: 0 },
  3: { x: -360, y: -90 },
  4: { x: -360, y: -270 },
  5: { x: -270, y: -360 },
  6: { x: -720, y: -540 },
}

/** Pips on a 3×3 grid, cells numbered 0–8 left-to-right, top-to-bottom. */
export const PIP_CELLS: Record<FaceNumber, number[]> = {
  1: [4],
  2: [2, 6],
  3: [2, 4, 6],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
}

/**
 * A callout slot around the die, in die half-sizes from its centre.
 * `dir` is which way the line runs (1 = right), `rise` the 45° jog in
 * half-sizes (negative = up), `reach` the line's total horizontal run.
 */
export interface CalloutSlot {
  ax: number
  ay: number
  dir: 1 | -1
  rise: number
  reach: number
}

export interface CalloutPath {
  node: { x: number; y: number }
  /** SVG path: out, a 45° jog, then out again to the caption. */
  d: string
  /** The caption box: spans the last horizontal run and sits just above it. */
  label: { x: number; y: number; width: number }
}

const round = (n: number) => Math.round(n * 10) / 10

/**
 * The leader line for one slot, given the die's on-screen centre and
 * half-size in px (SUTÉRA's specimen-plate callout: horizontal, a 45° jog,
 * horizontal).
 */
export function calloutPath(slot: CalloutSlot, cx: number, cy: number, half: number): CalloutPath {
  const nx = cx + slot.ax * half
  const ny = cy + slot.ay * half
  const stub = 0.22 * half
  const jog = Math.abs(slot.rise) * half
  const x1 = nx + slot.dir * stub
  const x2 = x1 + slot.dir * jog
  const y2 = ny + Math.sign(slot.rise) * jog
  const x3 = nx + slot.dir * Math.max(slot.reach * half, stub + jog + 24)
  return {
    node: { x: round(nx), y: round(ny) },
    d: `M${round(nx)} ${round(ny)}H${round(x1)}L${round(x2)} ${round(y2)}H${round(x3)}`,
    label: { x: round(Math.min(x2, x3)), y: round(y2), width: round(Math.abs(x3 - x2)) },
  }
}

/**
 * Codapress's arc-fanned strip: a card's tilt and drop come from its distance
 * to the viewport centre, measured in viewport half-widths and clamped to ±1.6.
 */
export function arcCardPose(cardCentreX: number, viewportWidth: number) {
  const half = viewportWidth / 2
  const t = Math.max(-1.6, Math.min(1.6, (cardCentreX - half) / half))
  return { rotation: round(t * 7), y: round(t * t * 46) }
}
