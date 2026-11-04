import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Card } from '@/engine/contentBlocks'
import type { Photo } from '@/images/types'

/*
  Replacing a photo rewrites one block and nothing else: every other block, the
  card's character marks and its nudges stay exactly as they were, so the
  formatting the user spent time on survives a change of picture. It is one undo
  step.

  Supabase is mocked to unconfigured so every persist path no-ops.
*/
vi.mock('@/lib/supabaseClient', () => ({
  supabaseConfigured: false,
  supabase: null,
  ensureSession: () => Promise.resolve(),
}))

const { usePresentationStore } = await import('./presentationStore')
const { DEFAULT_THEME } = await import('@/lib/theme-tokens')

const PHOTO: Photo = {
  url: 'https://images.pexels.com/photos/2/new.jpeg',
  alt: 'A new view',
  credit: { name: 'Bo Lens', url: 'https://www.pexels.com/@bo', source: 'pexels' },
}

const card = (): Card => ({
  id: 'a',
  orderIndex: 0,
  blocks: [
    { type: 'heading', text: 'Title' },
    { type: 'image', url: 'https://old.example/a.jpg', alt: 'Old', prompt: 'a lake' },
    { type: 'paragraph', text: 'Caption' },
  ],
  layout: 'imageFocus',
  visualStyle: 'structured',
  inline: { '0:text': { marks: [{ type: 'bold', start: 0, end: 2 }] } },
  adjusts: { '2': { dx: 0.1, dy: 0, rotation: 0 } },
})

function seed() {
  usePresentationStore.setState({
    presentationId: 'deck-1',
    title: 'Deck',
    theme: DEFAULT_THEME,
    textStyle: {},
    cards: [card()],
    past: [],
    future: [],
    status: 'idle',
    errorMessage: null,
  })
}

const state = () => usePresentationStore.getState()

describe('replaceImage', () => {
  beforeEach(seed)

  it('swaps the photo and its credit, keeping every other block, the marks and the nudges', () => {
    const before = card()
    state().replaceImage('a', 1, PHOTO)
    const after = state().cards[0]
    expect(after.blocks[1]).toEqual({
      type: 'image',
      url: PHOTO.url,
      alt: PHOTO.alt,
      prompt: 'a lake',
      credit: PHOTO.credit,
    })
    expect(after.blocks[0]).toEqual(before.blocks[0])
    expect(after.blocks[2]).toEqual(before.blocks[2])
    expect(after.inline).toEqual(before.inline)
    expect(after.adjusts).toEqual(before.adjusts)
    expect(after.layout).toBe('imageFocus')
  })

  it('is one undo step', () => {
    state().replaceImage('a', 1, PHOTO)
    expect(state().past).toHaveLength(1)
    state().undo()
    expect(state().cards[0]).toEqual(card())
  })

  it('does nothing, and records no history, when the block is not an image', () => {
    state().replaceImage('a', 0, PHOTO)
    state().replaceImage('a', 9, PHOTO)
    state().replaceImage('nope', 1, PHOTO)
    expect(state().cards[0]).toEqual(card())
    expect(state().past).toHaveLength(0)
  })
})

describe('addCard with a photo', () => {
  beforeEach(seed)

  it('creates an image slide from the picked photo', () => {
    const id = state().addCard('image', 'a', PHOTO)
    const created = state().cards.find((c) => c.id === id)!
    expect(created.layout).toBe('imageFocus')
    expect(created.blocks[1]).toMatchObject({ type: 'image', url: PHOTO.url, credit: PHOTO.credit })
  })
})
