import { SLIDE_WINDOW_NAME, screenUrl } from './protocol'

// Browser glue for the projector window: opening it, and remembering whether the
// browser let us. Untested (it needs a real window); keep it thin.

let held: Window | null = null
const outcomes = new Map<string, 'opened' | 'blocked'>()

export function newSessionId(): string {
  // randomUUID exists only in a secure context (plain-http LAN testing lacks it).
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Opens (or refocuses) the slide window. Call it inside a click, or the browser blocks it. */
export function openSlideWindow(deckId: string, session: string): Window | null {
  const win = window.open(screenUrl(deckId, session), SLIDE_WINDOW_NAME, 'popup,width=1280,height=720')
  held = win
  outcomes.set(session, win ? 'opened' : 'blocked')
  return win
}

export function lastOpenOutcome(session: string): 'opened' | 'blocked' | 'unknown' {
  return outcomes.get(session) ?? 'unknown'
}

export function closeSlideWindow(): void {
  try {
    held?.close()
  } catch {
    // a window we no longer control
  }
  held = null
}
