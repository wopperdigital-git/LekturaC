import { create } from 'zustand'
import { ensureSession, supabase, supabaseConfigured } from '@/lib/supabaseClient'
import { DEFAULT_THEME, type ThemeTokens } from '@/lib/theme-tokens'
import type { Card, ContentBlock, LayoutType } from '@/engine/contentBlocks'

export interface DeckSummary {
  id: string
  title: string
  updatedAt: string
}

interface PresentationState {
  presentationId: string | null
  title: string
  theme: ThemeTokens
  cards: Card[]
  status: 'idle' | 'loading' | 'saving' | 'error'
  errorMessage: string | null
  persisted: boolean

  listDecks: () => Promise<DeckSummary[]>
  createDeck: (title?: string) => Promise<string>
  createDeckFromGeneration: (deck: { title: string; cards: { blocks: ContentBlock[] }[] }) => Promise<string>
  loadDeck: (id: string) => Promise<void>
  deleteDeck: (id: string) => Promise<void>

  setTitle: (title: string) => void
  setTheme: (theme: ThemeTokens) => void

  deleteCard: (cardId: string) => void
  reorderCards: (orderedIds: string[]) => void
}

function newId() {
  return crypto.randomUUID()
}

// Keyed per-field so scheduling one field's save (e.g. theme) doesn't cancel
// another field's pending save (e.g. title) that hasn't fired yet.
const saveTimers = new Map<string, ReturnType<typeof setTimeout>>()
function scheduleSave(key: string, fn: () => Promise<void>, delayMs = 500) {
  const existing = saveTimers.get(key)
  if (existing) clearTimeout(existing)
  saveTimers.set(
    key,
    setTimeout(() => {
      saveTimers.delete(key)
      void fn()
    }, delayMs),
  )
}

type StatusSetter = (partial: Partial<PresentationState>) => void

// Drives the status/errorMessage fields TopBar reads to show "Saving…" / "Save failed".
async function runSave(set: StatusSetter, persist: () => Promise<void>) {
  set({ status: 'saving' })
  try {
    await persist()
    set({ status: 'idle', errorMessage: null })
  } catch (err) {
    console.error('[presentationStore] save failed', err)
    set({ status: 'error', errorMessage: err instanceof Error ? err.message : String(err) })
  }
}

async function persistPresentationPatch(id: string, patch: Record<string, unknown>) {
  if (!supabaseConfigured || !supabase) return
  await ensureSession()
  const { error } = await supabase.from('presentations').update(patch).eq('id', id)
  if (error) throw error
}

async function persistCardDelete(cardId: string) {
  if (!supabaseConfigured || !supabase) return
  await ensureSession()
  const { error } = await supabase.from('cards').delete().eq('id', cardId)
  if (error) throw error
}

async function persistCardsReorder(presentationId: string, cards: Card[]) {
  if (!supabaseConfigured || !supabase) return
  await ensureSession()
  const { error } = await supabase.from('cards').upsert(
    cards.map((c) => ({
      id: c.id,
      presentation_id: presentationId,
      order_index: c.orderIndex,
      blocks: c.blocks,
      layout: c.layout,
    })),
  )
  if (error) throw error
}

