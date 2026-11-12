import { describe, expect, it } from 'vitest'
import { loadSession, restoreStartIndex, restoreState, saveSession, sessionKey, type SavedSession } from './session'

const saved: SavedSession = {
  index: 2,
  black: true,
  ended: false,
  stopwatch: { startedAt: 1000, accumulatedMs: 500 },
  targetMinutes: 20,
  startIndex: 1,
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
    // a session saved without its start slide reads as a fresh start
    const { startIndex: _omit, ...old } = saved
    s.setItem(sessionKey('s1'), JSON.stringify(old))
    expect(loadSession(s, 's1')).toBeNull()
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

describe('restoreStartIndex', () => {
  it('keeps a start slide that fits and clamps one that does not', () => {
    expect(restoreStartIndex({ ...saved, startIndex: 2 }, 4)).toBe(2)
    expect(restoreStartIndex({ ...saved, startIndex: 9 }, 4)).toBe(3)
    expect(restoreStartIndex({ ...saved, startIndex: -1 }, 4)).toBe(0)
  })
})
