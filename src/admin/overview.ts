import { z } from 'zod'

/*
  The admin page's one read: `admin_overview(p_range)` (migrations 0019/0020)
  returns a single jsonb of site-wide counts for a time range. Parsed here so
  a missing or renamed key reads as zero instead of breaking the page, and so
  the page never has to know the SQL's shape. Counts only: nothing here can
  carry a name, email or text a user typed.
*/

export const RANGE_KEYS = ['7d', '30d', '12w', '12m'] as const
export type RangeKey = (typeof RANGE_KEYS)[number]
export const DEFAULT_RANGE: RangeKey = '12w'

export const RANGE_LABEL: Record<RangeKey, string> = {
  '7d': '7 days',
  '30d': '30 days',
  '12w': '12 weeks',
  '12m': '12 months',
}

export function parseRange(value: string | null | undefined): RangeKey {
  return (RANGE_KEYS as readonly string[]).includes(value ?? '') ? (value as RangeKey) : DEFAULT_RANGE
}

export type BucketUnit = 'day' | 'week' | 'month'

const count = z.coerce.number().catch(0)
const counts = z.record(z.string(), count).catch({})
const pair = z.object({ current: count, previous: count }).catch({ current: 0, previous: 0 })
/** A score pair: null when nobody submitted in that window. */
const scorePair = z
  .object({
    current: z.coerce.number().nullable().catch(null),
    previous: z.coerce.number().nullable().catch(null),
  })
  .catch({ current: null, previous: null })

const bucketSchema = z.object({
  start: z.string(),
  signupsGeneral: count,
  signupsTeacher: count,
  signupsStudent: count,
  active: count,
  decksManual: count,
  decksResearchOk: count,
  decksResearchFailed: count,
  decksResearchSkipped: count,
  videos: count,
  quizzes: count,
  attempts: count,
})
export type Bucket = z.infer<typeof bucketSchema>

export const adminOverviewSchema = z.object({
  generatedAt: z.string().catch(''),
  range: z
    .object({
      key: z.string().catch(DEFAULT_RANGE),
      unit: z.enum(['day', 'week', 'month']).catch('week'),
    })
    .catch({ key: DEFAULT_RANGE, unit: 'week' }),
  series: z
    .array(bucketSchema)
    .nullable()
    .transform((v) => v ?? [])
    .catch([]),
  compare: z
    .object({
      signups: pair,
      active: pair,
      decks: pair,
      aiDecks: pair,
      researchFailed: pair,
      claims: pair,
      unsourcedClaims: pair,
      videos: pair,
      quizzes: pair,
      attempts: pair,
      classes: pair,
      clonedVoices: pair,
      averageScore: scorePair,
    })
    .catch(() => ({
      signups: { current: 0, previous: 0 },
      active: { current: 0, previous: 0 },
      decks: { current: 0, previous: 0 },
      aiDecks: { current: 0, previous: 0 },
      researchFailed: { current: 0, previous: 0 },
      claims: { current: 0, previous: 0 },
      unsourcedClaims: { current: 0, previous: 0 },
      videos: { current: 0, previous: 0 },
      quizzes: { current: 0, previous: 0 },
      attempts: { current: 0, previous: 0 },
      classes: { current: 0, previous: 0 },
      clonedVoices: { current: 0, previous: 0 },
      averageScore: { current: null, previous: null },
    })),
  totals: z
    .object({
      accounts: count,
      byRole: counts,
      decks: count,
      averageSlides: count,
      videos: count,
      quizzes: count,
      classes: count,
      studentsEnrolled: count,
      attempts: count,
      clonedVoices: count,
      savedVoiceSettings: count,
    })
    .catch({
      accounts: 0,
      byRole: {},
      decks: 0,
      averageSlides: 0,
      videos: 0,
      quizzes: 0,
      classes: 0,
      studentsEnrolled: 0,
      attempts: 0,
      clonedVoices: 0,
      savedVoiceSettings: 0,
    }),
  funnel: z
    .object({ signedUp: count, madeDeck: count, madeVideoOrQuiz: count, postedToClass: count })
    .catch({ signedUp: 0, madeDeck: 0, madeVideoOrQuiz: 0, postedToClass: 0 }),
  breakdowns: z
    .object({
      research: counts,
      presentationType: counts,
      audienceLevel: counts,
      flags: counts,
      flagSeverity: counts,
      slideCounts: counts,
      quizTypes: counts,
      postings: z.object({ quiz: count, lesson: count }).catch({ quiz: 0, lesson: 0 }),
      reviewedClaims: count,
    })
    .catch({
      research: {},
      presentationType: {},
      audienceLevel: {},
      flags: {},
      flagSeverity: {},
      slideCounts: {},
      quizTypes: {},
      postings: { quiz: 0, lesson: 0 },
      reviewedClaims: 0,
    }),
})

export type AdminOverview = z.infer<typeof adminOverviewSchema>
export type CountPair = { current: number; previous: number }

