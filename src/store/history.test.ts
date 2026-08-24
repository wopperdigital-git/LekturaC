import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Card } from '@/engine/contentBlocks'

/*
  Undo/redo is "universal": it covers every change a user can make to a deck,
  not just the card list. These tests are the guard on that claim — the
  regression they exist to catch is a new action being added to the store
  without a `pushHistory` call, which leaves Ctrl+Z silently skipping over it
  and undoing something the user had stopped thinking about.

  Supabase is mocked to unconfigured so every persist path no-ops: `.env` is
  loaded during tests, so without this the store would issue real network calls.
*/
vi.mock('@/lib/supabaseClient', () => ({
  supabaseConfigured: false,
  supabase: null,
  ensureSession: () => Promise.resolve(),
}))

const { usePresentationStore } = await import('./presentationStore')
const { BUILTIN_THEMES, DEFAULT_THEME } = await import('@/lib/theme-tokens')

const card = (id: string, orderIndex: number): Card => ({
  id,
  orderIndex,
  blocks: [{ type: 'heading', text: `Card ${id}` }],
  layout: 'auto',
  visualStyle: 'structured',
})

function seed(cards: Card[] = [card('a', 0), card('b', 1)]) {
  usePresentationStore.setState({
    presentationId: 'deck-1',
    title: 'Original title',
    theme: DEFAULT_THEME,
    textStyle: {},
    cards,
    past: [],
    future: [],
    status: 'idle',
    errorMessage: null,
  })
}

const state = () => usePresentationStore.getState()

describe('universal undo/redo', () => {
  beforeEach(() => {
    vi.useRealTimers()
    seed()
  })

  it('undoes a theme change', () => {
    const other = BUILTIN_THEMES.find((t) => t.id !== DEFAULT_THEME.id)!
    state().setTheme(other)
    expect(state().theme.id).toBe(other.id)

    state().undo()
    expect(state().theme.id).toBe(DEFAULT_THEME.id)

    state().redo()
    expect(state().theme.id).toBe(other.id)
  })

  it('undoes a deck-wide text style change', () => {
    state().setTextStyle({ bold: true })
    expect(state().textStyle.bold).toBe(true)

    state().undo()
    expect(state().textStyle.bold).toBeUndefined()

    state().redo()
    expect(state().textStyle.bold).toBe(true)
  })

  it('undoes a per-card text style change without touching other cards', () => {
    state().setCardTextStyle('a', { italic: true })
    expect(state().cards.find((c) => c.id === 'a')?.textStyle?.italic).toBe(true)

    state().undo()
    expect(state().cards.find((c) => c.id === 'a')?.textStyle?.italic).toBeUndefined()
    expect(state().cards.find((c) => c.id === 'b')?.textStyle).toBeUndefined()
  })

  it('undoes a layout variety change, restoring both layout and treatment', () => {
    state().setCardVariety('a', 'hero', 'expressive')
    expect(state().cards.find((c) => c.id === 'a')).toMatchObject({
      layout: 'hero',
      visualStyle: 'expressive',
    })

    state().undo()
    expect(state().cards.find((c) => c.id === 'a')).toMatchObject({
      layout: 'auto',
      visualStyle: 'structured',
    })
  })

  it('still undoes card deletion and reordering', () => {
    state().deleteCard('a')
    expect(state().cards.map((c) => c.id)).toEqual(['b'])
    state().undo()
    expect(state().cards.map((c) => c.id)).toEqual(['a', 'b'])

    state().reorderCards(['b', 'a'])
    expect(state().cards.map((c) => c.id)).toEqual(['b', 'a'])
    state().undo()
    expect(state().cards.map((c) => c.id)).toEqual(['a', 'b'])
  })

  it('unwinds a mixed sequence one action at a time, newest first', () => {
    const other = BUILTIN_THEMES.find((t) => t.id !== DEFAULT_THEME.id)!
    state().setTheme(other)
    state().setTextStyle({ bold: true })
    state().deleteCard('b')

    state().undo()
    expect(state().cards.map((c) => c.id)).toEqual(['a', 'b'])
    expect(state().textStyle.bold).toBe(true)

    state().undo()
    expect(state().textStyle.bold).toBeUndefined()
    expect(state().theme.id).toBe(other.id)

    state().undo()
    expect(state().theme.id).toBe(DEFAULT_THEME.id)
  })

  it('drops the redo branch once a new action is taken', () => {
    state().setTextStyle({ bold: true })
    state().undo()
    expect(state().future).toHaveLength(1)

    state().setTextStyle({ italic: true })
    expect(state().future).toHaveLength(0)
  })

  it('is a no-op at either end of the stack', () => {
    expect(() => state().undo()).not.toThrow()
    expect(state().cards.map((c) => c.id)).toEqual(['a', 'b'])
    expect(() => state().redo()).not.toThrow()
    expect(state().past).toHaveLength(0)
  })
})

describe('undo vs. pending debounced writes', () => {
  beforeEach(() => seed())

  it('cancels the debounced write of the action it is undoing', () => {
    /*
      The regression, caught in the browser as a deck whose bold survived an
      undo: field saves are debounced 500ms while undo persists immediately.
      Leave the timer running and the write being undone lands *after* undo's
      write and wins — the screen shows the undo, a reload brings the change
      back.

      Asserted on the pending-timer count rather than on network calls, because
      the timer is the mechanism: if one is still armed when undo returns, the
      stale write is going out no matter what the mock does.
    */
    vi.useFakeTimers()
    try {
      state().setTextStyle({ bold: true })
      expect(vi.getTimerCount()).toBeGreaterThan(0)

      state().undo()
      expect(vi.getTimerCount()).toBe(0)
      expect(state().textStyle.bold).toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })

  it('cancels a pending card write too, not just deck-level ones', () => {
    vi.useFakeTimers()
    try {
      state().setCardTextStyle('a', { bold: true })
      expect(vi.getTimerCount()).toBeGreaterThan(0)

      state().undo()
      expect(vi.getTimerCount()).toBe(0)
      expect(state().cards.find((c) => c.id === 'a')?.textStyle?.bold).toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })

  it('redo clears pending writes as well', () => {
    vi.useFakeTimers()
    try {
      state().setTextStyle({ bold: true })
      state().undo()
      state().setTextStyle({ italic: true })
      expect(vi.getTimerCount()).toBeGreaterThan(0)

      state().undo()
      state().redo()
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('history coalescing', () => {
  beforeEach(() => seed())

  it('collapses a burst of title keystrokes into one entry', () => {
    // Otherwise Ctrl+Z becomes a character-by-character rubout rather than an
    // undo of "renaming the deck".
    for (const t of ['N', 'Ne', 'New', 'New ', 'New t']) state().setTitle(t)
    expect(state().past).toHaveLength(1)

    state().undo()
    expect(state().title).toBe('Original title')
  })

  it('starts a new entry once the coalesce window has passed', () => {
    vi.useFakeTimers()
    try {
      state().setTitle('First')
      vi.advanceTimersByTime(1500)
      state().setTitle('Second')
      expect(state().past).toHaveLength(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not merge two different formatting toggles', () => {
    // Bold and italic are separate intents even in quick succession.
    state().setTextStyle({ bold: true })
    state().setTextStyle({ italic: true })
    expect(state().past).toHaveLength(2)
  })

  it('does not merge an edit that follows an undo', () => {
    state().setTitle('Renamed')
    state().undo()
    state().setTitle('Renamed again')
    expect(state().past).toHaveLength(1)
    expect(state().future).toHaveLength(0)
  })
})
