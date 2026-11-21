import { speakingSeconds } from '@/lib/speakingTime'
import { clipCost, formatUsd, waitMinutes } from './bookends'

/*
  What the Generate video dialog says about the talking intro and outro (pure): the extra wait
  and the WaveSpeed bill, from the words each box will speak. `null` when neither box has any.
*/

/** Seconds of speech for one box; a box with words is at least a second, so it is never priced at nothing. */
export function clipSeconds(text: string): number {
  if (text.trim() === '') return 0
  return Math.max(1, speakingSeconds(text))
}

export function faceCostLine(introText: string, outroText: string): string | null {
  const intro = clipSeconds(introText)
  const outro = clipSeconds(outroText)
  if (intro === 0 && outro === 0) return null
  const { min, max } = waitMinutes(Math.max(intro, outro))
  return `Adds about ${min}–${max} min and ${formatUsd(clipCost(intro) + clipCost(outro))} (WaveSpeed). It still bills if you cancel.`
}
