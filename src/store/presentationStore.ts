import { create } from 'zustand'
import { ensureSession, supabase, supabaseConfigured } from '@/lib/supabaseClient'
import { DEFAULT_THEME, resolveTheme, type ThemeTokens } from '@/lib/theme-tokens'
import { EMPTY_TEXT_STYLE, parseTextStyle, type TextStyle } from '@/engine/textStyle'
import { applyMark, hasMarkThroughout, shiftMarks, type Mark, type MarkType, type TextRange } from '@/engine/marks'
import { setBlockFieldText, blockFieldText, parseTextRef } from '@/engine/blockText'
import type { Card, ContentBlock, LayoutType, VisualStyle } from '@/engine/contentBlocks'
import { inOrder, withoutCard } from './cardMutations'

export interface DeckSummary {
  id: string
  title: string
  updatedAt: string
}

interface PresentationState {
  presentationId: string | null
  title: string
  theme: ThemeTokens
  textStyle: TextStyle
  cards: Card[]
  status: 'idle' | 'loading' | 'saving' | 'error'
  errorMessage: string | null
  persisted: boolean
  past: DeckSnapshot[]
  future: DeckSnapshot[]

  listDecks: () => Promise<DeckSummary[]>
  createDeck: (title?: string) => Promise<string>
  createDeckFromGeneration: (
    deck: { title: string; cards: { blocks: ContentBlock[]; visualStyle: VisualStyle }[] },
  ) => Promise<string>
  loadDeck: (id: string) => Promise<void>
  deleteDeck: (id: string) => Promise<void>

  setTitle: (title: string) => void
  setTheme: (theme: ThemeTokens) => void
  /** Merges a partial deck-wide text override; pass `null` for a field to clear it back to the theme's own value. */
  setTextStyle: (patch: Partial<Record<keyof TextStyle, TextStyle[keyof TextStyle] | null>>) => void
  /** Same merge semantics as `setTextStyle`, scoped to one card (toolbar Level 2). */
  setCardTextStyle: (
    cardId: string,
    patch: Partial<Record<keyof TextStyle, TextStyle[keyof TextStyle] | null>>,
  ) => void
  /**
   * Picks one layout variety for a card: the component that renders it and the
   * treatment it renders in. `layout: 'auto'` hands the card back to the
   * classifier, leaving the treatment alone.
   */
  setCardVariety: (cardId: string, layout: LayoutType, visualStyle?: VisualStyle) => void

  /** Level 3: replaces one run of a card's text, keeping its marks on the same characters. */
  setBlockText: (cardId: string, ref: string, nextText: string) => void
  /** Level 3: toggles bold/italic over a character range within one run. */
  toggleTextMark: (cardId: string, ref: string, range: TextRange, type: MarkType) => void
  /** Level 3: font/size/alignment for one whole run of text. */
  setInlineStyle: (
    cardId: string,
    ref: string,
    patch: Partial<Record<keyof TextStyle, TextStyle[keyof TextStyle] | null>>,
  ) => void

