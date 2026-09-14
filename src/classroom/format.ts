import type { Trend } from './stats'
import type { Person } from './types'

/** A 0–1 ratio as a whole percent; `null` (nothing to measure) as a dash, never 0%. */
export function formatPercent(ratio: number | null): string {
  return ratio === null ? '—' : `${Math.round(ratio * 100)}%`
}

/** "7 / 9", or a dash when nothing was expected — no quizzes posted is not failing. */
export function formatCompletion(stats: { expected: number; submitted: number }): string {
  return stats.expected === 0 ? '—' : `${stats.submitted} / ${stats.expected}`
}

export function personLabel(person: Person): string {
  return person.displayName.trim() || person.email.trim() || 'Unnamed account'
}

/** Case-insensitive substring match on any field. A blank query matches everything. */
export function matchesQuery(query: string, ...fields: string[]): boolean {
  const q = query.trim().toLowerCase()
  return !q || fields.some((field) => field.toLowerCase().includes(q))
}

export function describeTrend(trend: Trend): string {
  if (trend.kind === 'insufficient') return 'Not enough data'
  if (trend.direction === 'steady') return 'Steady'
  const points = Math.round(Math.abs(trend.delta) * 100)
  return trend.direction === 'improving' ? `Improving (+${points} pts)` : `Slipping (−${points} pts)`
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}
