import { describe, expect, it } from 'vitest'
import { factCheckNotice, markChecked, readFactCheck } from './factCheck'

const source = { id: 's1', title: 'Census 2024', publisher: 'ONS', url: 'https://ons.example/census', sourceType: 'government' }

function claim(id: string, slideIndex: number, extra: Record<string, unknown> = {}) {
  return { id, slideIndex, statement: `Claim ${id}`, type: 'statistic', sourceIds: [], timeSensitive: false, verified: false, ...extra }
}

/** A stored `presentations.generation` row: claims keyed by card id, as `buildGenerationMeta` writes them. */
function meta(extra: Record<string, unknown> = {}) {
  return {
    version: 1,
    research: 'ok',
    sources: [source],
    claims: {
      a: [],
      b: [claim('c2-1', 1), claim('c2-2', 1, { sourceIds: ['s1'], verified: true })],
      c: [claim('c3-1', 2, { type: 'opinion' })],
      d: [claim('c4-1', 3)],
    },
    flags: [],
    ...extra,
  }
}

// The deck as it is now: ids in the editor's order, which may differ from when it was generated.
const cards = [
  { id: 'a', orderIndex: 0 },
  { id: 'b', orderIndex: 1 },
  { id: 'c', orderIndex: 2 },
  { id: 'd', orderIndex: 3 },
]

describe('readFactCheck', () => {
  it('lists each claim under its slide, in slide order, with its sources resolved', () => {
    const fc = readFactCheck(meta(), cards)!
    expect(fc.items.map((i) => [i.claimId, i.slideNumber])).toEqual([
      ['c2-1', 2],
      ['c2-2', 2],
      ['c4-1', 4],
    ])
    expect(fc.items[1]).toMatchObject({ verified: true, sources: [{ title: 'Census 2024', publisher: 'ONS' }] })
    expect(fc.items[0]).toMatchObject({ verified: false, sources: [] })
  })

  it('asks for a check only on unsourced claims, never on opinions', () => {
    const fc = readFactCheck(meta(), cards)!
    expect(fc.needsCheck.map((i) => i.claimId)).toEqual(['c2-1', 'c4-1'])
    expect(fc.items.some((i) => i.type === 'opinion')).toBe(false)
  })

  // Keyed by card id, so a moved slide keeps its claims and a deleted one takes them with it.
  it('follows the slides as they are now: moved slides renumber, deleted slides drop out', () => {
    const now = [
      { id: 'd', orderIndex: 0 },
      { id: 'a', orderIndex: 1 },
      { id: 'b', orderIndex: 2 },
    ]
    const fc = readFactCheck(meta(), now)!
    expect(fc.items.map((i) => [i.claimId, i.slideNumber])).toEqual([
      ['c4-1', 1],
      ['c2-1', 3],
      ['c2-2', 3],
    ])
  })

  it('drops a claim once it is marked checked', () => {
    const fc = readFactCheck(meta({ reviewed: ['c2-1'] }), cards)!
    expect(fc.needsCheck.map((i) => i.claimId)).toEqual(['c4-1'])
    expect(fc.items.find((i) => i.claimId === 'c2-1')?.reviewed).toBe(true)
  })

  // Skipped research means the brief said "only use my material": the claims are the teacher's own.
  it('asks for nothing when research was skipped', () => {
    expect(readFactCheck(meta({ research: 'skipped' }), cards)!.needsCheck).toEqual([])
  })

  it('is null for a deck with nothing to check: no row, an unreadable row, or no claims', () => {
    expect(readFactCheck(null, cards)).toBeNull()
    expect(readFactCheck('nonsense', cards)).toBeNull()
    expect(readFactCheck({ version: 2, claims: {} }, cards)).toBeNull()
    expect(readFactCheck(meta({ claims: { a: [] } }), cards)).toBeNull()
  })

  it('skips a malformed claim or source rather than losing the rest', () => {
    const fc = readFactCheck(
      meta({ claims: { b: [{ junk: true }, claim('c2-1', 1)] }, sources: [{ nope: 1 }, source] }),
      cards,
    )!
    expect(fc.items.map((i) => i.claimId)).toEqual(['c2-1'])
  })
})

describe('markChecked', () => {
  it('adds the claim to the reviewed list once, keeping the rest of the row', () => {
    const once = markChecked(meta(), 'c2-1')!
    expect(once.reviewed).toEqual(['c2-1'])
    expect(once.claims).toEqual(meta().claims)
    expect(markChecked(once, 'c2-1')!.reviewed).toEqual(['c2-1'])
  })

  it('is null for a row it cannot read', () => {
    expect(markChecked(null, 'c2-1')).toBeNull()
  })
})

describe('factCheckNotice', () => {
  it('counts the unsourced claims and names their slides', () => {
    expect(factCheckNotice(readFactCheck(meta(), cards)!)).toBe('2 claims on slides 2 and 4 have no source.')
    expect(factCheckNotice(readFactCheck(meta({ reviewed: ['c2-1'] }), cards)!)).toBe('1 claim on slide 4 has no source.')
  })

  it('lists three or more slides with commas', () => {
    const fc = readFactCheck(
      meta({ claims: { a: [claim('c1-1', 0)], b: [claim('c2-1', 1)], d: [claim('c4-1', 3)] } }),
      cards,
    )!
    expect(factCheckNotice(fc)).toBe('3 claims on slides 1, 2 and 4 have no source.')
  })

  it('says so when web research failed, since nothing was checked', () => {
    expect(factCheckNotice(readFactCheck(meta({ research: 'failed' }), cards)!)).toBe(
      "Web research didn't work for this deck, so 2 claims on slides 2 and 4 weren't checked against sources.",
    )
  })

  it('is null when nothing needs checking', () => {
    expect(factCheckNotice(readFactCheck(meta({ reviewed: ['c2-1', 'c4-1'] }), cards)!)).toBeNull()
  })
})
