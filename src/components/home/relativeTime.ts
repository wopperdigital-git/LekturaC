const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 31536000],
  ['month', 2592000],
  ['week', 604800],
  ['day', 86400],
  ['hour', 3600],
  ['minute', 60],
]
const relativeFormatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })

/** "3 days ago" / "just now" — the bare phrase, without a leading verb. */
function relativeAgo(timestamp: number): string | null {
  const seconds = (Date.now() - timestamp) / 1000
  if (seconds < 45) return null
  for (const [unit, unitSeconds] of RELATIVE_UNITS) {
    const value = Math.floor(seconds / unitSeconds)
    if (value >= 1) return relativeFormatter.format(-value, unit)
  }
  return null
}

/** "Updated 3 days ago" — shared by the grid card and the list row. */
export function relativeUpdatedAt(iso: string): string {
  const ago = relativeAgo(new Date(iso).getTime())
  return ago ? `Updated ${ago}` : 'Updated just now'
}

/** "Saved 3 days ago" — the draft-list equivalent, from an epoch timestamp. */
export function relativeSavedAt(timestamp: number): string {
  const ago = relativeAgo(timestamp)
  return ago ? `Saved ${ago}` : 'Saved just now'
}
