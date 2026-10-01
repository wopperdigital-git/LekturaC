import { describe, expect, it } from 'vitest'
import { deckTimeline, quizTimeline, videoTimeline } from './timelines'

const states = (r: { timeline: { id: string; state: string }[] }) => r.timeline.map((e) => `${e.id}:${e.state}`)

describe('deckTimeline', () => {
  it('marks earlier stages done, the current active and the rest pending', () => {
    expect(states(deckTimeline('validate', null))).toEqual([
      'research:done', 'write:done', 'validate:active', 'save:pending',
    ])
  })
  it('shows research as done when it was skipped and writing starts', () => {
    expect(states(deckTimeline('write', null))[0]).toBe('research:done')
  })
  it('adds the repair row only once a repair runs, with its slide count', () => {
    const r = deckTimeline('repair', 3)
    expect(r.timeline.map((e) => e.label)).toContain('Tightening 3 slides')
    expect(deckTimeline('repair', 1).timeline.map((e) => e.label)).toContain('Tightening 1 slide')
    expect(states(deckTimeline('save', 3))).toEqual([
      'research:done', 'write:done', 'validate:done', 'repair:done', 'save:active',
    ])
  })
  it('progress rises through the stages and stays below 1', () => {
    const order = (['research', 'write', 'validate', 'repair', 'save'] as const).map((s) => deckTimeline(s, 2).progress)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    expect(Math.max(...order)).toBeLessThan(1)
  })
})

describe('quizTimeline', () => {
  it('has one row per test plus saving', () => {
    const r = quizTimeline(['Test 1', 'Vocabulary'], 1)
    expect(r.timeline.map((e) => e.label)).toEqual(['Writing Test 1', 'Writing Vocabulary', 'Saving'])
    expect(states(r)).toEqual(['test-0:done', 'test-1:active', 'save:pending'])
    expect(r.progress).toBeCloseTo(1 / 3)
  })
  it('save marks every test done', () => {
    expect(states(quizTimeline(['A'], 'save'))).toEqual(['test-0:done', 'save:active'])
  })
})

describe('videoTimeline', () => {
  it('starts with narrating active at 0', () => {
    const r = videoTimeline(null)
    expect(r.timeline[0].state).toBe('active')
    expect(r.progress).toBe(0)
  })
  it('puts the n/total count on the active row and advances progress within a stage', () => {
    const a = videoTimeline({ stage: 'narrating', done: 1, total: 4 })
    const b = videoTimeline({ stage: 'narrating', done: 3, total: 4 })
    expect(a.timeline[0].label).toMatch(/1\/4$/)
    expect(b.progress).toBeGreaterThan(a.progress)
    expect(videoTimeline({ stage: 'uploading', done: 0, total: 1 }).progress).toBeGreaterThanOrEqual(0.9)
  })
})