export const usePresentationStore = create<PresentationState>((set, get) => ({
  presentationId: null,
  title: 'Untitled',
  theme: DEFAULT_THEME,
  cards: [],
  status: 'idle',
  errorMessage: null,
  persisted: supabaseConfigured,

  async listDecks() {
    if (!supabaseConfigured || !supabase) return []
    await ensureSession()
    const { data, error } = await supabase
      .from('presentations')
      .select('id, title, updated_at')
      .order('updated_at', { ascending: false })
    if (error) throw error
    return (data ?? []).map((row) => ({ id: row.id, title: row.title, updatedAt: row.updated_at }))
  },

  async createDeck(title = 'Untitled presentation') {
    const id = newId()
    if (supabaseConfigured && supabase) {
      await ensureSession()
      const { data: userData } = await supabase.auth.getUser()
      const { error } = await supabase.from('presentations').insert({
        id,
        owner_id: userData.user?.id,
        title,
        theme: DEFAULT_THEME,
      })
      if (error) throw error
    }
    set({ presentationId: id, title, theme: DEFAULT_THEME, cards: [], status: 'idle', errorMessage: null })
    return id
  },

  async createDeckFromGeneration(deck) {
    const id = newId()
    const cards: Card[] = deck.cards.map((c, i) => ({
      id: newId(),
      orderIndex: i,
      blocks: c.blocks,
      layout: 'auto',
    }))

    if (supabaseConfigured && supabase) {
      await ensureSession()
      const { data: userData } = await supabase.auth.getUser()
      const { error: presError } = await supabase.from('presentations').insert({
        id,
        owner_id: userData.user?.id,
        title: deck.title,
        theme: DEFAULT_THEME,
      })
      if (presError) throw presError

      const { error: cardsError } = await supabase.from('cards').insert(
        cards.map((c) => ({
          id: c.id,
          presentation_id: id,
          order_index: c.orderIndex,
          blocks: c.blocks,
          layout: c.layout,
        })),
      )
      if (cardsError) throw cardsError
    }

    set({ presentationId: id, title: deck.title, theme: DEFAULT_THEME, cards, status: 'idle', errorMessage: null })
    return id
  },

  async loadDeck(id: string) {
    set({ status: 'loading', errorMessage: null })
    try {
      if (supabaseConfigured && supabase) {
        await ensureSession()
        const [{ data: pres, error: presErr }, { data: cardRows, error: cardsErr }] = await Promise.all([
          supabase.from('presentations').select('*').eq('id', id).single(),
          supabase.from('cards').select('*').eq('presentation_id', id).order('order_index'),
        ])
        if (presErr) throw presErr
        if (cardsErr) throw cardsErr

        set({
          presentationId: id,
          title: pres.title,
          theme: (pres.theme as ThemeTokens) ?? DEFAULT_THEME,
          cards: (cardRows ?? []).map((row) => ({
            id: row.id,
            orderIndex: row.order_index,
            blocks: row.blocks as ContentBlock[],
            layout: row.layout as LayoutType,
          })),
          status: 'idle',
        })
      } else {
        // Supabase not configured: nothing to load, keep whatever is in memory.
        set({ status: 'idle' })
      }
    } catch (err) {
      set({ status: 'error', errorMessage: err instanceof Error ? err.message : String(err) })
    }
  },

  async deleteDeck(id: string) {
    if (!supabaseConfigured || !supabase) return
    await ensureSession()
    const { error } = await supabase.from('presentations').delete().eq('id', id)
    if (error) throw error
  },

  setTitle(title) {
    set({ title })
    const id = get().presentationId
    if (id) {
      scheduleSave('title', () =>
        runSave(set, () => persistPresentationPatch(id, { title })),
      )
    }
  },

  setTheme(theme) {
    set({ theme })
    const id = get().presentationId
    if (id) {
      scheduleSave('theme', () =>
        runSave(set, () => persistPresentationPatch(id, { theme })),
      )
    }
  },

  deleteCard(cardId) {
    set((s) => ({
      cards: s.cards
        .filter((c) => c.id !== cardId)
        .map((c, i) => ({ ...c, orderIndex: i })),
    }))
    void runSave(set, () => persistCardDelete(cardId))
  },

  reorderCards(orderedIds) {
    set((s) => {
      const byId = new Map(s.cards.map((c) => [c.id, c]))
      const reordered = orderedIds
        .map((id, i) => {
          const c = byId.get(id)
          return c ? { ...c, orderIndex: i } : null
        })
        .filter((c): c is Card => c !== null)
      return { cards: reordered }
    })
    const id = get().presentationId
    if (id) {
      void runSave(set, () => persistCardsReorder(id, get().cards))
    }
  },

}))
