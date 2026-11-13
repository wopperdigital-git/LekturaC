import { describe, expect, it } from 'vitest'
import {
  axisTicks,
  bucketLabel,
  bucketTitle,
  changeOf,
  entriesOf,
  funnelSteps,
  humanize,
  labelIndices,
  parseAdminOverview,
  parseRange,
  percentOf,
  sumOf,
} from './overview'

describe('parseAdminOverview', () => {
  it('reads a full reply, coercing bigint strings to numbers', () => {
    const o = parseAdminOverview({
      generatedAt: '2026-11-13T00:00:00Z',
      range: { key: '30d', unit: 'day' },
      series: [
        {
          start: '2026-11-13',
          signupsGeneral: '1',
          signupsTeacher: 1,
          signupsStudent: 1,
          active: 2,
          decksManual: 0,
          decksResearchOk: 1,
          decksResearchFailed: 0,
          decksResearchSkipped: 0,
          videos: 0,
          quizzes: 0,
          attempts: 0,
        },
      ],
      compare: {
        signups: { current: '3', previous: 1 },
        averageScore: { current: '0.625', previous: null },
      },
      totals: { accounts: '25', byRole: { teacher: '4' }, averageSlides: '5.4' },
      breakdowns: { research: { ok: 4, failed: 1 }, postings: { quiz: 2, lesson: 1 } },
    })
    expect(o.range).toEqual({ key: '30d', unit: 'day' })
    expect(o.series[0]!.signupsGeneral).toBe(1)
    expect(o.compare.signups).toEqual({ current: 3, previous: 1 })
    expect(o.compare.averageScore).toEqual({ current: 0.625, previous: null })
    // a key missing from a present section reads as zero
    expect(o.compare.decks).toEqual({ current: 0, previous: 0 })
    expect(o.totals.accounts).toBe(25)
    expect(o.totals.byRole.teacher).toBe(4)
    expect(o.totals.averageSlides).toBe(5.4)
    expect(o.breakdowns.postings).toEqual({ quiz: 2, lesson: 1 })
  })

  it('reads a missing or malformed reply as zeros, never throwing', () => {
    for (const raw of [null, undefined, {}, { series: 'nope', totals: 'x', compare: 4 }]) {
      const o = parseAdminOverview(raw)
      expect(o.series).toEqual([])
      expect(o.totals.accounts).toBe(0)
      expect(o.compare.active).toEqual({ current: 0, previous: 0 })
      expect(o.compare.averageScore).toEqual({ current: null, previous: null })
      expect(o.range.unit).toBe('week')
    }
  })

  it('keeps a section whose single key is bad, zeroing only that key', () => {
    const o = parseAdminOverview({ totals: { videos: 'lots', quizzes: 3 } })
    expect(o.totals.quizzes).toBe(3)
    expect(o.totals.videos).toBe(0)
  })
})

describe('parseRange', () => {
  it('accepts the four ranges and falls back to 12 weeks', () => {
    expect(parseRange('7d')).toBe('7d')
    expect(parseRange('12m')).toBe('12m')
    expect(parseRange('1y')).toBe('12w')
    expect(parseRange(null)).toBe('12w')
  })
})

describe('changeOf', () => {
  it('gives a signed percentage against a non-zero base', () => {
    expect(changeOf(12, 10)).toEqual({ direction: 'up', text: '+20%' })
    expect(changeOf(7, 10)).toEqual({ direction: 'down', text: '−30%' })
  })

  it('never divides by a zero base', () => {
    expect(changeOf(3, 0)).toEqual({ direction: 'new', text: '+3 new' })
    expect(changeOf(0, 0)).toEqual({ direction: 'flat', text: 'No change' })
  })

  it('compares shares in points, and gives nothing without both sides', () => {
    // 70% vs 63% (62.5 rounds up): the change matches the two numbers shown
    expect(changeOf(0.7, 0.625, true)).toEqual({ direction: 'up', text: '+7 pts' })
    expect(changeOf(0.5, null, true)).toBeNull()
  })
})

describe('axisTicks', () => {
  it('uses 1/2/5 steps from zero up past the max', () => {
    expect(axisTicks(7)).toEqual([0, 2, 4, 6, 8])
    expect(axisTicks(10)).toEqual([0, 5, 10])
    expect(axisTicks(37)).toEqual([0, 10, 20, 30, 40])
  })

  it('never steps below 1 for small counts, and handles an empty chart', () => {
    expect(axisTicks(2)).toEqual([0, 1, 2])
    expect(axisTicks(0)).toEqual([0, 1])
  })
})

describe('labelIndices', () => {
  it('labels every bucket when few, else first, last and evenly between', () => {
    expect(labelIndices(4)).toEqual([0, 1, 2, 3])
    const thirty = labelIndices(30)
    expect(thirty[0]).toBe(0)
    expect(thirty[thirty.length - 1]).toBe(29)
    expect(thirty.length).toBeLessThanOrEqual(6)
  })

  it('never crowds the last label', () => {
    for (const n of [7, 12, 13, 30]) {
      const out = labelIndices(n)
      if (out.length >= 2) expect(out[out.length - 1]! - out[out.length - 2]!).toBeGreaterThanOrEqual(2)
    }
  })
})

describe('labels and helpers', () => {
  it('labels buckets by unit without a timezone shift', () => {
    expect(bucketLabel('2026-11-09', 'week')).toBe('Nov 9')
    expect(bucketLabel('2026-11-01', 'month')).toBe('Nov 2026')
    expect(bucketTitle('2026-11-09', 'week')).toBe('Week of Nov 9')
    expect(bucketTitle('2026-11-01', 'month')).toBe('November 2026')
    expect(bucketLabel('garbage', 'day')).toBe('garbage')
  })

  it('humanizes flag and enum keys', () => {
    expect(humanize('BODY_TOO_DENSE')).toBe('Body too dense')
  })

  it('percentOf guards an empty whole, sumOf adds', () => {
    expect(percentOf(1, 0)).toBe(0)
    expect(percentOf(1, 3)).toBe(33)
    expect(sumOf([2, 3])).toBe(5)
  })

  it('entriesOf sorts, or keeps a fixed order with zeros then extras', () => {
    expect(entriesOf({ b: 1, a: 1, c: 5 }).map((e) => e.key)).toEqual(['c', 'a', 'b'])
    expect(entriesOf({ teacher: 2, x: 1 }, {}, ['general', 'teacher']).map((e) => [e.key, e.value])).toEqual([
      ['general', 0],
      ['teacher', 2],
      ['x', 1],
    ])
  })

  it('funnel shares are of everyone who signed up', () => {
    const steps = funnelSteps({ signedUp: 10, madeDeck: 5, madeVideoOrQuiz: 2, postedToClass: 0 })
    expect(steps.map((s) => s.ofTotal)).toEqual([100, 50, 20, 0])
  })
})
