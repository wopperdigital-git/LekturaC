/*
  The arithmetic of motion in the video: when each build step arrives, how the pictures of
  a slide are layered while one arrives, how far the camera has pushed in, and how a slide
  fades in from the one before. Pure, so the rhythm is checked without a browser. Nothing
  here moves a part: the painter shows and hides what these numbers say.
*/

/** Slide segments are drawn at this rate. */
export const MOTION_FPS = 30
/** A slide fades in from the picture before it over this long. */
export const CROSSFADE_SECONDS = 0.4
/** One build step takes this long to arrive. */
export const BUILD_ENTRANCE_SECONDS = 0.5
/** Steps start this far apart on a slide long enough to allow it. */
export const BUILD_INTERVAL_SECONDS = 0.6
/** Every step has arrived by this share of the slide, so the narration is never read over a half-built slide. */
export const BUILD_DONE_SHARE = 0.4
/** A slide builds in at most this many steps. */
export const MAX_BUILD_STEPS = 6
/** The slow push-in ends this much larger than it began (1.00 to 1.03). */
export const CAMERA_PUSH = 0.03

export interface BuildStep {
  start: number
  duration: number
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x
}

/**
 * When each of `stepCount` steps arrives within a slide of `durationSeconds`: the first after the
 * crossfade, the rest 0.6 s apart, each taking 0.5 s. A short slide squeezes the lot (crossfade,
 * entrance and spacing) so the last step has finished by 40% of it. Empty for no steps.
 */
export function buildSchedule(stepCount: number, durationSeconds: number): BuildStep[] {
  const n = Math.max(0, Math.floor(stepCount))
  if (n === 0) return []
  const end = BUILD_DONE_SHARE * durationSeconds
  const first = Math.min(CROSSFADE_SECONDS, end / 2)
  const entrance = Math.min(BUILD_ENTRANCE_SECONDS, end - first)
  const interval = n > 1 ? Math.min(BUILD_INTERVAL_SECONDS, (end - first - entrance) / (n - 1)) : 0
  return Array.from({ length: n }, (_, k) => ({ start: first + k * interval, duration: entrance }))
}

/** Which step a unit arrives in: the first five have a step each, everything after shares the last. */
export function stepOf(unitIndex: number): number {
  return Math.min(unitIndex, MAX_BUILD_STEPS - 1)
}

/**
 * Whether a slide builds item by item or holder by holder. Items win unless they overflow the step cap
 * while the holders alone would fit it: then each holder is one unit, so no group is squeezed into the
 * last step and the others spread out.
 */
export function chooseUnits(itemLevelCount: number, holderLevelCount: number): 'items' | 'holders' {
  return itemLevelCount > MAX_BUILD_STEPS && holderLevelCount <= MAX_BUILD_STEPS ? 'holders' : 'items'
}

/** How many steps `unitCount` units build in. */
export function stepCountFor(unitCount: number): number {
  return Math.min(unitCount, MAX_BUILD_STEPS)
}

/** Cubic ease-out, clamped to 0..1: fast at first, settling with no overshoot. */
export function easeOut(x: number): number {
  const c = clamp01(x)
  return 1 - (1 - c) ** 3
}

/** How far a step has come at time `t` (seconds into the slide), eased, 0 before it and 1 after. */
export function stepProgress(step: BuildStep, t: number): number {
  return easeOut((t - step.start) / step.duration)
}

export interface LayerPlan {
  /** The state painted opaque: the number of steps already done (0 = nothing built yet). */
  base: number
  /** States painted over the base, in order, each at its alpha. */
  blends: { state: number; alpha: number }[]
}

/**
 * What to paint at time `t`: the state with every finished step in it, then each step still
 * arriving blended over it. State `k` is the slide with its first `k` steps shown.
 */
export function layerPlan(schedule: BuildStep[], t: number): LayerPlan {
  const progress = schedule.map((step) => stepProgress(step, t))
  const base = progress.filter((p) => p >= 1).length
  const blends: LayerPlan['blends'] = []
  for (let j = base; j < progress.length; j++) {
    if (progress[j] > 0) blends.push({ state: j + 1, alpha: progress[j] })
  }
  return { base, blends }
}

/** The slow push-in: 1.00 at the start of a slide to 1.03 at its end, linear, held there after. */
export function cameraScale(t: number, durationSeconds: number): number {
  return 1 + CAMERA_PUSH * clamp01(t / durationSeconds)
}

// Points near the centre of the 1280x720 frame (x 400-880, y 260-460), so a push never
// pulls a card's edge out of view. Neighbouring slides get different ones.
const ORIGINS = [
  { x: 640, y: 360 },
  { x: 520, y: 300 },
  { x: 760, y: 420 },
  { x: 560, y: 420 },
  { x: 720, y: 300 },
]

/** Where the camera pushes toward for a slide: a fixed cycle, so the same deck always moves the same way. */
export function cameraOrigin(slideIndex: number): { x: number; y: number } {
  return ORIGINS[((slideIndex % ORIGINS.length) + ORIGINS.length) % ORIGINS.length]
}

/** How much of a slide shows over the picture before it, `t` seconds in: linear over 0.4 s. */
export function crossfadeAlpha(t: number): number {
  return clamp01(t / CROSSFADE_SECONDS)
}
