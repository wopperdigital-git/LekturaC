import { create } from 'zustand'
import { ensureSession, supabase, supabaseConfigured } from '@/lib/supabaseClient'
import { DEFAULT_THEME, resolveTheme, type ThemeTokens } from '@/lib/theme-tokens'
import { EMPTY_TEXT_STYLE, parseTextStyle, type TextStyle } from '@/engine/textStyle'
import { applyMark, hasMarkThroughout, shiftMarks, type Mark, type MarkType, type TextRange } from '@/engine/marks'
import { setBlockFieldText, blockFieldText, parseTextRef } from '@/engine/blockText'
import type { Card, ContentBlock, LayoutType, VisualStyle } from '@/engine/contentBlocks'
import { isNeutral, parseAdjusts, type BlockAdjust } from '@/engine/blockAdjust'
import { applyEmphasis } from '@/engine/emphasis'
import { isResettable, mergeNarration, parseNarration, type GeneratedScript } from '@/engine/narration'
import {
  convertBlocks,
  layoutForKind,
  starterBlocks,
  type CreatableKind,
} from '@/engine/cardTemplates'
import { inOrder, withCardAfter, withoutCard } from './cardMutations'

export interface DeckSummary {
  id: string
  title: string
  updatedAt: string
  /**
   * The deck's own theme, and the card that opens it — enough for the
   * dashboard to draw the real first slide as the deck's cover.
   *
   * The cover is *rendered*, never a stored screenshot, for the same reason
   * the outline rail's thumbnails are: it can then never disagree with the
   * card, and a theme change shows up the next time the list is read rather
   * than needing an image regenerated.
   */
  theme: ThemeTokens
  /** Deck-level text overrides, merged with the cover card's own before rendering. */
  textStyle: TextStyle
  /** `null` for a deck with no cards yet — those fall back to a lettered swatch. */
  cover: Card | null
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
  /**
   * Moves, resizes or rotates one element: how far it sits from where the
   * layout put it, and what size it was given. `blockIndex` addresses
   * `card.blocks`.
   *
   * A nudge that comes back to neutral is deleted rather than stored as zeroes,
   * so an element dragged and then dragged back is indistinguishable from one
   * nobody touched — which matters, because the presence of an adjustment is
   * what routes the card down the export's per-element path.
   *
   * `commit` marks the end of a gesture: mid-drag calls are debounced into one
   * row write, the released one is written straight away.
   */
  setBlockAdjust: (
    cardId: string,
    blockIndex: number,
    adjust: BlockAdjust,
    commit?: boolean,
  ) => void

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

  /**
   * Adds a slide of the given type after `afterCardId`, or at the end when that
   * is `null`. Returns the new card's id, which the editor needs in order to
   * select it and scroll to it.
   *
   * The type decides the card's starter blocks and, for a title card, its
   * layout — see `engine/cardTemplates.ts`. Nothing here calls the AI: a card
   * arrives with placeholder text the user edits in place, which is the only
   * way to add a slide that does not reopen the "content is generated once"
   * question.
   */
  addCard: (kind: CreatableKind, afterCardId: string | null) => string
  /**
   * Reshapes one card into another type, keeping its words.
   *
   * Drops the card's `inline` and `adjusts` outright, and that is deliberate
   * rather than lazy: both are keyed by block index, and a reshape moves the
   * text to different indices — so a mark would land on the wrong characters
   * and a nudge on the wrong element. The alternative, remapping them, has no
   * correct answer when three paragraphs become one bullet list.
   */
  setCardKind: (cardId: string, kind: CreatableKind) => void
  deleteCard: (cardId: string) => void
  reorderCards: (orderedIds: string[]) => void

  /**
   * Replaces one slide's narration script, keeping the generated copy Reset
   * restores from.
   *
   * Debounced like any other typing: the script is a textarea, and a row write
   * per keystroke is what `scheduleSave` exists to absorb.
   */
  setNarrationText: (cardId: string, text: string) => void
  /** Puts the AI's version back after a hand edit. No-op if there is nothing to go back to. */
  resetNarration: (cardId: string) => void
  /**
   * Folds a whole generation's scripts into the deck.
   *
   * Structural, so it is written immediately rather than debounced, and pushes
   * exactly one undo entry for the whole batch. Slides the user has edited are
   * left alone by `mergeNarration` regardless of what the model returned.
   */
  applyGeneratedNarration: (scripts: GeneratedScript[]) => void

