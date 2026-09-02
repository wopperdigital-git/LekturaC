export interface Size {
  width: number
  height: number
}

/**
 * The scale that makes `content` fit entirely inside `box`.
 *
 * Pulled out of the component because it is the whole of the fit behaviour and
 * the part worth pinning: every other line in `SlideCanvas` is measurement
 * plumbing, and this one decides what the user actually sees.
 *
 * Two rules, both deliberate:
 *
 * - **Never scale up.** A card shorter than the canvas is drawn at its natural
 *   size. Enlarging it to fill the space would give the same deck a different
 *   text size on every slide, which is precisely the templated look the twelve
 *   layouts exist to avoid — and the presenter view doesn't do it either.
 * - **Take the smaller ratio.** Fitting the tighter axis is what makes the
 *   *whole* card visible, which is the point: this replaced a scrolling canvas,
 *   so content that runs off the bottom would defeat it.
 *
 * A zero or negative dimension means nothing has been measured yet — the first
 * paint before `ResizeObserver` reports, or a container that is display:none.
 * That yields 1 (draw at natural size for one frame) rather than 0, which would
 * collapse the slide to nothing, or a division by zero yielding Infinity.
 */
export function fitScale(content: Size, box: Size): number {
  if (content.width <= 0 || content.height <= 0 || box.width <= 0 || box.height <= 0) return 1
  return Math.min(1, box.width / content.width, box.height / content.height)
}
