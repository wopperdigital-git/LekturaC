import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Card } from '@/engine/contentBlocks'

/*
  When a change reaches the database, and what is allowed to read a deck while
  one is still on its way there.

  The bug these exist to stop is a silent data loss, which is why they are worth
  a test in a suite this narrow: every element edit is debounced 500ms, and both
  the editor and the presenter call `loadDeck` on mount. Pressing Present just
  after aligning or dragging something therefore used to re-read the *pre-edit*
  row and overwrite the cards in memory — the presenter showed the old value,
  and the next edit was computed from the stale card, which could drop the first
  one for real.

  Supabase is mocked as *configured* here, unlike the other store tests: what is
  being checked is the order and timing of the calls, so they have to happen.
*/

const calls: string[] = []

const rows = {
  presentations: {
    id: 'deck-2',
    title: 'Other deck',
    theme: { id: 'minimal' },
    text_style: {},
  },
  cards: [
    {
      id: 'other-card',
      order_index: 0,
      blocks: [{ type: 'heading', text: 'From the database' }],
      layout: 'auto',
      visual_style: 'structured',
      text_style: {},
      inline: {},
      adjusts: {},
    },
  ],
}

vi.mock('@/lib/supabaseClient', () => ({
  supabaseConfigured: true,
  ensureSession: () => Promise.resolve(),
  supabase: {
    from(table: 'presentations' | 'cards') {
      return {
        select: () => ({
          eq: () => ({
            single: () => {
              calls.push(`read:${table}`)
              return Promise.resolve({ data: rows.presentations, error: null })
            },
            order: () => {
              calls.push(`read:${table}`)
              return Promise.resolve({ data: rows.cards, error: null })
            },
          }),
        }),
        update: (patch: Record<string, unknown>) => ({
          eq: () => {
            calls.push(`write:${Object.keys(patch).join(',')}`)
            return Promise.resolve({ error: null })
          },
        }),
      }
    },
  },
}))

const { usePresentationStore } = await import('./presentationStore')

const card: Card = {
  id: 'card-a',
  orderIndex: 0,
  blocks: [{ type: 'heading', text: 'In memory' }],
  layout: 'auto',
  visualStyle: 'structured',
}

beforeEach(() => {
  calls.length = 0
  vi.useFakeTimers()
  usePresentationStore.setState({
    presentationId: 'deck-1',
    cards: [card],
    past: [],
    future: [],
    status: 'idle',
  })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('loadDeck', () => {
  it('does not re-read the deck it already holds', async () => {
    await usePresentationStore.getState().loadDeck('deck-1')

    expect(calls).toEqual([])
    // The point of not reading: whatever is in memory survives.
    expect(usePresentationStore.getState().cards[0].id).toBe('card-a')
  })

  /*
    The stale-read guard is only half the fix. Opening a *different* deck is a
    legitimate read, and the edit still on a timer belongs to the deck being
    left — so it has to land first, or it is written against cards that are no
    longer in the store.
  */
  it('lands a pending write before reading a different deck', async () => {
    usePresentationStore.getState().setInlineStyle('card-a', '0', { align: 'right' })
    expect(calls).toEqual([])

    await usePresentationStore.getState().loadDeck('deck-2')

    /*
      `blocks` travels with `inline`, and that pairing is load-bearing rather
      than incidental: `fetchDeck` strips emphasis at the read boundary, so the
      card in memory can differ from its row. Writing the marks without the
      text they were computed against splits a conversion in half, and the next
      read freezes the result — asterisks on screen with the bold a character
      out. See `applyEmphasis`.
    */
    expect(calls[0]).toBe('write:inline,blocks')
    expect(calls.slice(1).every((c) => c.startsWith('read:'))).toBe(true)
    expect(usePresentationStore.getState().cards[0].id).toBe('other-card')
  })
})

describe('setBlockAdjust', () => {
  const adjust = { dx: 0.1, dy: 0.05, rotation: 0 }

  // A write is issued across a couple of microtasks (`ensureSession` first), so
  // the assertions have to let those run without moving any clock.
  const settle = () => vi.advanceTimersByTimeAsync(0)

  it('debounces while the gesture is still running', async () => {
    usePresentationStore.getState().setBlockAdjust('card-a', 0, adjust)

    // One row write per pointer event is what the debounce exists to prevent.
    await settle()
    expect(calls).toEqual([])

    await vi.advanceTimersByTimeAsync(500)
    expect(calls).toEqual(['write:adjusts'])
  })

  it('writes immediately once the gesture is released', async () => {
    usePresentationStore.getState().setBlockAdjust('card-a', 0, adjust, true)

    // No clock advanced: the released value must not sit in a window where a
    // reload or a jump to the presenter can lose it.
    await settle()
    expect(calls).toEqual(['write:adjusts'])
  })

  it('does not also write the value it superseded', async () => {
    usePresentationStore.getState().setBlockAdjust('card-a', 0, adjust)
    usePresentationStore.getState().setBlockAdjust('card-a', 0, adjust, true)

    await vi.advanceTimersByTimeAsync(1000)
    // The debounced copy is dropped, not left to land after the committed one.
    expect(calls).toEqual(['write:adjusts'])
  })
})
