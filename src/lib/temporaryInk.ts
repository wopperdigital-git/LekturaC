import { parseOverlay, type OverlayItem } from '@/engine/overlay'

/*
  Temporary ink: annotations kept in this browser only.

  They are drawn with the same pen as ink that is part of the slide, but they
  never reach the database, the export or undo history. They survive a reload,
  which is what makes "temporary" mean "until I clear it" rather than "until I
  refresh".

  Pure over a storage-like object so the rules are testable without a browser.
  The namespacing rule is the one `briefDrafts.ts` documents, for the same reason:
  `signOut()` clears only the Supabase session, so a shared key would hand one
  account's annotations to the next on the same machine.
*/

export interface KeyValueStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/** Temporary ink for one deck: strokes by card id. */
export type TempInk = Record<string, OverlayItem[]>

/** Serialized size cap, so one deck cannot fill the browser's storage quota. */
export const MAX_TEMP_INK_CHARS = 500_000

/**
 * The storage key, or `null` while the user is unknown (the session is still
 * hydrating). Callers then skip the read or write: there is deliberately no
 * un-namespaced fallback.
 */
export function tempInkKey(userId: string | null, deckId: string): string | null {
  return userId ? `lekturac:temp-ink:${userId}:${deckId}` : null
}

/** What is stored for this user and deck; `{}` on any failure or malformed value. */
export function readTempInk(store: KeyValueStore, userId: string | null, deckId: string): TempInk {
  const key = tempInkKey(userId, deckId)
  if (!key) return {}
  try {
    const raw = store.getItem(key)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: TempInk = {}
    for (const [cardId, value] of Object.entries(parsed as Record<string, unknown>)) {
      const strokes = parseOverlay(value)
      if (strokes) out[cardId] = strokes
    }
    return out
  } catch {
    return {}
  }
}

/**
 * Stores the ink, or removes the key when there is none. Returns whether it is
 * now stored as given: `false` for no user, over the size cap, or storage that
 * refuses (blocked storage means the ink is simply not kept).
 */
export function writeTempInk(
  store: KeyValueStore,
  userId: string | null,
  deckId: string,
  ink: TempInk,
): boolean {
  const key = tempInkKey(userId, deckId)
  if (!key) return false
  try {
    if (Object.keys(ink).length === 0) {
      store.removeItem(key)
      return true
    }
    const raw = JSON.stringify(ink)
    if (raw.length > MAX_TEMP_INK_CHARS) return false
    store.setItem(key, raw)
    return true
  } catch {
    return false
  }
}

/** The ink without cards that no longer exist; the same object when nothing was dropped. */
export function pruneTempInk(ink: TempInk, cardIds: readonly string[]): TempInk {
  const live = new Set(cardIds)
  const kept = Object.entries(ink).filter(([cardId]) => live.has(cardId))
  return kept.length === Object.keys(ink).length ? ink : Object.fromEntries(kept)
}

/** An inert store, for when the browser's own is unavailable: reads find nothing and writes go nowhere. */
const INERT_STORE: KeyValueStore = { getItem: () => null, setItem: () => {}, removeItem: () => {} }

/** `localStorage`, or an inert store where even touching it throws (blocked site data). */
export function browserStore(): KeyValueStore {
  try {
    return window.localStorage
  } catch {
    return INERT_STORE
  }
}
