import { create } from 'zustand'
import { ensureSession, supabase, supabaseConfigured } from '@/lib/supabaseClient'
import { DEFAULT_THEME, type ThemeTokens } from '@/lib/theme-tokens'
import type { Card, ContentBlock, LayoutType, VisualStyle } from '@/engine/contentBlocks'
import { resolveLayout } from '@/engine/layoutEngine'
import { getTextAtPath, setTextAtPath } from '@/engine/blockText'
import {
  inOrder,
  withBlockRemoved,
  withBlockReplaced,
  withLayoutPinned,
  withoutCard,
} from './cardMutations'

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
  past: Card[][]
  future: Card[][]

  listDecks: () => Promise<DeckSummary[]>
  createDeck: (title?: string) => Promise<string>
  createDeckFromGeneration: (
    deck: { title: string; cards: { blocks: ContentBlock[]; visualStyle: VisualStyle }[] },
  ) => Promise<string>
  loadDeck: (id: string) => Promise<void>
  deleteDeck: (id: string) => Promise<void>

  setTitle: (title: string) => void
  setTheme: (theme: ThemeTokens) => void

  deleteCard: (cardId: string) => void
  reorderCards: (orderedIds: string[]) => void

  editBlockText: (cardId: string, blockIndex: number, path: string, text: string) => void
  deleteBlock: (cardId: string, blockIndex: number) => void
  undo: () => void
  redo: () => void
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

// Undo has to win against a debounced save that is still in flight: typing
// schedules a write 500ms out, and a ⌘Z 200ms later would otherwise be
// overwritten by that timer firing with the text the user just took back.
function cancelScheduledSaves(prefix: string) {
  for (const [key, timer] of saveTimers) {
    if (key.startsWith(prefix)) {
      clearTimeout(timer)
      saveTimers.delete(key)
    }
  }
}

const MAX_HISTORY = 50

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

function cardRow(presentationId: string, card: Card) {
  return {
    id: card.id,
    presentation_id: presentationId,
    order_index: card.orderIndex,
    blocks: card.blocks,
    layout: card.layout,
    visual_style: card.visualStyle,
  }
}

/**
 * Writes `next` as the card list, deleting rows that are no longer in it.
 *
 * Undo/redo can move in either direction across a card deletion, so a plain
 * upsert is not enough: redoing a delete has to remove the row again, and
 * undoing one has to bring it back (which the upsert does, since the id is
 * preserved). Diffing against `previous` is what makes both directions work
 * without a `deleted_at` column.
 */
async function persistCardsSync(presentationId: string, previous: Card[], next: Card[]) {
  if (!supabaseConfigured || !supabase) return
  await ensureSession()

  const nextIds = new Set(next.map((c) => c.id))
  const removed = previous.filter((c) => !nextIds.has(c.id)).map((c) => c.id)
  if (removed.length > 0) {
    const { error } = await supabase.from('cards').delete().in('id', removed)
    if (error) throw error
  }
  if (next.length > 0) {
    const { error } = await supabase.from('cards').upsert(next.map((c) => cardRow(presentationId, c)))
    if (error) throw error
  }
}

type Getter = () => PresentationState

/*
  History is snapshot-based over the whole `cards` array rather than a list of
  inverse operations: move/edit/delete/reorder then need no bespoke undo each,
  and a redo is the same machinery run backwards. Cards are small and capped at
  MAX_SLIDES, so the memory cost is nil next to the branching it removes.

  One entry per user action falls out of the UI contract rather than any
  coalescing logic here: inline editing keeps its text in the DOM and calls
  `editBlockText` once, when the edit is committed — never per keystroke.
*/
function pushHistory(set: StatusSetter, get: Getter) {
  set({ past: [...get().past, get().cards].slice(-MAX_HISTORY), future: [] })
}

export const usePresentationStore = create<PresentationState>((set, get) => ({
  presentationId: null,
  title: 'Untitled',
  theme: DEFAULT_THEME,
  cards: [],
  status: 'idle',
  errorMessage: null,
  persisted: supabaseConfigured,
  past: [],
  future: [],

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
      visualStyle: c.visualStyle,
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
          visual_style: c.visualStyle,
        })),
      )
      if (cardsError) throw cardsError
    }

    set({ presentationId: id, title: deck.title, theme: DEFAULT_THEME, cards, status: 'idle', errorMessage: null, past: [], future: [] })
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
            visualStyle: (row.visual_style as VisualStyle | null) ?? 'structured',
          })),
          status: 'idle',
          past: [],
          future: [],
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
    const previous = get().cards
    if (!previous.some((c) => c.id === cardId)) return
    pushHistory(set, get)
    set({ cards: withoutCard(previous, cardId) })
    const id = get().presentationId
    if (id) {
      void runSave(set, () => persistCardsSync(id, previous, get().cards))
    }
  },

  reorderCards(orderedIds) {
    const previous = get().cards
    pushHistory(set, get)
    set({ cards: inOrder(previous, orderedIds) })
    const id = get().presentationId
    if (id) {
      void runSave(set, () => persistCardsSync(id, previous, get().cards))
    }
  },

  editBlockText(cardId, blockIndex, path, text) {
    const previous = get().cards
    const block = previous.find((c) => c.id === cardId)?.blocks[blockIndex]
    if (!block) return

    const next = setTextAtPath(block, path, text)
    // A blank value or a path this block has no text at: keep what was there.
    if (!next) return
    // Committing an untouched field must not spend an undo step.
    if (getTextAtPath(block, path) === text.trim()) return

    pushHistory(set, get)
    set({ cards: withBlockReplaced(previous, cardId, blockIndex, next) })

    const id = get().presentationId
    if (id) {
      // Debounced: tabbing through several fields in a row is one write, and
      // the pending timer is what `cancelScheduledSaves` cancels on undo.
      scheduleSave('cards', () => runSave(set, () => persistCardsSync(id, get().cards, get().cards)))
    }
  },

  deleteBlock(cardId, blockIndex) {
    const previous = get().cards
    const index = previous.findIndex((c) => c.id === cardId)
    const card = previous[index]
    if (!card || blockIndex < 0 || blockIndex >= card.blocks.length) return

    pushHistory(set, get)
    // Pin the layout *before* the block list changes: chooseLayout classifies on
    // which block types a card holds, so an unpinned card can jump to a
    // different layout the moment one is removed.
    const resolved = resolveLayout(card.layout, card.blocks, { isFirstCard: index === 0 })
    set({ cards: withBlockRemoved(withLayoutPinned(previous, cardId, resolved), cardId, blockIndex) })

    const id = get().presentationId
    if (id) {
      void runSave(set, () => persistCardsSync(id, previous, get().cards))
    }
  },

  undo() {
    const { past, cards, future, presentationId } = get()
    const restored = past[past.length - 1]
    if (!restored) return
    cancelScheduledSaves('cards')
    set({ cards: restored, past: past.slice(0, -1), future: [cards, ...future].slice(0, MAX_HISTORY) })
    if (presentationId) {
      void runSave(set, () => persistCardsSync(presentationId, cards, restored))
    }
  },

  redo() {
    const { past, cards, future, presentationId } = get()
    const restored = future[0]
    if (!restored) return
    cancelScheduledSaves('cards')
    set({ cards: restored, past: [...past, cards].slice(-MAX_HISTORY), future: future.slice(1) })
    if (presentationId) {
      void runSave(set, () => persistCardsSync(presentationId, cards, restored))
    }
  },

}))
