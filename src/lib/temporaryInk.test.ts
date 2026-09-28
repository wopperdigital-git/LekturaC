import { describe, expect, it } from 'vitest'
import type { Stroke } from '@/engine/overlay'
import {
  MAX_TEMP_INK_CHARS,
  pruneTempInk,
  readTempInk,
  tempInkKey,
  writeTempInk,
  type KeyValueStore,
} from './temporaryInk'

const stroke = (id: string): Stroke => ({
  id,
  kind: 'stroke',
  tool: 'pen',
  color: 'accent',
  width: 0.007,
  points: [[0.1, 0.1], [0.2, 0.2]],
})

function memoryStore(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  const store: KeyValueStore = {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  }
  return { store, data }
}

const throwing: KeyValueStore = {
  getItem: () => {
    throw new Error('blocked')
  },
  setItem: () => {
    throw new Error('blocked')
  },
  removeItem: () => {
    throw new Error('blocked')
  },
}

describe('tempInkKey', () => {
  // signOut() clears only the Supabase session, so a shared key would hand one
  // account's annotations to the next one on the same browser.
  it('is namespaced by user and deck', () => {
    expect(tempInkKey('user-1', 'deck-1')).not.toBe(tempInkKey('user-2', 'deck-1'))
    expect(tempInkKey('user-1', 'deck-1')).not.toBe(tempInkKey('user-1', 'deck-2'))
  })

  it('has no key while the user is unknown — never an un-namespaced fallback', () => {
    expect(tempInkKey(null, 'deck-1')).toBeNull()
  })
})

describe('writeTempInk / readTempInk', () => {
  it('reads back what it wrote', () => {
    const { store } = memoryStore()
    const ink = { 'card-1': [stroke('a')] }
    expect(writeTempInk(store, 'u', 'd', ink)).toBe(true)
    expect(readTempInk(store, 'u', 'd')).toEqual(ink)
  })

  it('does not show one user the ink of another', () => {
    const { store } = memoryStore()
    writeTempInk(store, 'u1', 'd', { c: [stroke('a')] })
    expect(readTempInk(store, 'u2', 'd')).toEqual({})
  })

  it('reads nothing, and writes nothing, without a user', () => {
    const { store, data } = memoryStore()
    expect(writeTempInk(store, null, 'd', { c: [stroke('a')] })).toBe(false)
    expect(data.size).toBe(0)
    expect(readTempInk(store, null, 'd')).toEqual({})
  })

  it('removes the key when nothing is left, rather than storing an empty object', () => {
    const { store, data } = memoryStore()
    writeTempInk(store, 'u', 'd', { c: [stroke('a')] })
    expect(writeTempInk(store, 'u', 'd', {})).toBe(true)
    expect(data.size).toBe(0)
  })

  it('survives corrupt JSON and a wrong shape', () => {
    const key = tempInkKey('u', 'd') as string
    expect(readTempInk(memoryStore({ [key]: '{not json' }).store, 'u', 'd')).toEqual({})
    expect(readTempInk(memoryStore({ [key]: '[1,2]' }).store, 'u', 'd')).toEqual({})
    expect(readTempInk(memoryStore({ [key]: 'null' }).store, 'u', 'd')).toEqual({})
  })

  it('drops malformed strokes and empty cards on read, keeping the rest', () => {
    const key = tempInkKey('u', 'd') as string
    const raw = JSON.stringify({ good: [stroke('a'), { id: 'bad' }], empty: [{ id: 'bad' }], junk: 5 })
    expect(readTempInk(memoryStore({ [key]: raw }).store, 'u', 'd')).toEqual({ good: [stroke('a')] })
  })

  it('survives storage that throws (blocked storage: ink is simply not kept)', () => {
    expect(readTempInk(throwing, 'u', 'd')).toEqual({})
    expect(writeTempInk(throwing, 'u', 'd', { c: [stroke('a')] })).toBe(false)
  })

  it('refuses to write more than the size cap, so one deck cannot fill the quota', () => {
    const { store, data } = memoryStore()
    // Within the per-card stroke and point bounds, yet over the cap. Kept just
    // big enough: a far larger payload made this test slow enough to time out.
    const big = Array.from({ length: 40 }, (_, i) => ({
      ...stroke(`s${i}`),
      points: Array.from({ length: 1500 }, (_, j) => [j / 1500, 0.123456] as [number, number]),
    }))
    const ink: Record<string, Stroke[]> = { c0: big }
    expect(JSON.stringify(ink).length).toBeGreaterThan(MAX_TEMP_INK_CHARS)
    expect(writeTempInk(store, 'u', 'd', ink)).toBe(false)
    expect(data.size).toBe(0)
  })
})

describe('pruneTempInk', () => {
  it('drops ink for cards that no longer exist', () => {
    const ink = { keep: [stroke('a')], gone: [stroke('b')] }
    expect(pruneTempInk(ink, ['keep', 'other'])).toEqual({ keep: [stroke('a')] })
  })

  it('returns the same object when nothing was pruned', () => {
    const ink = { keep: [stroke('a')] }
    expect(pruneTempInk(ink, ['keep'])).toBe(ink)
  })
})
