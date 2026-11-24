/*
  The Narrate tab walks the narration in the order the video plays it: the intro, every slide, then
  the outro. A "spot" is one stop on that walk. Pure, so the stepping rules (where Previous goes from
  slide 1, where Next stops) are tested without a browser.
*/

export type ScriptSpot = { kind: 'intro' } | { kind: 'slide'; index: number } | { kind: 'outro' }

export const INTRO: ScriptSpot = { kind: 'intro' }
export const OUTRO: ScriptSpot = { kind: 'outro' }

/** The spot `delta` steps away along intro → slides → outro, or `null` past either end. */
export function stepSpot(spot: ScriptSpot, delta: -1 | 1, slideCount: number): ScriptSpot | null {
  // Intro is position 0, slide i is i + 1, the outro is slideCount + 1.
  const at = spot.kind === 'intro' ? 0 : spot.kind === 'outro' ? slideCount + 1 : spot.index + 1
  const to = at + delta
  if (to < 0 || to > slideCount + 1) return null
  if (to === 0) return INTRO
  if (to === slideCount + 1) return OUTRO
  return { kind: 'slide', index: to - 1 }
}
