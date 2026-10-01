// src/jobs/newItems.ts
import { useSyncExternalStore } from 'react'
import { useAuthStore } from '@/store/authStore'

/*
  Which decks have a result the user has not looked at yet (a new deck, quiz or video), for the
  dot on the dashboard card. Browser-local by decision: the jobs that produce these only run in
  this browser anyway.

  Namespaced by user id, with no un-namespaced fallback, for the same reason as briefDrafts.ts:
  localStorage does not know who is signed in, and a shared key would show one account's dots to
  the next. While the session hydrates there is no key; reads are empty and writes are skipped.
*/

export type NewKind = 'deck' | 'quiz' | 'video'
type NewMap = Record<string, NewKind[]>

const KEY_PREFIX = 'lekturac:new-items'
const EMPTY: readonly NewKind[] = Object.freeze([])
const ORDER: NewKind[] = ['deck', 'quiz', 'video']

const listeners = new Set<() => void>()
let cache: NewMap | null = null
let cacheKey: string | null = null

function storageKey(): string | null {
  const uid = useAuthStore.getState().user?.id ?? null
  return uid ? `${KEY_PREFIX}:${uid}` : null
}

function read(): NewMap {
  const key = storageKey()
  if (key === null) return {}
  if (cache !== null && cacheKey === key) return cache
  let parsed: NewMap = {}
  try {
    const raw = localStorage.getItem(key)
    const value: unknown = raw ? JSON.parse(raw) : {}
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [deckId, kinds] of Object.entries(value as Record<string, unknown>)) {
        if (!Array.isArray(kinds)) continue
        const valid = ORDER.filter((k) => kinds.includes(k))
        if (valid.length > 0) parsed[deckId] = valid
      }
    }
  } catch {
    parsed = {}
  }
  cache = parsed
  cacheKey = key
  return parsed
}

function write(next: NewMap): void {
  const key = storageKey()
  if (key === null) return
  cache = next
  cacheKey = key
  try {
    localStorage.setItem(key, JSON.stringify(next))
  } catch {
    // Blocked storage: the dot lasts for this page's life only.
  }
  listeners.forEach((fn) => fn())
}

export function newItemsFor(deckId: string): readonly NewKind[] {
  return read()[deckId] ?? EMPTY
}

export function markNew(deckId: string, kind: NewKind): void {
  if (storageKey() === null) return
  const map = read()
  const current = map[deckId] ?? []
  if (current.includes(kind)) return
  write({ ...map, [deckId]: ORDER.filter((k) => k === kind || current.includes(k)) })
}

export function clearNew(deckId: string, kind: NewKind): void {
  const map = read()
  const current = map[deckId]
  if (!current?.includes(kind)) return
  const rest = current.filter((k) => k !== kind)
  const next = { ...map }
  if (rest.length > 0) next[deckId] = rest
  else delete next[deckId]
  write(next)
}

export function clearDeck(deckId: string): void {
  const map = read()
  if (!(deckId in map)) return
  const next = { ...map }
  delete next[deckId]
  write(next)
}

function invalidate(): void {
  cache = null
  cacheKey = null
  listeners.forEach((fn) => fn())
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange)
  return () => {
    listeners.delete(onChange)
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== null && e.key.startsWith(KEY_PREFIX)) invalidate()
  })
}

let lastUserId = useAuthStore.getState().user?.id ?? null
useAuthStore.subscribe((state) => {
  const uid = state.user?.id ?? null
  if (uid === lastUserId) return
  lastUserId = uid
  invalidate()
})

/** The unseen kinds for a deck; re-renders on change, including from another tab. */
export function useNewItems(deckId: string): readonly NewKind[] {
  return useSyncExternalStore(
    subscribe,
    () => newItemsFor(deckId),
    () => EMPTY,
  )
}