export function parseAdminOverview(raw: unknown): AdminOverview {
  return adminOverviewSchema.parse(raw ?? {})
}

export interface Entry {
  key: string
  label: string
  value: number
}

/** Sorted biggest first; `order` (when given) fixes the order instead, keeping known keys even at zero. */
export function entriesOf(
  record: Record<string, number>,
  labels: Record<string, string> = {},
  order?: readonly string[],
): Entry[] {
  const label = (key: string) => labels[key] ?? humanize(key)
  if (order) {
    const known = order.map((key) => ({ key, label: label(key), value: record[key] ?? 0 }))
    const extra = Object.keys(record)
      .filter((key) => !order.includes(key))
      .map((key) => ({ key, label: label(key), value: record[key] ?? 0 }))
    return [...known, ...extra]
  }
  return Object.entries(record)
    .map(([key, value]) => ({ key, label: label(key), value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
}

/** `BODY_TOO_DENSE` → "Body too dense", `general_fact` → "General fact". */
export function humanize(key: string): string {
  const words = key.replace(/[_-]+/g, ' ').trim().toLowerCase()
  return words ? words[0]!.toUpperCase() + words.slice(1) : key
}

/** Whole percent of `part` in `whole`; 0 when there is no whole. */
export function percentOf(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0
}

export interface FunnelStep {
  label: string
  value: number
  /** Share of everyone who signed up. */
  ofTotal: number
}

export function funnelSteps(funnel: AdminOverview['funnel']): FunnelStep[] {
  const steps: [string, number][] = [
    ['Signed up', funnel.signedUp],
    ['Made a deck', funnel.madeDeck],
    ['Made a video or quiz', funnel.madeVideoOrQuiz],
    ['Posted to a class', funnel.postedToClass],
  ]
  return steps.map(([label, value]) => ({ label, value, ofTotal: percentOf(value, funnel.signedUp) }))
}

function dateOf(start: string): Date | null {
  const [y, m, d] = start.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

/** "Nov 9" for a day or week bucket, "Nov 2026" for a month (dates are plain days, read as local). */
export function bucketLabel(start: string, unit: BucketUnit): string {
  const date = dateOf(start)
  if (!date) return start
  return unit === 'month'
    ? date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** The tooltip's longer name for a bucket: "Nov 9", "Week of Nov 9", "November 2026". */
export function bucketTitle(start: string, unit: BucketUnit): string {
  const date = dateOf(start)
  if (!date) return start
  if (unit === 'month') return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const day = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  return unit === 'week' ? `Week of ${bucketLabel(start, unit)}` : day
}

export function sumOf(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0)
}

export type Direction = 'up' | 'down' | 'flat' | 'new'

export interface Change {
  direction: Direction
  /** "+12%", "−3", "No change", "New". */
  text: string
}

/**
 * How `current` moved against `previous`. A percentage when there was
 * something before; the raw difference when the base was zero (a percentage of
 * nothing is meaningless); `asPoints` compares two shares in percentage points.
 */
export function changeOf(current: number | null, previous: number | null, asPoints = false): Change | null {
  if (current === null || previous === null) return null
  if (asPoints) {
    // the difference of the two whole percents shown, so it always matches them
    const diff = Math.round(current * 100) - Math.round(previous * 100)
    if (diff === 0) return { direction: 'flat', text: 'No change' }
    return { direction: diff > 0 ? 'up' : 'down', text: `${diff > 0 ? '+' : '−'}${Math.abs(diff)} pts` }
  }
  if (current === previous) return { direction: 'flat', text: 'No change' }
  if (previous === 0) return { direction: 'new', text: `+${current} new` }
  const pct = Math.round(((current - previous) / previous) * 100)
  return { direction: pct >= 0 ? 'up' : 'down', text: `${pct >= 0 ? '+' : '−'}${Math.abs(pct)}%` }
}

/**
 * "Nice" axis ticks from 0 to at least `max`: steps of 1, 2 or 5 × 10ⁿ, about
 * `target` of them. Counts are whole numbers, so the step is never below 1.
 */
export function axisTicks(max: number, target = 4): number[] {
  if (!(max > 0)) return [0, 1]
  const raw = max / target
  const pow = 10 ** Math.floor(Math.log10(raw))
  const step = Math.max(1, [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? 10 * pow)
  const top = Math.ceil(max / step) * step
  const ticks: number[] = []
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(Math.round(v))
  return ticks
}

/** Which bucket indices get an x-axis label: the first, the last, and evenly between, at most `max`. */
export function labelIndices(length: number, max = 6): number[] {
  if (length <= 0) return []
  if (length <= max) return Array.from({ length }, (_, i) => i)
  const every = Math.ceil((length - 1) / (max - 1))
  const out: number[] = []
  for (let i = 0; i < length - 1; i += every) out.push(i)
  // keep the last bucket, dropping a neighbour that would crowd it
  if (out.length > 0 && length - 1 - out[out.length - 1]! < every / 2) out.pop()
  out.push(length - 1)
  return out
}
