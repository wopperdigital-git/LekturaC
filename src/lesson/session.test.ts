import { describe, expect, it } from 'vitest'

import { placeCheckpoints } from './checkpoints'
import { LESSON_FIXTURE } from './fixtures'
import { initialSession, sessionReducer, type SessionEvent, type SessionState } from './session'

const stops = placeCheckpoints(LESSON_FIXTURE.questions, LESSON_FIXTURE.slides)
const reduce = sessionReducer(stops)

function run(state: SessionState, ...events: SessionEvent[]): SessionState {
  return events.reduce(reduce, state)
}
const answer = (
  questionId: string,
  correct = true,
  finished = false,
  score: number | null = null,
): SessionEvent => ({ type: 'answered', questionId, correct, finished, score })

describe('initialSession', () => {
  it('starts watching with the saved progress', () => {
    const s = initialSession(new Map([['q2', true]]), 5, null)
    expect(s).toMatchObject({ phase: 'watching', watchedUntil: 5, current: null, score: null, rewindTo: null })
    expect(s.answered.get('q2')).toBe(true)
  })
  it('is done with the score when the lesson is already finished', () => {
    const s = initialSession(new Map(), 18, 80)
    expect(s).toMatchObject({ phase: 'done', score: 80 })
  })
})

describe('tick', () => {
  it('asks the due stop', () => {
    const s = run(initialSession(new Map(), 0, null), { type: 'tick', time: 5, ended: false })
    expect(s.phase).toBe('asking')
    expect(s.current?.questionId).toBe('q2')
  })
  it('keeps watching before a stop is due', () => {
    const s = run(initialSession(new Map(), 0, null), { type: 'tick', time: 2, ended: false })
    expect(s.phase).toBe('watching')
    expect(s.current).toBeNull()
  })
  it('asks the next unanswered stop when the video ends', () => {
    const s = run(initialSession(new Map(), 0, null), { type: 'tick', time: 1, ended: true })
    expect(s.current?.questionId).toBe('q2')
  })
  it('is ignored while asking, in feedback and when done', () => {
    const asking = run(initialSession(new Map(), 0, null), { type: 'tick', time: 5, ended: false })
    expect(reduce(asking, { type: 'tick', time: 99, ended: true })).toBe(asking)
    const feedback = reduce(asking, answer('q2'))
    expect(reduce(feedback, { type: 'tick', time: 99, ended: true })).toBe(feedback)
    const done = initialSession(new Map(), 18, 100)
    expect(reduce(done, { type: 'tick', time: 1, ended: false })).toBe(done)
  })
  it('clears a pending rewind', () => {
    const refused = reduce(initialSession(new Map(), 4, null), { type: 'refused', watchedUntil: 4 })
    expect(refused.rewindTo).toBe(4)
    expect(reduce(refused, { type: 'tick', time: 4, ended: false }).rewindTo).toBeNull()
  })
})

describe('answered', () => {
  const asking = run(initialSession(new Map(), 0, null), { type: 'tick', time: 5, ended: false })

  it('moves to feedback and records the result without mutating the old map', () => {
    const s = reduce(asking, answer('q2', false))
    expect(s.phase).toBe('feedback')
    expect(s.lastCorrect).toBe(false)
    expect(s.answered.get('q2')).toBe(false)
    expect(asking.answered.has('q2')).toBe(false)
  })
  it('is done with the score when the server says finished', () => {
    const s = reduce(asking, answer('q2', true, true, 83))
    expect(s).toMatchObject({ phase: 'done', score: 83, lastCorrect: true })
  })
  it('does not infer done locally when all stops are answered', () => {
    const s = run(
      initialSession(new Map(['q1', 'q3', 'q4', 'q5', 'q6'].map((id) => [id, true])), 0, null),
      { type: 'tick', time: 5, ended: false },
      answer('q2'),
    )
    expect(s.phase).toBe('feedback')
  })
})

describe('continue', () => {
  it('goes back to watching when the next stop is later', () => {
    const s = run(
      initialSession(new Map(), 0, null),
      { type: 'tick', time: 5, ended: false },
      answer('q2'),
      { type: 'continue' },
    )
    expect(s).toMatchObject({ phase: 'watching', current: null, rewindTo: null })
  })
  it('asks straight away when the next stop is due at the same time', () => {
    const s = run(
      initialSession(new Map([['q2', true]]), 5, null),
      { type: 'tick', time: 15, ended: false },
      answer('q1'),
      { type: 'continue' },
    )
    expect(s.phase).toBe('asking')
    expect(s.current?.questionId).toBe('q4')
  })
  it('is ignored outside feedback', () => {
    const watching = initialSession(new Map(), 0, null)
    expect(reduce(watching, { type: 'continue' })).toBe(watching)
  })
})

describe('watchAck and refused', () => {
  it('watchAck never lowers watchedUntil', () => {
    const s0 = initialSession(new Map(), 10, null)
    expect(reduce(s0, { type: 'watchAck', watchedUntil: 4 }).watchedUntil).toBe(10)
    expect(reduce(s0, { type: 'watchAck', watchedUntil: 12 }).watchedUntil).toBe(12)
  })
  it('refused returns to watching and asks the player to rewind', () => {
    const asking = run(initialSession(new Map(), 6, null), { type: 'tick', time: 15, ended: false })
    const s = reduce(asking, { type: 'refused', watchedUntil: 6 })
    expect(s).toMatchObject({ phase: 'watching', rewindTo: 6, current: null, watchedUntil: 6 })
  })
  it('refused does nothing once done', () => {
    const done = initialSession(new Map(), 18, 100)
    expect(reduce(done, { type: 'refused', watchedUntil: 3 })).toBe(done)
  })
})
