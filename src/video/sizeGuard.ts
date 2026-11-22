/*
  The storage bucket caps a file at 50 MiB, and motion makes the picture track bigger, so the
  encode quality is chosen from the video's total length before anything is encoded. The rates are
  measured estimates for video plus audio. A video that cannot fit even at `low` is refused up
  front rather than failing at the upload after minutes of encoding.
*/

export type EncodeQuality = 'medium' | 'low'

export const MEDIUM_MIB_PER_MINUTE = 3.2
export const LOW_MIB_PER_MINUTE = 2.2
/** The most a `medium` encode may be estimated at; past it the video drops to `low`. */
export const MEDIUM_BUDGET_MIB = 45
/** The most a `low` encode may be estimated at; past it the video is refused. */
export const LOW_BUDGET_MIB = 48

/** `medium` if its estimate fits, else `low` if that does, else `null` (too long to save). */
export function encodeQualityFor(totalSeconds: number): EncodeQuality | null {
  const minutes = totalSeconds / 60
  if (minutes * MEDIUM_MIB_PER_MINUTE <= MEDIUM_BUDGET_MIB) return 'medium'
  if (minutes * LOW_MIB_PER_MINUTE <= LOW_BUDGET_MIB) return 'low'
  return null
}

/** User-facing: minutes only, never sizes. */
export function tooLongMessage(totalSeconds: number): string {
  const minutes = Math.round(totalSeconds / 60)
  const maxMinutes = Math.floor(LOW_BUDGET_MIB / LOW_MIB_PER_MINUTE)
  return `This video would run about ${minutes} minutes, which is too long to save. The longest that fits is about ${maxMinutes} minutes. Shorten the narration or split the deck, then try again.`
}
