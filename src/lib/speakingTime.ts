/*
  150 wpm is the low end of conversational narration pace.

  Deliberately the low end: the estimate exists so somebody writing a script can
  tell whether a slide runs long, and a script that comes in under its estimate
  is a much better failure than one that overruns the slide it belongs to.
*/
const WORDS_PER_MINUTE = 150

export function wordCount(text: string): number {
  const trimmed = text.trim()
  if (trimmed === '') return 0
  return trimmed.split(/\s+/).length
}

export function speakingSeconds(text: string): number {
  return Math.round((wordCount(text) / WORDS_PER_MINUTE) * 60)
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return `${minutes}m ${String(rest).padStart(2, '0')}s`
}
