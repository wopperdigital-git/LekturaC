import { z } from 'zod'
import type { PresenterState } from './presenterState'
import { parseLiveInk, type LiveInk } from './liveInk'

// The presenter console's state, saved per session so a reload resumes it.

export interface SavedSession {
  index: number
  black: boolean
  ended: boolean
}

export interface KeyValueStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

const savedSchema = z.object({
  index: z.number(),
  black: z.boolean(),
  ended: z.boolean(),
})

export function sessionKey(session: string): string {
  return `lekturac:presenter:${session}`
}

export function loadSession(storage: KeyValueStorage | null, session: string): SavedSession | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(sessionKey(session))
    if (raw === null) return null
    const parsed = savedSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export function saveSession(
  storage: KeyValueStorage | null,
  session: string,
  saved: SavedSession,
): void {
  if (!storage) return
  try {
    storage.setItem(sessionKey(session), JSON.stringify(saved))
  } catch {
    // blocked or full storage: the session just isn't remembered
  }
}

export function restoreState(saved: SavedSession, count: number): PresenterState {
  const index = Math.max(0, Math.min(saved.index, count - 1))
  return {
    index,
    count,
    black: saved.black,
    ended: index === saved.index ? saved.ended : false,
  }
}

/** Live ink is kept beside the session under its own key, so a reload keeps what was drawn. */
export function inkKey(session: string): string {
  return `lekturac:presenter-ink:${session}`
}

export function loadInk(storage: KeyValueStorage | null, session: string): LiveInk {
  if (!storage) return {}
  try {
    const raw = storage.getItem(inkKey(session))
    return raw === null ? {} : parseLiveInk(JSON.parse(raw))
  } catch {
    return {}
  }
}

export function saveInk(storage: KeyValueStorage | null, session: string, ink: LiveInk): void {
  if (!storage) return
  try {
    storage.setItem(inkKey(session), JSON.stringify(ink))
  } catch {
    // blocked or full storage: the ink just isn't remembered across a reload
  }
}
