import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Card } from '@/engine/contentBlocks'

/*
  What opening a deck that cannot be read leaves behind. A load failure is not a
  save failure: it must not raise the "Not saved" banner (whose advice, "reloading
  will lose your changes", is the opposite of the fix), and it must not leave the
  previously open deck on screen under the new deck's address.
*/

let presentationsReply: { data: unknown; error: unknown } = { data: null, error: null }

vi.mock('@/lib/supabaseClient', () => ({
  supabaseConfigured: true,
  ensureSession: () => Promise.resolve(),
  supabase: {
    from(table: 'presentations' | 'cards') {
      return {
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve(table === 'presentations' ? presentationsReply : { data: null, error: null }),
            order: () =>
              Promise.resolve({
                data: [
                  {
                    id: 'b-card',
                    order_index: 0,
                    blocks: [{ type: 'heading', text: 'Deck B' }],
                    layout: 'auto',
                    visual_style: 'structured',
                    text_style: {},
                    inline: {},
                    adjusts: {},
                  },
                ],
                error: null,
              }),
          }),
        }),
        update: () => ({ eq: () => Promise.resolve({ error: null }) }),
      }
    },
  },
}))

const { loadFailure, usePresentationStore } = await import('./presentationStore')

const deckACard: Card = {
  id: 'a-card',
  orderIndex: 0,
  blocks: [{ type: 'heading', text: 'Deck A' }],
  layout: 'auto',
  visualStyle: 'structured',
}

describe('loadFailure', () => {
  it("reads PostgREST's no-row reply as a missing deck", () => {
    expect(loadFailure({ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' })).toEqual({
      kind: 'missing',
      message: 'JSON object requested, multiple (or no) rows returned (PGRST116)',
    })
  })

  it('reads anything else as a failure to load, keeping the reason', () => {
    expect(loadFailure(new TypeError('Failed to fetch'))).toEqual({ kind: 'failed', message: 'Failed to fetch' })
  })
})

describe('loadDeck when the read fails', () => {
  beforeEach(() => {
    usePresentationStore.setState({
      presentationId: 'deck-a',
      title: 'Deck A',
      cards: [deckACard],
      status: 'idle',
      errorMessage: null,
      loadError: null,
    })
  })

  it('reports a load error, not a save error', async () => {
    presentationsReply = { data: null, error: { message: 'Failed to fetch' } }
    await usePresentationStore.getState().loadDeck('deck-b')
    const state = usePresentationStore.getState()
    // Tagged with the deck it is about, so opening another deck never shows it.
    expect(state.loadError).toEqual({ kind: 'failed', message: 'Failed to fetch', deckId: 'deck-b' })
    expect(state.status).not.toBe('error')
    expect(state.errorMessage).toBeNull()
  })

  it('does not leave the previous deck in place', async () => {
    presentationsReply = { data: null, error: { code: 'PGRST116', message: 'no rows' } }
    await usePresentationStore.getState().loadDeck('deck-b')
    const state = usePresentationStore.getState()
    expect(state.cards).toEqual([])
    expect(state.presentationId).toBeNull()
    expect(state.loadError?.kind).toBe('missing')
  })

  it('clears the load error when a retry succeeds', async () => {
    presentationsReply = { data: null, error: { message: 'Failed to fetch' } }
    await usePresentationStore.getState().loadDeck('deck-b')
    presentationsReply = {
      data: { id: 'deck-b', title: 'Deck B', theme: { id: 'minimal' }, text_style: {} },
      error: null,
    }
    await usePresentationStore.getState().loadDeck('deck-b')
    const state = usePresentationStore.getState()
    expect(state.loadError).toBeNull()
    expect(state.presentationId).toBe('deck-b')
    expect(state.cards.map((c) => c.id)).toEqual(['b-card'])
  })
})
