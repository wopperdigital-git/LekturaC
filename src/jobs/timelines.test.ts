import { describe, expect, it } from 'vitest'
import { deckTimeline, narrationTimeline, quizTimeline, videoTimeline } from './timelines'

const states = (r: { timeline: { id: string; state: string }[] }) => r.timeline.map((e) => `${e.id}:${e.state}`)

describe('deckTimeline', () => {
  it('marks earlier stages done, the current active and the rest pending', () => {
    expect(states(deckTimeline('validate', null))).toEqual([
      'research:done', 'write:done', 'validate:active', 'photos:pending', 'save:pending',
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
      'research:done', 'write:done', 'validate:done', 'repair:done', 'photos:done', 'save:active',
    ])
  })
  it('shows Finding photos active between repair and saving', () => {
    const r = deckTimeline('photos', 2)
    expect(states(r)).toEqual([
      'research:done', 'write:done', 'validate:done', 'repair:done', 'photos:active', 'save:pending',
    ])
    expect(r.timeline.find((e) => e.id === 'photos')!.label).toBe('Finding photos')
    expect(r.progress).toBe(0.88)
  })
  it('progress rises through the stages and stays below 1', () => {
    const order = (['research', 'write', 'validate', 'repair', 'photos', 'save'] as const).map((s) => deckTimeline(s, 2).progress)
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

describe('videoTimeline with the face', () => {
  it('has the animating row second and starts it at 0.15 of the bar', () => {
    const r = videoTimeline({ stage: 'animating', done: 0, total: 2 }, true)
    expect(r.timeline.map((e) => e.id)).toEqual(['narrating', 'animating', 'rendering', 'encoding', 'uploading'])
    expect(r.progress).toBe(0.15)
  })
  it('rises through the stages and ends at 1', () => {
    const at = (stage: 'narrating' | 'animating' | 'rendering' | 'encoding' | 'uploading') =>
      videoTimeline({ stage, done: 0, total: 1 }, true).progress
    const expected = [0, 0.15, 0.6, 0.85, 0.93]
    ;(['narrating', 'animating', 'rendering', 'encoding', 'uploading'] as const).forEach((s, i) =>
      expect(at(s)).toBeCloseTo(expected[i]),
    )
    expect(videoTimeline({ stage: 'uploading', done: 1, total: 1 }, true).progress).toBeCloseTo(1)
  })
  it('is unchanged without the face', () => {
    expect(videoTimeline({ stage: 'rendering', done: 0, total: 1 }).progress).toBeCloseTo(0.4)
    expect(videoTimeline({ stage: 'rendering', done: 0, total: 1 }, false).timeline).toHaveLength(4)
  })
})

describe('narrationTimeline', () => {
  it('writes, then saves, naming how many slides', () => {
    expect(states(narrationTimeline(3, 'write'))).toEqual(['write:active', 'save:pending'])
    expect(states(narrationTimeline(3, 'save'))).toEqual(['write:done', 'save:active'])
    expect(narrationTimeline(1, 'write').timeline[0].label).toBe('Writing scripts for 1 slide')
    expect(narrationTimeline(3, 'write').progress).toBeLessThan(narrationTimeline(3, 'save').progress)
  })
})
