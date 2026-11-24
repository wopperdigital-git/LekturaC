import { describe, expect, it } from 'vitest'
import type { Stroke } from '@/engine/overlay'
import { inkKey, loadInk, loadSession, restoreState, saveInk, saveSession, sessionKey, type SavedSession } from './session'

const saved: SavedSession = {
  index: 2,
  black: true,
  ended: false,
}

function memory() {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  }
}

describe('session storage', () => {
  it('namespaces the key', () => {
    expect(sessionKey('s1')).toBe('lekturac:presenter:s1')
  })

  it('saves then loads an equal object', () => {
    const s = memory()
    saveSession(s, 's1', saved)
    expect(loadSession(s, 's1')).toEqual(saved)
  })

  it('reads null when absent, null storage, throwing or malformed', () => {
    expect(loadSession(memory(), 's1')).toBeNull()
    expect(loadSession(null, 's1')).toBeNull()
    expect(
      loadSession({ getItem: () => { throw new Error('blocked') }, setItem: () => {} }, 's1'),
    ).toBeNull()
    const s = memory()
    s.setItem(sessionKey('s1'), '{nope')
    expect(loadSession(s, 's1')).toBeNull()
    s.setItem(sessionKey('s1'), JSON.stringify({ index: 'x' }))
    expect(loadSession(s, 's1')).toBeNull()
  })

  it('still reads a session saved with the old timer fields', () => {
    const s = memory()
    s.setItem(
      sessionKey('s1'),
      JSON.stringify({ ...saved, stopwatch: { startedAt: 1, accumulatedMs: 0 }, targetMinutes: 5, startIndex: 0 }),
    )
    expect(loadSession(s, 's1')).toEqual(saved)
  })

  it('does not throw when setItem throws or storage is null', () => {
    expect(() => saveSession(null, 's1', saved)).not.toThrow()
    expect(() =>
      saveSession({ getItem: () => null, setItem: () => { throw new Error('full') } }, 's1', saved),
    ).not.toThrow()
  })
})

describe('restoreState', () => {
  it('clamps the index and drops ended when clamped', () => {
    expect(restoreState({ ...saved, index: 9, ended: true }, 4)).toEqual({
      index: 3,
      count: 4,
      black: true,
      ended: false,
    })
  })

  it('keeps black and ended when the index fits', () => {
    expect(restoreState({ ...saved, index: 2, black: true }, 4)).toMatchObject({
      index: 2,
      black: true,
    })
    expect(restoreState({ ...saved, index: 3, ended: true }, 4).ended).toBe(true)
  })
})

describe('live ink storage', () => {
  const stroke: Stroke = { id: 'k1', kind: 'stroke', tool: 'pen', color: '#ef4444', width: 0.004, points: [[0.1, 0.1], [0.2, 0.2]] }

  it('keeps ink apart from the session state', () => {
    expect(inkKey('s1')).not.toBe(sessionKey('s1'))
  })

  it('saves then loads the ink', () => {
    const s = memory()
    saveInk(s, 's1', { a: [stroke] })
    expect(loadInk(s, 's1')).toEqual({ a: [stroke] })
  })

  it('reads no ink when absent, blocked, malformed or not strokes', () => {
    expect(loadInk(memory(), 's1')).toEqual({})
    expect(loadInk(null, 's1')).toEqual({})
    expect(loadInk({ getItem: () => { throw new Error('blocked') }, setItem: () => {} }, 's1')).toEqual({})
    const s = memory()
    s.setItem(inkKey('s1'), '{nope')
    expect(loadInk(s, 's1')).toEqual({})
    s.setItem(inkKey('s1'), JSON.stringify({ a: [{ id: 'x', kind: 'stroke', points: 'no' }] }))
    expect(loadInk(s, 's1')).toEqual({})
  })

  it('does not throw when storage refuses the write', () => {
    expect(() => saveInk({ getItem: () => null, setItem: () => { throw new Error('full') } }, 's1', { a: [stroke] })).not.toThrow()
  })
})