  undo: () => void
  redo: () => void
}

function newId() {
  return crypto.randomUUID()
}

// Keyed per-field so scheduling one field's save (e.g. theme) doesn't cancel
// another field's pending save (e.g. title) that hasn't fired yet.
const saveTimers = new Map<string, PendingSave>()

/** A debounced write, kept with its work so it can be run early as well as dropped. */
interface PendingSave {
  timer: ReturnType<typeof setTimeout>
  run: () => Promise<void>
}

function scheduleSave(key: string, fn: () => Promise<void>, delayMs = 500) {
  clearScheduledSave(key)
  saveTimers.set(key, {
    run: fn,
    timer: setTimeout(() => {
      saveTimers.delete(key)
      void fn()
    }, delayMs),
  })
}

/** Drops one pending write without running it — for a caller about to write the same field itself. */
function clearScheduledSave(key: string) {
  const pending = saveTimers.get(key)
  if (!pending) return
  clearTimeout(pending.timer)
  saveTimers.delete(key)
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
  for (const { timer } of saveTimers.values()) clearTimeout(timer)
  saveTimers.clear()
}

/*
  Runs every pending debounced write *now*, and waits for them.

  The counterpart to `cancelScheduledSaves`: that one exists because undo has to
  stop an older value landing last, this one because a *newer* value must not be
  left on a timer while something reads the row it was written from. An edit is
  in memory the moment it is made but only in the database 500ms later, so
  anything that re-reads a deck — or lets the tab go — has to close that gap
  first or it will read the value the user just replaced.

  Each `run` is already wrapped in `runSave`, which reports failure through the
  store's status rather than throwing, so a rejected write cannot take the
  others down with it.
*/
export async function flushScheduledSaves(): Promise<void> {
  const pending = [...saveTimers.values()]
  saveTimers.clear()
  for (const { timer } of pending) clearTimeout(timer)
  await Promise.all(pending.map(({ run }) => run()))
}

const MAX_HISTORY = 50

type StatusSetter = (partial: Partial<PresentationState>) => void

// Drives the status/errorMessage fields TopBar reads to show "Saving…" / "Save failed".
/**
 * A failed write, as a sentence a user can act on.
 *
 * `String(err)` was giving `[object Object]` for every database error, which is
 * the only kind this store actually produces: Supabase rejects a query with a
 * plain `{ message, details, hint, code }` object, not an `Error`. So the one
 * message that says *why* the deck did not save — a missing column, a policy
 * refusal — reached the user as nothing at all.
 *
 * `code` is kept because it is the part worth searching for (PGRST204 is a
 * column the schema cache does not have, i.e. a migration that has not been
 * run), and `hint` because PostgREST often puts the fix there.
 */
export function describeError(err: unknown): string {
  if (err instanceof Error) return err.message

  if (err && typeof err === 'object') {
    const e = err as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown }
    const parts = [e.message, e.details, e.hint].filter(
      (part): part is string => typeof part === 'string' && part.trim().length > 0,
    )
    if (parts.length > 0) {
      const text = parts.join(' — ')
      return typeof e.code === 'string' && e.code ? `${text} (${e.code})` : text
    }
    // An object with nothing readable on it is still better shown than hidden.
    try {
      return JSON.stringify(err)
    } catch {
      // Circular, so there is nothing to print — `String()` here is what
      // produced "[object Object]" in the first place. The raw value is on the
      // console either way (`runSave` logs it before this is ever read).
      return 'an error with no readable message — see the browser console'
    }
  }

  return String(err)
}

