import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabaseClient', () => ({
  supabaseConfigured: false,
  supabase: null,
  ensureSession: () => Promise.resolve(),
}))

const { insertGeneratedDeck, usePresentationStore } = await import('./presentationStore')
const { BUILTIN_THEMES } = await import('@/lib/theme-tokens')

describe('insertGeneratedDeck', () => {
  it('builds the cards without making the deck the open one', async () => {
    usePresentationStore.setState({ presentationId: 'open-deck', title: 'Open' })
    const { id, cards, theme } = await insertGeneratedDeck({
      title: 'New',
      cards: [{ blocks: [{ type: 'heading', text: 'Hi' }], visualStyle: 'structured', speakerNotes: 'Say hi' }],
    })
    expect(id).toBeTruthy()
    expect(cards).toHaveLength(1)
    expect(BUILTIN_THEMES).toContain(theme)
    expect(cards[0].narration).toEqual({ text: 'Say hi', generated: 'Say hi' })
    expect(usePresentationStore.getState().presentationId).toBe('open-deck')
  })
})