  deleteCard: (cardId: string) => void
  reorderCards: (orderedIds: string[]) => void

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

/*
  Drops every pending debounced write.

  Undo/redo must call this before persisting the snapshot they restore.
  Without it the write being undone is still sitting on a 500ms timer while
  undo writes immediately, so the *older* value lands last and wins: the user
  sees the undo take effect on screen, then a reload brings the undone change
  straight back. Cancelling is safe precisely because the snapshot write that
  follows covers every field those timers were going to touch.
*/
function cancelScheduledSaves() {
  for (const timer of saveTimers.values()) clearTimeout(timer)
  saveTimers.clear()
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

async function persistCardPatch(cardId: string, patch: Record<string, unknown>) {
  if (!supabaseConfigured || !supabase) return
  await ensureSession()
  const { error } = await supabase.from('cards').update(patch).eq('id', cardId)
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
    text_style: card.textStyle ?? {},
    inline: card.inline ?? {},
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

/** A deck's content, with no store state attached. */
export interface DeckContent {
  title: string
  theme: ThemeTokens
  textStyle: TextStyle
  cards: Card[]
}

/**
 * Reads one deck straight from Supabase, without touching store state.
 *
 * Split out of `loadDeck` so the dashboard can export a deck it has not
 * opened. Calling `loadDeck` there would overwrite the deck the user is
 * currently editing — this store holds exactly one.
 *
 * Returns `null` when Supabase is not configured, which is the case `loadDeck`
 * handles by leaving whatever is in memory alone.
 */
export async function fetchDeck(id: string): Promise<DeckContent | null> {
  if (!supabaseConfigured || !supabase) return null
  await ensureSession()

  const [{ data: pres, error: presErr }, { data: cardRows, error: cardsErr }] = await Promise.all([
    supabase.from('presentations').select('*').eq('id', id).single(),
    supabase.from('cards').select('*').eq('presentation_id', id).order('order_index'),
  ])
  if (presErr) throw presErr
  if (cardsErr) throw cardsErr

  return {
    title: pres.title,
    // Resolved by id rather than used as-is: a deck saved before a theme
    // redesign carries that older shape. See `resolveTheme`.
    theme: resolveTheme(pres.theme),
    textStyle: parseTextStyle(pres.text_style),
    cards: (cardRows ?? []).map((row) => ({
      id: row.id,
      orderIndex: row.order_index,
      blocks: row.blocks as ContentBlock[],
      layout: row.layout as LayoutType,
      visualStyle: (row.visual_style as VisualStyle | null) ?? 'structured',
      textStyle: parseTextStyle(row.text_style),
      inline: (row.inline as Card['inline']) ?? undefined,
    })),
  }
}

type Getter = () => PresentationState

/*
  History is snapshot-based over the whole editable deck, not a list of inverse
  operations: every action then needs no bespoke undo of its own, and a redo is
  the same machinery run backwards.

  The snapshot covers *everything a user can change* — title, theme, deck text
  style, and the cards (which carry their own layout, visual style and text
  style). It used to hold only `cards`, which meant Ctrl+Z silently did nothing
  after a theme swap or a toolbar toggle, and worse, could jump back past them
  to undo a card deletion the user had stopped thinking about. Snapshots are
  small — cards are capped at MAX_SLIDES — so the memory cost is nil next to
  the branching that per-action inverses would need.
*/
interface DeckSnapshot {
  title: string
  theme: ThemeTokens
  textStyle: TextStyle
  cards: Card[]
}

function snapshotOf(get: Getter): DeckSnapshot {
  const { title, theme, textStyle, cards } = get()
  return { title, theme, textStyle, cards }
}

/*
  Consecutive edits sharing a coalesce key collapse into one history entry when
  they land inside this window. Typing a title would otherwise push a snapshot
  per keystroke and make Ctrl+Z a character-by-character rubout instead of an
  undo of "renaming the deck".
*/
const COALESCE_WINDOW_MS = 700
let lastPush: { key: string; at: number } | null = null

function pushHistory(set: StatusSetter, get: Getter, coalesceKey?: string) {
  if (coalesceKey && lastPush && lastPush.key === coalesceKey) {
    if (Date.now() - lastPush.at < COALESCE_WINDOW_MS) {
      // Refresh the clock so a continuous burst keeps collapsing rather than
      // breaking into a new entry every window-length.
      lastPush.at = Date.now()
      return
    }
  }
  lastPush = coalesceKey ? { key: coalesceKey, at: Date.now() } : null
  set({ past: [...get().past, snapshotOf(get)].slice(-MAX_HISTORY), future: [] })
}

/** Writes a restored snapshot back to Supabase — every field it covers, since any of them may differ. */
async function persistSnapshot(id: string, previousCards: Card[], snapshot: DeckSnapshot) {
  await persistPresentationPatch(id, {
    title: snapshot.title,
    theme: snapshot.theme,
    text_style: snapshot.textStyle,
  })
  await persistCardsSync(id, previousCards, snapshot.cards)
}

export const usePresentationStore = create<PresentationState>((set, get) => ({
  presentationId: null,
  title: 'Untitled',
  theme: DEFAULT_THEME,
  textStyle: EMPTY_TEXT_STYLE,
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
    set({ presentationId: id, title, theme: DEFAULT_THEME, textStyle: EMPTY_TEXT_STYLE, cards: [], status: 'idle', errorMessage: null, past: [], future: [] })
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

    set({ presentationId: id, title: deck.title, theme: DEFAULT_THEME, textStyle: EMPTY_TEXT_STYLE, cards, status: 'idle', errorMessage: null, past: [], future: [] })
    return id
  },

  async loadDeck(id: string) {
    set({ status: 'loading', errorMessage: null })
    try {
      const deck = await fetchDeck(id)
      if (!deck) {
        // Supabase not configured: nothing to load, keep whatever is in memory.
        set({ status: 'idle' })
        return
      }
      set({
        presentationId: id,
        title: deck.title,
        theme: deck.theme,
        textStyle: deck.textStyle,
        cards: deck.cards,
        status: 'idle',
        past: [],
        future: [],
      })
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
    pushHistory(set, get, 'title')
    set({ title })
    const id = get().presentationId
    if (id) {
      scheduleSave('title', () =>
        runSave(set, () => persistPresentationPatch(id, { title })),
      )
    }
  },

  setTheme(theme) {
    pushHistory(set, get)
    set({ theme })
    const id = get().presentationId
    if (id) {
      scheduleSave('theme', () =>
        runSave(set, () => persistPresentationPatch(id, { theme })),
      )
    }
  },

  setTextStyle(patch) {
    // `null` clears a field rather than storing null: an absent key is what
    // "inherit the theme" means on the wire (see engine/textStyle.ts), so a
    // stored null would be a second encoding of the same state.
    // Coalesced per field: holding the font-size stepper is one intent, but
    // bold-then-italic are two and must undo separately.
    pushHistory(set, get, `deckTextStyle:${Object.keys(patch).join(',')}`)
    const next: TextStyle = { ...get().textStyle }
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === undefined) delete next[key as keyof TextStyle]
      else Object.assign(next, { [key]: value })
    }
    set({ textStyle: next })

    const id = get().presentationId
    if (id) {
      scheduleSave('textStyle', () =>
        runSave(set, () => persistPresentationPatch(id, { text_style: next })),
      )
    }
  },

  setCardTextStyle(cardId, patch) {
    const card = get().cards.find((c) => c.id === cardId)
    if (!card) return

    pushHistory(set, get, `cardTextStyle:${cardId}:${Object.keys(patch).join(',')}`)
    const next: TextStyle = { ...(card.textStyle ?? {}) }
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === undefined) delete next[key as keyof TextStyle]
      else Object.assign(next, { [key]: value })
    }

    const cards = get().cards.map((c) => (c.id === cardId ? { ...c, textStyle: next } : c))
    set({ cards })

    const id = get().presentationId
    if (id) {
      // Keyed per card, so styling two cards in quick succession doesn't have
      // the second one's timer cancel the first one's save.
      scheduleSave(`cardTextStyle:${cardId}`, () =>
        runSave(set, () => persistCardPatch(cardId, { text_style: next })),
      )
    }
  },

  setBlockText(cardId, ref, nextText) {
    const card = get().cards.find((c) => c.id === cardId)
    if (!card) return
    const parsed = parseTextRef(ref)
    if (!parsed) return
    const current = blockFieldText(card.blocks, parsed)
    if (current === null || current === nextText) return

    // Coalesced: typing is one intent, so a burst of keystrokes undoes as a
    // single edit rather than character by character.
    pushHistory(set, get, `blockText:${cardId}:${ref}`)

    const blocks = setBlockFieldText(card.blocks, parsed, nextText)

    /*
      Marks are character offsets into this run, so they have to move with the
      edit or they drift onto the wrong characters. The exact edit isn't known
      here (contentEditable reports the whole new string), so the common prefix
      and suffix are used to derive the smallest change that explains it.
    */
    const existing = card.inline?.[ref]
    let inline = card.inline
    if (existing?.marks?.length) {
      let prefix = 0
      while (prefix < current.length && prefix < nextText.length && current[prefix] === nextText[prefix]) prefix++
      let suffix = 0
      while (
        suffix < current.length - prefix &&
        suffix < nextText.length - prefix &&
        current[current.length - 1 - suffix] === nextText[nextText.length - 1 - suffix]
      ) {
        suffix++
      }
      const removed = current.length - prefix - suffix
      const inserted = nextText.length - prefix - suffix
      inline = {
        ...card.inline,
        [ref]: { ...existing, marks: shiftMarks(existing.marks, prefix, removed, inserted) },
      }
    }

    set({ cards: get().cards.map((c) => (c.id === cardId ? { ...c, blocks, inline } : c)) })

    const id = get().presentationId
    if (id) {
      scheduleSave(`blockText:${cardId}`, () =>
        runSave(set, () => persistCardPatch(cardId, { blocks, inline: inline ?? {} })),
      )
    }
  },

  toggleTextMark(cardId, ref, range, type) {
    const card = get().cards.find((c) => c.id === cardId)
    if (!card || range.end <= range.start) return

    pushHistory(set, get)
    const entry = card.inline?.[ref] ?? {}
    const marks: Mark[] = entry.marks ?? []
    // Fully-marked selections clear; partially-marked ones fill in, which is
    // what every editor does and avoids inverting run by run.
    const on = !hasMarkThroughout(marks, range, type)
    const inline = { ...card.inline, [ref]: { ...entry, marks: applyMark(marks, range, type, on) } }

    set({ cards: get().cards.map((c) => (c.id === cardId ? { ...c, inline } : c)) })

    const id = get().presentationId
    if (id) {
      scheduleSave(`inline:${cardId}`, () =>
        runSave(set, () => persistCardPatch(cardId, { inline })),
      )
    }
  },

  setInlineStyle(cardId, ref, patch) {
    const card = get().cards.find((c) => c.id === cardId)
    if (!card) return

    pushHistory(set, get, `inlineStyle:${cardId}:${ref}:${Object.keys(patch).join(',')}`)
    const entry = card.inline?.[ref] ?? {}
    const style: TextStyle = { ...(entry.style ?? {}) }
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === undefined) delete style[key as keyof TextStyle]
      else Object.assign(style, { [key]: value })
    }
    const inline = { ...card.inline, [ref]: { ...entry, style } }

