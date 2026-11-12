// Pure pacing arithmetic for the presenter view. No clock reads: callers pass
// elapsed time in.

export const WORDS_PER_MINUTE = 150
export const MIN_SLIDE_SECONDS = 30
export const ON_TIME_TOLERANCE_SECONDS = 30
export const MIN_TARGET_MINUTES = 1
export const MAX_TARGET_MINUTES = 180

export function wordCount(text: string | undefined): number {
  const trimmed = text?.trim()
  return trimmed ? trimmed.split(/\s+/).length : 0
}

/** Seconds planned for each slide: its script at 150 wpm, never under 30. */
export function slideBudgets(scripts: readonly (string | undefined)[]): number[] {
  return scripts.map((script) =>
    Math.max(
      MIN_SLIDE_SECONDS,
      Math.round((wordCount(script) / WORDS_PER_MINUTE) * 60),
    ),
  )
}

function clampMinutes(minutes: number): number {
  return Math.min(MAX_TARGET_MINUTES, Math.max(MIN_TARGET_MINUTES, minutes))
}

export function estimateMinutes(budgets: readonly number[]): number {
  const total = budgets.reduce((sum, seconds) => sum + seconds, 0)
  return clampMinutes(Math.ceil(total / 60))
}

/** A typed target length in minutes; null means refuse (the caller reverts). */
export function parseTargetMinutes(input: string): number | null {
  const trimmed = input.trim()
  if (trimmed === '') return null
  const value = Number(trimmed)
  if (!Number.isFinite(value)) return null
  return clampMinutes(Math.round(value))
}

export type PaceStatus = 'ahead' | 'on-time' | 'behind'

export interface Pace {
  status: PaceStatus
  minutes: number
  elapsedFraction: number
  plannedFraction: number
}

const ON_TIME: Pace = {
  status: 'on-time',
  minutes: 0,
  elapsedFraction: 0,
  plannedFraction: 0,
}

export function pace(
  elapsedSec: number,
  index: number,
  budgets: readonly number[],
  targetSec: number,
  startIndex: number,
): Pace {
  const n = budgets.length
  if (n === 0 || targetSec <= 0) return { ...ON_TIME }
  const total = budgets.reduce((sum, seconds) => sum + seconds, 0)
  if (total <= 0) return { ...ON_TIME }

  // B(i): planned seconds before slide i; indices are clamped into the deck.
  const before = (i: number) => {
    let sum = 0
    for (let k = 0; k < Math.min(Math.max(i, 0), n); k++) sum += budgets[k]
    return sum
  }
  const at = Math.min(Math.max(index, 0), n - 1)
  const lo = (targetSec * before(at)) / total
  const hi = (targetSec * before(at + 1)) / total
  const effective = elapsedSec + (targetSec * before(startIndex)) / total

  const diff = effective < lo ? lo - effective : effective > hi ? effective - hi : 0
  const status: PaceStatus =
    diff <= ON_TIME_TOLERANCE_SECONDS ? 'on-time' : effective < lo ? 'ahead' : 'behind'
  return {
    status,
    minutes: status === 'on-time' ? 0 : Math.max(1, Math.round(diff / 60)),
    elapsedFraction: Math.min(1, Math.max(0, effective / targetSec)),
    plannedFraction: lo / targetSec,
  }
}
