import { describe, expect, it } from 'vitest'
import {
  commitJump,
  initialPresenterState,
  JUMP_TIMEOUT_MS,
  reducePresenter,
  typeDigit,
  type PresenterAction,
  type PresenterState,
} from './presenterState'

const at = (index: number, count = 3, extra: Partial<PresenterState> = {}): PresenterState => ({
  index,
  count,
  black: false,
  ended: false,
  ...extra,
})

describe('initialPresenterState', () => {
  it('clamps the start to the last slide', () => {
    expect(initialPresenterState(5, 9).index).toBe(4)
  })
  it('clamps a negative start to zero', () => {
    expect(initialPresenterState(5, -2).index).toBe(0)
  })
  it('starts neither black nor ended', () => {
    expect(initialPresenterState(5, 2)).toEqual({ index: 2, count: 5, black: false, ended: false })
  })
  it('handles an empty deck', () => {
    expect(initialPresenterState(0, 3)).toEqual({ index: 0, count: 0, black: false, ended: false })
  })
})

describe('reducePresenter', () => {
  it('next walks to the last slide, then sets ended; a further next keeps it', () => {
    let s = at(0)
    s = reducePresenter(s, { type: 'next' })
    expect(s.index).toBe(1)
    s = reducePresenter(s, { type: 'next' })
    expect(s).toEqual(at(2))
    s = reducePresenter(s, { type: 'next' })
    expect(s).toEqual(at(2, 3, { ended: true }))
    expect(reducePresenter(s, { type: 'next' })).toEqual(s)
  })

  it('prev from ended returns to the last slide, not ended', () => {
    const s = at(2, 3, { ended: true })
    expect(reducePresenter(s, { type: 'prev' })).toEqual({ index: 2, count: 3, black: false, ended: false })
  })

  it('prev never goes below zero', () => {
    expect(reducePresenter(at(0), { type: 'prev' }).index).toBe(0)
    expect(reducePresenter(at(2), { type: 'prev' }).index).toBe(1)
  })

  it('while black, next and prev only clear black', () => {
    const s = at(1, 3, { black: true })
    expect(reducePresenter(s, { type: 'next' })).toEqual(at(1))
    expect(reducePresenter(s, { type: 'prev' })).toEqual(at(1))
  })

  it('while black on the last slide, next does not end', () => {
    const s = at(2, 3, { black: true })
    expect(reducePresenter(s, { type: 'next' })).toEqual(at(2))
  })

  it('goto clamps and clears black and ended', () => {
    const s = at(1, 3, { black: true, ended: true })
    expect(reducePresenter(s, { type: 'goto', index: 99 })).toEqual(at(2))
    expect(reducePresenter(s, { type: 'goto', index: -3 })).toEqual(at(0))
  })

  it('first and last clear black and ended', () => {
    const s = at(1, 3, { black: true, ended: true })
    expect(reducePresenter(s, { type: 'first' })).toEqual(at(0))
    expect(reducePresenter(s, { type: 'last' })).toEqual(at(2))
  })

  it('toggleBlack flips black', () => {
    const on = reducePresenter(at(1), { type: 'toggleBlack' })
    expect(on.black).toBe(true)
    expect(reducePresenter(on, { type: 'toggleBlack' }).black).toBe(false)
  })

  it('leaves an empty deck unchanged for every action', () => {
    const empty = initialPresenterState(0, 0)
    const actions: PresenterAction[] = [
      { type: 'next' },
      { type: 'prev' },
      { type: 'first' },
      { type: 'last' },
      { type: 'goto', index: 4 },
      { type: 'toggleBlack' },
    ]
    for (const a of actions) expect(reducePresenter(empty, a)).toEqual(empty)
  })
})

describe('jump buffer', () => {
  it('builds a number from digits and commits to a 0-based index', () => {
    const buf = typeDigit(typeDigit(null, '1', 0), '2', 500)
    expect(commitJump(buf, 900)).toBe(11)
  })

  it('commits null once the buffer has expired', () => {
    const buf = typeDigit(null, '3', 0)
    expect(commitJump(buf, JUMP_TIMEOUT_MS + 1)).toBeNull()
    expect(commitJump(buf, JUMP_TIMEOUT_MS)).toBe(2)
  })

  it('commits null for no buffer', () => {
    expect(commitJump(null, 0)).toBeNull()
  })

  it('restarts with only the new digit when the old buffer expired', () => {
    const buf = typeDigit(typeDigit(null, '1', 0), '4', 2500)
    expect(buf).toEqual({ digits: '4', at: 2500 })
    expect(commitJump(buf, 2600)).toBe(3)
  })

  it('"0" commits to -1, which goto clamps to the first slide', () => {
    const target = commitJump(typeDigit(null, '0', 0), 100)
    expect(target).toBe(-1)
    const s = reducePresenter(at(2), { type: 'goto', index: target as number })
    expect(s.index).toBe(0)
  })
})
