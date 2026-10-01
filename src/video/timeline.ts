/*
  The arithmetic of the video: how long each slide is held, when each picture is
  added, and how far to shrink a slide that is taller than the frame. Pure, so the
  rules that make the picture and the sound line up are checked without a browser.
*/

export const FRAME_WIDTH = 1280
export const FRAME_HEIGHT = 720
/** The stage's padding around the card, in frame pixels. `VideoSlide` uses the same number. */
export const STAGE_PADDING = 40
/** How long a slide with no narration stays on screen, with no sound. */
export const SILENT_SLIDE_SECONDS = 4
/**
 * A picture is added once per second of hold rather than one long one. The picture is the
 * same each time (cheap: nothing is redrawn), and players seek and scrub much better with
 * regular frames.
 */
export const FRAME_STEP_SECONDS = 1

export interface SlideTiming {
  index: number
  startSeconds: number
  durationSeconds: number
}

export interface Timeline {
  slides: SlideTiming[]
  totalSeconds: number
}

/**
 * Lays the slides end to end. A duration must be positive and finite: a slide with none
 * would have no time on screen and everything after it would drift against the audio,
 * which is built from the same numbers.
 */
export function planTimeline(durations: readonly number[]): Timeline {
  let cursor = 0
  const slides = durations.map((durationSeconds, index) => {
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      throw new RangeError(`Slide ${index + 1} has no duration.`)
    }
    const slide: SlideTiming = { index, startSeconds: cursor, durationSeconds }
    cursor += durationSeconds
    return slide
  })
  return { slides, totalSeconds: cursor }
}

export interface FrameSlot {
  timestamp: number
  duration: number
}

/** The pictures to add for one slide: one per second of hold, the last as long as what is left. Never empty. */
export function frameSlots(slide: SlideTiming): FrameSlot[] {
  const slots: FrameSlot[] = []
  let offset = 0
  do {
    slots.push({
      timestamp: slide.startSeconds + offset,
      duration: Math.min(FRAME_STEP_SECONDS, slide.durationSeconds - offset),
    })
    offset += FRAME_STEP_SECONDS
    // The epsilon keeps a whole number of seconds (3 -> frames at 0, 1, 2) from growing a fourth.
  } while (offset < slide.durationSeconds - 1e-9)
  return slots
}

/**
 * The scale that makes a slide of `contentHeight` fit in `availableHeight`, at most 1 (a slide
 * that fits is never enlarged). The video scales rather than crops, because the narrator reads
 * everything on the slide and the viewer has to be able to see it. Degenerate input gives 1
 * so a bad measurement cannot blank the frame.
 */
export function fitScale(contentHeight: number, availableHeight: number): number {
  if (!Number.isFinite(contentHeight) || contentHeight <= 0 || availableHeight <= 0) return 1
  return Math.min(1, availableHeight / contentHeight)
}

/**
 * The scale that fits a slide laid out `contentWidth` x `contentHeight` into the
 * `availableWidth` x `availableHeight` inside the frame: as large as fits, up or
 * down, and never cropped. 1 when there is nothing to measure.
 */
export function frameScale(
  contentWidth: number,
  contentHeight: number,
  availableWidth: number,
  availableHeight: number,
): number {
  if (!(contentWidth > 0) || !(contentHeight > 0) || !(availableWidth > 0) || !(availableHeight > 0)) return 1
  return Math.min(availableWidth / contentWidth, availableHeight / contentHeight)
}