async function runSave(set: StatusSetter, persist: () => Promise<void>) {
  set({ status: 'saving' })
  try {
    await persist()
    set({ status: 'idle', errorMessage: null })
  } catch (err) {
    console.error('[presentationStore] save failed', err)
    set({ status: 'error', errorMessage: describeError(err) })
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
    adjusts: card.adjusts ?? {},
    narration: card.narration ?? {},
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
/** One `cards` row as Supabase hands it back, before it is a `Card`. */
type CardRow = Record<string, unknown>

/**
 * One stored card row as the app's `Card`.
 *
 * Shared by `fetchDeck` and `listDecks` rather than inlined in each: both are
 * read boundaries, and every older-shaped row is repaired here — the
 * `visual_style` default, `parseAdjusts` mapping an untouched `{}` back to
 * `undefined`, and the emphasis pass below.
 */
function cardFromRow(row: CardRow): Card {
  /*
    Emphasis is converted on the way *in*, not only at generation.

    A deck created before `applyEmphasis` existed has the model's literal
    `*asterisks*` sitting in its stored text, and content is never regenerated
    — so the read boundary is the only place they can be turned into real bold
    without a migration or a rewrite of rows the user has not touched. It is
    the same boundary `resolveTheme` and the `visual_style` default already use
    for exactly this kind of older-shaped row.

    The pass is idempotent and skips any run that already carries marks, so a
    newer deck (converted at creation) and a hand-formatted run both come back
    through it unchanged.
  */
  const converted = applyEmphasis(
    row.blocks as ContentBlock[],
    (row.inline as Card['inline']) ?? undefined,
  )
  return {
    id: row.id as string,
    orderIndex: row.order_index as number,
    blocks: converted.blocks,
    layout: row.layout as LayoutType,
    visualStyle: (row.visual_style as VisualStyle | null) ?? 'structured',
    textStyle: parseTextStyle(row.text_style),
    inline: converted.inline,
    adjusts: parseAdjusts(row.adjusts),
    narration: parseNarration(row.narration),
  }
}

/*
  Exported for `narrationRow.test.ts` only.

  The round-trip these two form is the part worth pinning: `cardRow` names every
  column on every upsert, and `cardFromRow` repairs every older-shaped row, so a
  field added to one and forgotten in the other fails silently rather than
  loudly.
*/
export const cardRowForTest = cardRow
export const cardFromRowForTest = cardFromRow

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
    cards: (cardRows ?? []).map(cardFromRow),
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
      .select('id, title, updated_at, theme, text_style')
      .order('updated_at', { ascending: false })
    if (error) throw error
    const rows = data ?? []
    if (rows.length === 0) return []

    /*
      The covers come back in one more query, not one per deck.

      The dashboard draws every deck's opening slide at once, so a per-deck
      read would be a round-trip per tile on the page that can least afford
      them. `order_index = 0` is a dependable "first card": both card mutations
      re-derive `orderIndex` from array position (`cardMutations.ts`), so the
      sequence can never have a hole at the front. A deck with no cards
      contributes no row and gets `cover: null`.

      RLS already scopes `cards` to the caller through its parent, so the
      `.in()` is about asking only for the decks in hand rather than about
      access — it keeps this honest if the list ever paginates.
    */
    const { data: coverRows, error: coversError } = await supabase
      .from('cards')
      .select('*')
      .in('presentation_id', rows.map((row) => row.id))
      .eq('order_index', 0)
    if (coversError) throw coversError
    const covers = new Map<string, Card>(
      (coverRows ?? []).map((row) => [row.presentation_id as string, cardFromRow(row)]),
    )

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      updatedAt: row.updated_at,
      // Resolved by id for the same reason `fetchDeck` does it: a deck saved
      // before a theme redesign carries the older shape, and the backdrop
      // would throw the moment it read a field that shape has no value for.
      theme: resolveTheme(row.theme),
      textStyle: parseTextStyle(row.text_style),
      cover: covers.get(row.id) ?? null,
    }))
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
    const cards: Card[] = deck.cards.map((c, i) => {
      // The one moment a deck's text is written, and so the only place the
      // model's `*asterisks*` can be turned into real bold without the stored
      // string and the drawn string disagreeing about character offsets.
      const { blocks, inline } = applyEmphasis(c.blocks)
      return {
        id: newId(),
        orderIndex: i,
        blocks,
        layout: 'auto',
        visualStyle: c.visualStyle,
        inline,
      }
    })

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
          // The emphasis converted above lives here. Without it the delimiters
          // are stripped from `blocks` on the way into the row while the marks
          // that replaced them are not, so the bold would be lost for good the
          // next time the deck was read. `adjusts` is deliberately still left
          // to its column default: a fresh card has none, and naming it here
          // would make deck creation fail outright on a project that has not
          // run migration 0006.
          inline: c.inline ?? {},
        })),
      )
      if (cardsError) throw cardsError
    }

    set({ presentationId: id, title: deck.title, theme: DEFAULT_THEME, textStyle: EMPTY_TEXT_STYLE, cards, status: 'idle', errorMessage: null, past: [], future: [] })
    return id
  },

  async loadDeck(id: string) {
    /*
      Already open: keep what is in memory instead of re-reading the row.

      Both the editor and the presenter call this on mount, and every element
      edit is debounced 500ms — so pressing Present straight after aligning or
      dragging something used to fetch the *pre-edit* row and overwrite the
      cards the user had just changed. The presenter then showed the old value
      while the write landed a moment later, and the next edit was computed from
      the stale card, which could drop the first one for real.

      Skipping is safe because this store holds exactly one deck: if its id is
      already loaded, the in-memory copy is the newest one that exists — the
      database is the thing catching up, not the other way round.
    */
    if (get().presentationId === id) {
      set({ status: 'idle', errorMessage: null })
      return
    }

    // Reading a *different* deck, so anything still on a timer belongs to the
    // one being left. Let it land before its cards are replaced.
    await flushScheduledSaves()

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
      set({ status: 'error', errorMessage: describeError(err) })
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
      /*
        `blocks` rides along, even though this action does not touch them.

        The card in memory is not always the card in the row: `fetchDeck` runs
        `applyEmphasis` at the read boundary, so a deck written before that
        existed has its delimiters stripped in memory while the row still holds
        them. Writing `inline` on its own would land the marks from that
        conversion beside the un-converted text and split the pair — the state
        that used to leave asterisks and misplaced bold on screen for good. The
        two halves are written together or not at all.
      */
      scheduleSave(`inline:${cardId}`, () =>
        runSave(set, () => persistCardPatch(cardId, { inline, blocks: card.blocks })),
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
      // `blocks` alongside `inline` for the same reason as `toggleTextMark`.
      scheduleSave(`inline:${cardId}`, () =>
        runSave(set, () => persistCardPatch(cardId, { inline, blocks: card.blocks })),
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

  setBlockAdjust(cardId, blockIndex, adjust, commit) {
    const card = get().cards.find((c) => c.id === cardId)
    if (!card) return

    /*
      Coalesced per element, which is what makes a drag one undo step rather
      than one per pointer event. `pushHistory` refreshes the window's clock on
      every coalesced call, so a continuous drag keeps collapsing however long
      it runs, and only a pause of COALESCE_WINDOW_MS starts a new entry.
    */
    pushHistory(set, get, `adjust:${cardId}:${blockIndex}`)

    const adjusts = { ...(card.adjusts ?? {}) }
    if (isNeutral(adjust)) delete adjusts[String(blockIndex)]
    else adjusts[String(blockIndex)] = adjust

    const next = Object.keys(adjusts).length > 0 ? adjusts : undefined
    set({ cards: get().cards.map((c) => (c.id === cardId ? { ...c, adjusts: next } : c)) })

    const id = get().presentationId
    if (id) {
      const key = `adjusts:${cardId}`
      const write = () => runSave(set, () => persistCardPatch(cardId, { adjusts: next ?? {} }))
      if (commit) {
        /*
          The gesture has been released, so this value is final: there is
          nothing left to coalesce, and holding it on a timer only widens the
          window where a reload or a tab close loses it. The pending write is
          dropped first so the debounced copy cannot land *after* this one.
        */
        clearScheduledSave(key)
        void write()
      } else {
        // Mid-drag: an adjustment per pointer event would be a row update per
        // pointer event. One write lands once the movement settles.
        scheduleSave(key, write)
      }
    }
  },

  addCard(kind, afterCardId) {
    const previous = get().cards
    pushHistory(set, get)

    const card: Card = {
      id: newId(),
      // Placeholder: `withCardAfter` re-derives every index from position, so
      // the value here is overwritten before it is ever read.
      orderIndex: 0,
      blocks: starterBlocks(kind),
      layout: layoutForKind(kind),
      visualStyle: 'structured',
    }
    set({ cards: withCardAfter(previous, afterCardId, card) })

    const id = get().presentationId
    if (id) {
      // Structural, like delete and reorder: written immediately rather than
      // debounced. `persistCardsSync` covers the shifted `order_index` of every
      // card after the insertion point as well as the new row itself.
      void runSave(set, () => persistCardsSync(id, previous, get().cards))
    }
    return card.id
  },

  setCardKind(cardId, kind) {
    const previous = get().cards
    const card = previous.find((c) => c.id === cardId)
    if (!card) return

    pushHistory(set, get)
    const blocks = convertBlocks(card.blocks, kind)
    const layout = layoutForKind(kind)
    /*
      `inline` and `adjusts` go, rather than being carried across.

      Both are keyed by block index. A reshape moves the text to different
      indices — three paragraphs becoming one bullet list, a stat pair becoming
      a quote — so a surviving mark would bold the wrong characters and a
      surviving nudge would displace the wrong element, silently and
      permanently. Undo puts them back if the conversion was a mistake.
    */
    const next: Card = { ...card, blocks, layout, inline: undefined, adjusts: undefined }
    set({ cards: previous.map((c) => (c.id === cardId ? next : c)) })

    const id = get().presentationId
    if (id) {
      // The debounced writes still pending for this card address the blocks it
      // had a moment ago; letting one land after this would restore the old
      // text or re-attach the marks just dropped.
      clearScheduledSave(`inline:${cardId}`)
      clearScheduledSave(`adjusts:${cardId}`)
      void runSave(set, () =>
        persistCardPatch(cardId, { blocks, layout, inline: {}, adjusts: {} }),
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

  setNarrationText(cardId, text) {
    const card = get().cards.find((c) => c.id === cardId)
    if (!card) return

    // Coalesced per card so a typed paragraph is one undo step, not one per
    // character — the same window `setTitle` uses.
    pushHistory(set, get, `narration:${cardId}`)
    const narration = { text, generated: card.narration?.generated }
    set({ cards: get().cards.map((c) => (c.id === cardId ? { ...c, narration } : c)) })

    const id = get().presentationId
    if (id) {
      scheduleSave(`narration:${cardId}`, () =>
        runSave(set, () => persistCardPatch(cardId, { narration })),
      )
    }
  },

  resetNarration(cardId) {
    const card = get().cards.find((c) => c.id === cardId)
    if (!card || !isResettable(card.narration)) return

    pushHistory(set, get)
    const narration = { text: card.narration!.generated!, generated: card.narration!.generated }
    set({ cards: get().cards.map((c) => (c.id === cardId ? { ...c, narration } : c)) })

    const id = get().presentationId
    if (id) {
      /*
        A discrete click, not a keystroke: the value is final the moment it
        happens, so holding it on a timer only widens the window a reload could
        lose it in. The pending debounced write is dropped first so the older
        text cannot land after this one.
      */
      clearScheduledSave(`narration:${cardId}`)
      void runSave(set, () => persistCardPatch(cardId, { narration }))
    }
  },

  applyGeneratedNarration(scripts) {
    const previous = get().cards
    if (previous.length === 0) return

    /*
      `mergeNarration` addresses slides by the 1-based number the model was
      shown, which is position in *sorted* order — the store's array is not
      guaranteed to be sorted, so it is sorted here and mapped back by id.
    */
    const sorted = [...previous].sort((a, b) => a.orderIndex - b.orderIndex)
    const merged = mergeNarration(sorted, scripts)
    const byId = new Map(merged.map((c) => [c.id, c]))

    pushHistory(set, get)
    set({ cards: previous.map((c) => byId.get(c.id) ?? c) })

    const id = get().presentationId
    if (id) {
      // Structural, like a card delete: written straight through rather than
      // debounced, since this lands a whole deck's worth of text at once.
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
