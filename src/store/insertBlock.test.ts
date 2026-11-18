import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Card, ContentBlock } from '@/engine/contentBlocks'

/*
  Adding a row in the middle of a card: one undo step, every later block's marks, typography and
  nudges follow their own element, and removing the row again gives the card back exactly.

  Supabase is mocked to unconfigured so every persist path no-ops.
*/
vi.mock('@/lib/supabaseClient', () => ({
  supabaseConfigured: false,
  supabase: null,
  ensureSession: () => Promise.resolve(),
}))

const { usePresentationStore } = await import('./presentationStore')
const { DEFAULT_THEME } = await import('@/lib/theme-tokens')

const bold = { marks: [{ type: 'bold' as const, start: 0, end: 2 }] }
const nudge = (dx: number) => ({ dx, dy: 0, rotation: 0 })

const card = (): Card => ({
  id: 'a',
  orderIndex: 0,
  blocks: [
    { type: 'heading', text: 'Title' },
    { type: 'point', label: 'A', text: 'first' },
    { type: 'point', label: 'B', text: 'second' },
    { type: 'paragraph', text: 'after' },
    { type: 'quote', text: 'later' },
  ],
  layout: 'auto',
  visualStyle: 'structured',
  inline: { '3:text': bold, '3': { style: { align: 'center' } }, '4:text': bold },
  adjusts: { '3': nudge(0.1), '4': nudge(0.2) },
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
const ROW: ContentBlock = { type: 'point', label: 'Term', text: 'What it means' }

describe('insertBlockAfter', () => {
  beforeEach(seed)

  it('puts the row after the given block and returns its index', () => {
    expect(state().insertBlockAfter('a', 2, ROW)).toBe(3)
    expect(state().cards[0].blocks.map((b) => b.type)).toEqual(['heading', 'point', 'point', 'point', 'paragraph', 'quote'])
    expect(state().cards[0].blocks[3]).toEqual(ROW)
  })

  it('moves the marks, typography and nudges of every later block with it', () => {
    state().insertBlockAfter('a', 2, ROW)
    const after = state().cards[0]
    expect(Object.keys(after.inline ?? {}).sort()).toEqual(['4', '4:text', '5:text'])
    expect(after.inline?.['4']).toEqual({ style: { align: 'center' } })
    expect(after.adjusts).toEqual({ '4': nudge(0.1), '5': nudge(0.2) })
  })

  it('is one undo step that restores the card exactly', () => {
    state().insertBlockAfter('a', 2, ROW)
    expect(state().past).toHaveLength(1)
    state().undo()
    expect(state().cards[0]).toEqual(card())
  })

  it('is the inverse of removeBlock', () => {
    state().insertBlockAfter('a', 2, ROW)
    state().removeBlock('a', 3)
    expect(state().cards[0]).toEqual(card())
  })

  it('does nothing, and records no history, for an unknown card or an index out of range', () => {
    expect(state().insertBlockAfter('nope', 2, ROW)).toBeNull()
    expect(state().insertBlockAfter('a', 9, ROW)).toBeNull()
    expect(state().cards[0]).toEqual(card())
    expect(state().past).toHaveLength(0)
  })
})
