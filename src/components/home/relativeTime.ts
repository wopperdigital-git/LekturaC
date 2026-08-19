const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 31536000],
  ['month', 2592000],
  ['week', 604800],
  ['day', 86400],
  ['hour', 3600],
  ['minute', 60],
]
const relativeFormatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })

/** "Updated 3 days ago" — shared by the grid card and the list row. */
export function relativeUpdatedAt(iso: string): string {
  const seconds = (Date.now() - new Date(iso).getTime()) / 1000
  if (seconds < 45) return 'Updated just now'
  for (const [unit, unitSeconds] of RELATIVE_UNITS) {
    const value = Math.floor(seconds / unitSeconds)
    if (value >= 1) return `Updated ${relativeFormatter.format(-value, unit)}`
  }
  return 'Updated just now'
}
