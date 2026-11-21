import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createBookendsStore } from './bookendsStore'

function setup(opts: { writeResult?: boolean } = {}) {
  const calls: string[] = []
  const read = vi.fn(async (deckId: string) => {
    calls.push(`read:${deckId}`)
    return { intro: `i-${deckId}` }
  })
  const write = vi.fn(async (deckId: string, row: Record<string, string>) => {
    calls.push(`write:${deckId}:${JSON.stringify(row)}`)
    return opts.writeResult ?? true
  })
  const store = createBookendsStore({ read, write }, 500)
  return { store, read, write, calls }
}

describe('bookendsStore', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('load reads once and parses the row', async () => {
    const { store, read } = setup()
    await store.getState().load('a')
    expect(read).toHaveBeenCalledTimes(1)
    const s = store.getState()
    expect(s.deckId).toBe('a')
    expect(s.loaded).toBe(true)
    expect(s.bookends).toEqual({ intro: 'i-a', outro: null })
  })

  it('a second load of the same deck does not read again', async () => {
    const { store, read } = setup()
    await store.getState().load('a')
    await store.getState().load('a')
    expect(read).toHaveBeenCalledTimes(1)
  })

  it('three sets within the delay produce one write with the last value', async () => {
    const { store, write } = setup()
    await store.getState().load('a')
    store.getState().set({ intro: 'one' })
    store.getState().set({ intro: 'two' })
    store.getState().set({ intro: 'three' })
    expect(store.getState().bookends.intro).toBe('three')
    expect(write).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(500)
    expect(write).toHaveBeenCalledTimes(1)
    expect(write).toHaveBeenCalledWith('a', { intro: 'three' })
  })

  it('loading another deck writes the pending one first, then reads', async () => {
    const { store, calls } = setup()
    await store.getState().load('a')
    store.getState().set({ outro: 'bye' })
    await store.getState().load('b')
    expect(calls).toEqual(['read:a', 'write:a:{"intro":"i-a","outro":"bye"}', 'read:b'])
    expect(store.getState().deckId).toBe('b')
    expect(store.getState().bookends).toEqual({ intro: 'i-b', outro: null })
  })

  it('a failed write sets a warning and leaves bookends untouched', async () => {
    const { store } = setup({ writeResult: false })
    await store.getState().load('a')
    store.getState().set({ intro: 'x' })
    await store.getState().flush()
    expect(store.getState().warning).toBe('Your intro and outro could not be saved.')
    expect(store.getState().bookends.intro).toBe('x')
  })

  it('a successful write clears the warning', async () => {
    const { store, write } = setup({ writeResult: false })
    await store.getState().load('a')
    store.getState().set({ intro: 'x' })
    await store.getState().flush()
    write.mockResolvedValueOnce(true)
    store.getState().set({ intro: 'y' })
    await store.getState().flush()
    expect(store.getState().warning).toBeNull()
  })

  it('reset clears everything and cancels a pending write', async () => {
    const { store, write } = setup()
    await store.getState().load('a')
    store.getState().set({ intro: 'x' })
    store.getState().reset()
    await vi.advanceTimersByTimeAsync(1000)
    expect(write).not.toHaveBeenCalled()
    const s = store.getState()
    expect(s.deckId).toBeNull()
    expect(s.loaded).toBe(false)
    expect(s.warning).toBeNull()
    expect(s.bookends).toEqual({ intro: null, outro: null })
  })
})
