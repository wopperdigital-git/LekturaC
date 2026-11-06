import { describe, expect, it } from 'vitest'

import { placeCheckpoints, videoEnd } from './checkpoints'
import { LESSON_FIXTURE } from './fixtures'

const { slides, questions } = LESSON_FIXTURE

describe('placeCheckpoints', () => {
  it('orders by slide then question order, unplaced last', () => {
    const stops = placeCheckpoints(questions, slides)
    expect(stops.map((s) => s.questionId)).toEqual(['q2', 'q1', 'q4', 'q6', 'q3', 'q5'])
    expect(stops.map((s) => s.atSeconds)).toEqual([5, 15, 15, 18, 18, 18])
    expect(stops.map((s) => s.slideIndex)).toEqual([0, 2, 2, 3, null, null])
  })

  it('does not depend on the order the questions arrive in', () => {
    const shuffled = [...questions].reverse()
    expect(placeCheckpoints(shuffled, slides).map((s) => s.questionId)).toEqual([
      'q2', 'q1', 'q4', 'q6', 'q3', 'q5',
    ])
  })

  it('with no slides every stop is at 0 in question order', () => {
    const stops = placeCheckpoints([...questions].reverse(), [])
    expect(stops.map((s) => s.questionId)).toEqual(['q1', 'q2', 'q3', 'q4', 'q5', 'q6'])
    expect(stops.every((s) => s.atSeconds === 0 && s.slideIndex === null)).toBe(true)
  })

  it('never drops or duplicates a question', () => {
    const stops = placeCheckpoints(questions, slides)
    expect(stops).toHaveLength(questions.length)
    expect(new Set(stops.map((s) => s.questionId))).toEqual(new Set(questions.map((q) => q.id)))
    expect(placeCheckpoints([], slides)).toEqual([])
  })
})

describe('videoEnd', () => {
  it('is the last slide start plus duration, 0 for none', () => {
    expect(videoEnd(slides)).toBe(18)
    expect(videoEnd([])).toBe(0)
  })
})
