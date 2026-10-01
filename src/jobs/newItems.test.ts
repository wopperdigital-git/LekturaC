// src/jobs/newItems.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Stubbed like briefDrafts.test.ts: the real auth store reaches for Supabase at module load.
vi.mock('@/store/authStore', () => {
  let state: { user: { id: string } | null } = { user: null }
  const listeners = new Set<(s: typeof state) => void>()
  return {
    useAuthStore: {
      getState: () => state,
      setState: (partial: Partial<typeof state>) => {
        state = { ...state, ...partial }
        listeners.forEach((fn) => fn(state))
      },
      subscribe: (fn: (s: typeof state) => void) => {
        listeners.add(fn)
        return () => listeners.delete(fn)
      },
    },
  }
})

const store = new Map<string, string>()
const workingStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
}
vi.stubGlobal('localStorage', workingStorage)

const { useAuthStore } = (await import('@/store/authStore')) as unknown as {
  useAuthStore: { setState: (p: { user: { id: string } | null }) => void }
}
const { markNew, clearNew, clearDeck, newItemsFor } = await import('./newItems')

describe('newItems', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', workingStorage)
    // A user change invalidates the module's cache (real behaviour), so each test starts clean.
    useAuthStore.setState({ user: null })
    store.clear()
    useAuthStore.setState({ user: { id: 'u1' } })
  })

  it('records kinds per deck under a user-namespaced key', () => {
    markNew('d1', 'quiz')
    markNew('d1', 'video')
    markNew('d1', 'quiz')
    expect(newItemsFor('d1')).toEqual(['quiz', 'video'])
    expect([...store.keys()]).toEqual(['lekturac:new-items:u1'])
  })

  it('clears one kind, and drops the deck when none remain', () => {
    markNew('d1', 'quiz')
    markNew('d1', 'deck')
    clearNew('d1', 'quiz')
    expect(newItemsFor('d1')).toEqual(['deck'])
    clearNew('d1', 'deck')
    expect(newItemsFor('d1')).toEqual([])
    expect(JSON.parse(store.get('lekturac:new-items:u1')!)).toEqual({})
  })

  it('clearDeck removes every kind', () => {
    markNew('d1', 'quiz')
    markNew('d1', 'video')
    clearDeck('d1')
    expect(newItemsFor('d1')).toEqual([])
  })

  it("never shows another user's items and never writes without a user", () => {
    markNew('d1', 'quiz')
    useAuthStore.setState({ user: { id: 'u2' } })
    expect(newItemsFor('d1')).toEqual([])
    useAuthStore.setState({ user: null })
    markNew('d2', 'deck')
    expect(newItemsFor('d2')).toEqual([])
    expect([...store.keys()]).toEqual(['lekturac:new-items:u1'])
  })

  it('returns the same array while nothing changed (stable snapshot)', () => {
    markNew('d1', 'quiz')
    expect(newItemsFor('d1')).toBe(newItemsFor('d1'))
  })

  it('survives storage that throws', () => {
    const throwing = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
      removeItem: () => {},
    }
    vi.stubGlobal('localStorage', throwing)
    try {
      expect(() => markNew('d1', 'quiz')).not.toThrow()
      expect(newItemsFor('d9')).toEqual([])
    } finally {
      vi.stubGlobal('localStorage', workingStorage)
    }
  })
})