    set({ cards: get().cards.map((c) => (c.id === cardId ? { ...c, inline } : c)) })

    const id = get().presentationId
    if (id) {
      scheduleSave(`inline:${cardId}`, () =>
        runSave(set, () => persistCardPatch(cardId, { inline })),
      )
    }
  },

  setCardVariety(cardId, layout, visualStyle) {
    const card = get().cards.find((c) => c.id === cardId)
    if (!card) return
    if (card.layout === layout && (visualStyle === undefined || card.visualStyle === visualStyle)) return

    pushHistory(set, get)
    const nextStyle = visualStyle ?? card.visualStyle
    set({
      cards: get().cards.map((c) =>
        c.id === cardId ? { ...c, layout, visualStyle: nextStyle } : c,
      ),
    })
    // Structural rather than cosmetic, and cheap — persisted immediately, like
    // card delete/reorder, instead of going through the debounce.
    void runSave(set, () =>
      persistCardPatch(cardId, { layout, visual_style: nextStyle }),
    )
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

  undo() {
    const { past, future, cards, presentationId } = get()
    const restored = past[past.length - 1]
    if (!restored) return
    // Any in-flight coalescing ends here: the next edit must start a fresh
    // entry rather than merging into the one just undone.
    lastPush = null
    // Must precede the snapshot write — see cancelScheduledSaves.
    cancelScheduledSaves()
    const current = snapshotOf(get)
    set({ ...restored, past: past.slice(0, -1), future: [current, ...future].slice(0, MAX_HISTORY) })
    if (presentationId) {
      void runSave(set, () => persistSnapshot(presentationId, cards, restored))
    }
  },

  redo() {
    const { past, future, cards, presentationId } = get()
    const restored = future[0]
    if (!restored) return
    lastPush = null
    cancelScheduledSaves()
    const current = snapshotOf(get)
    set({ ...restored, past: [...past, current].slice(-MAX_HISTORY), future: future.slice(1) })
    if (presentationId) {
      void runSave(set, () => persistSnapshot(presentationId, cards, restored))
    }
  },

}))
