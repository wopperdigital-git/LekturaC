import { useSyncExternalStore } from 'react'
import type { GenerationBrief } from '@/ai/provider'
import { useAuthStore } from '@/store/authStore'

/**
 * Unfinished creation briefs.
 *
 * Storage is browser-local on purpose: a brief is six short answers, and a
 * draft has no meaning to anything outside this device until it becomes a real
 * deck. Everything below is deliberately behind one module so swapping
 * localStorage for a Supabase table later means rewriting this file and
 * nothing else — the pages only ever touch the exported functions and `useDrafts`.
 *
 * Consequence to keep in mind while it *is* local: drafts don't follow the user
 * to another browser, and clearing site data drops them.
 *
 * The storage key is namespaced by user id because localStorage has no concept
 * of who's signed in. Without it, signing out and letting someone else sign in
 * on the same browser profile hands them your unfinished briefs — decks can't
 * leak that way (RLS scopes them to `owner_id`), drafts otherwise would.
 */

export type DetailLevel = GenerationBrief['detailLevel']
export type Tone = GenerationBrief['tone']

export type StepKey = 'topic' | 'slideCount' | 'audience' | 'detailLevel' | 'tone' | 'guidance'

/** Drives the progress counter and which step gets the active-card treatment. */
export const STEP_ORDER: StepKey[] = [
  'topic',
  'slideCount',
  'audience',
  'detailLevel',
  'tone',
  'guidance',
]

export interface Answers {
  topic: string | null
  slideCount: number | 'auto' | null
  audience: string | null
  detailLevel: DetailLevel | null
  tone: Tone | null
  /** `''` is a real answer here (the user skipped it); `null` means unanswered. */
  guidance: string | null
}

export const NO_ANSWERS: Answers = {
  topic: null,
  slideCount: null,
  audience: null,
  detailLevel: null,
  tone: null,
  guidance: null,
}

export interface BriefDraft {
  id: string
  answers: Answers
  /**
   * Text typed into the active question but never submitted. Kept apart from
   * `answers` because it isn't an answer yet — it just shouldn't evaporate when
   * the user steps away mid-sentence.
   */
  pendingText: string
  savedAt: number
}

const KEY_PREFIX = 'lekturac:brief-drafts'

/**
 * Keys from before drafts were per-user, adopted into the signed-in user's
 * namespace on first read and then removed: the pre-drafts single-slot blob,
 * and the shared (un-namespaced) draft list that briefly replaced it.
 */
const LEGACY_SINGLE_KEY = 'lekturac:create-draft'
const LEGACY_SHARED_KEY = KEY_PREFIX

function currentUserId(): string | null {
  return useAuthStore.getState().user?.id ?? null
}

/**
 * `null` while the session is still hydrating (`authStore` starts in
 * `'loading'`). Callers must treat that as "no drafts yet" and skip the write —
 * falling back to an un-namespaced key would rebuild the shared bucket this
 * whole scheme exists to avoid. In practice `RequireAuth` gates every route
 * that reads drafts, so the pages only ever see a resolved session.
 */
function storageKey(): string | null {
  const uid = currentUserId()
  return uid ? `${KEY_PREFIX}:${uid}` : null
}

/**
 * Upper bound on stored drafts. Nothing expires on its own — a draft is visible
 * and deletable now, so having one disappear on a timer would be worse than
 * keeping it — but an unbounded list would grow forever, so the oldest fall off.
 */
const MAX_DRAFTS = 30

export function createDraftId(): string {
  return `draft_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export function emptyDraft(): BriefDraft {
  return { id: createDraftId(), answers: { ...NO_ANSWERS }, pendingText: '', savedAt: Date.now() }
}

/** How many of the six questions are answered. */
export function answeredCount(answers: Answers): number {
  return STEP_ORDER.filter((step) => answers[step] !== null).length
}

/** True once the draft holds anything worth keeping. */
export function isDraftMeaningful(draft: BriefDraft): boolean {
  return answeredCount(draft.answers) > 0 || draft.pendingText.trim().length > 0
}

/**
 * What to call a draft in a list. The topic is the natural title, but it's the
 * first question — so a draft abandoned mid-topic falls back to whatever was
 * typed, and only then to a placeholder.
 */
export function draftTitle(draft: BriefDraft): string {
  const topic = draft.answers.topic?.trim()
  if (topic) return topic
  const pending = draft.pendingText.trim()
  if (pending) return pending
  return 'Untitled brief'
}

function isAnswers(value: unknown): value is Partial<Answers> {
  return typeof value === 'object' && value !== null
}

/** Tolerates any older/partial payload rather than throwing the whole list away. */
function reviveDraft(raw: unknown): BriefDraft | null {
  if (typeof raw !== 'object' || raw === null) return null
  const candidate = raw as Partial<BriefDraft>
  if (typeof candidate.id !== 'string' || !isAnswers(candidate.answers)) return null
  return {
    id: candidate.id,
    answers: { ...NO_ANSWERS, ...candidate.answers },
    pendingText: typeof candidate.pendingText === 'string' ? candidate.pendingText : '',
    savedAt: typeof candidate.savedAt === 'number' ? candidate.savedAt : Date.now(),
  }
}

function parseList(raw: string): BriefDraft[] {
  const parsed: unknown = JSON.parse(raw)
  if (!Array.isArray(parsed)) return []
  return parsed.map(reviveDraft).filter((d): d is BriefDraft => d !== null)
}

/**
 * Both pre-namespace keys, drained into the current user's bucket and deleted.
 *
 * Whoever is signed in when the app next runs adopts them. There's no better
 * answer available — the old keys carry no owner — and leaving them in place
 * would mean every account keeps seeing them, which is the leak being closed.
 */
function drainLegacyKeys(): BriefDraft[] {
  const adopted: BriefDraft[] = []

  const shared = localStorage.getItem(LEGACY_SHARED_KEY)
  if (shared !== null) {
    localStorage.removeItem(LEGACY_SHARED_KEY)
    adopted.push(...parseList(shared))
  }

  const single = localStorage.getItem(LEGACY_SINGLE_KEY)
  if (single !== null) {
    localStorage.removeItem(LEGACY_SINGLE_KEY)
    const answers: unknown = JSON.parse(single)
    if (isAnswers(answers)) {
      const migrated: BriefDraft = {
        id: createDraftId(),
        answers: { ...NO_ANSWERS, ...answers },
        pendingText: '',
        savedAt: Date.now(),
      }
      if (answeredCount(migrated.answers) > 0) adopted.push(migrated)
    }
  }

  return adopted
}

function readRaw(key: string): BriefDraft[] {
  try {
    const stored = localStorage.getItem(key)
    if (stored !== null) return parseList(stored)

    const adopted = drainLegacyKeys()
    if (adopted.length > 0) writeRaw(key, adopted)
    return adopted
  } catch {
    return []
  }
}

function writeRaw(key: string, drafts: BriefDraft[]) {
  try {
    localStorage.setItem(key, JSON.stringify(drafts))
  } catch {
    // private mode / quota — the create flow still works, it just can't resume
  }
}

/**
 * Drop every draft bucket that isn't the signed-in user's.
 *
 * Namespacing hides one account's drafts from another, but the bytes stay on
 * disk and are readable in DevTools. Clearing on *sign-out* would close that,
 * at the price of destroying your own unfinished briefs every time you sign
 * out on your own machine — so instead this runs when the account actually
 * changes, which is the only moment leftovers are someone else's problem.
 * Signing out and back in as yourself finds nothing foreign and keeps everything.
 *
 * Residual gap: between one user signing out and the next signing in, the old
 * bucket is still there. Closing that needs the drafts off the device entirely.
 */
function purgeForeignDrafts(keepKey: string): void {
  try {
    const doomed: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key === null || key === keepKey) continue
      // `LEGACY_SHARED_KEY` is exactly `KEY_PREFIX`, so the un-namespaced list
      // from before per-user keys gets swept up here too.
      if (key.startsWith(KEY_PREFIX)) doomed.push(key)
    }
    // Collected first: removing during the loop reindexes localStorage and
    // would silently skip entries.
    doomed.forEach((key) => localStorage.removeItem(key))
  } catch {
    // storage blocked — nothing was written in the first place
  }
}

/* --------------------------------------------------------------------------
 * Subscription
 *
 * `useSyncExternalStore` needs a referentially stable snapshot or it re-renders
 * forever, so the parsed list is cached and only rebuilt when something
 * actually changes it — a local write, a write from another tab, or a change of
 * signed-in user. That last one is why the cache remembers which key it was
 * built from: without it, the previous account's drafts would stay on screen
 * until something else happened to invalidate.
 * ----------------------------------------------------------------------- */

const EMPTY: BriefDraft[] = []

let cache: BriefDraft[] | null = null
let cacheKey: string | null = null
const listeners = new Set<() => void>()

function invalidate() {
  cache = null
  cacheKey = null
  listeners.forEach((fn) => fn())
}

/** Newest first — the order every list in the UI wants. */
export function listDrafts(): BriefDraft[] {
  const key = storageKey()
  // No session yet (or none at all): no drafts, and nothing to write.
  if (key === null) return EMPTY
  if (cache === null || cacheKey !== key) {
    cache = readRaw(key).sort((a, b) => b.savedAt - a.savedAt)
    cacheKey = key
  }
  return cache
}

export function getDraft(id: string): BriefDraft | null {
  return listDrafts().find((d) => d.id === id) ?? null
}

/** Upsert by id, stamping `savedAt`. Empty drafts are dropped rather than stored. */
export function saveDraft(draft: BriefDraft): void {
  const key = storageKey()
  if (key === null) return
  const stamped = { ...draft, savedAt: Date.now() }
  const rest = listDrafts().filter((d) => d.id !== draft.id)
  const next = isDraftMeaningful(stamped) ? [stamped, ...rest] : rest
  writeRaw(key, next.slice(0, MAX_DRAFTS))
  invalidate()
}

export function deleteDraft(id: string): void {
  const key = storageKey()
  if (key === null) return
  writeRaw(key, listDrafts().filter((d) => d.id !== id))
  invalidate()
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange)
  return () => {
    listeners.delete(onChange)
  }
}

if (typeof window !== 'undefined') {
  // Another tab wrote to one of our keys — drop the cache so this one re-reads.
  window.addEventListener('storage', (e) => {
    if (e.key !== null && e.key.startsWith(KEY_PREFIX)) invalidate()
  })
}

// Sign-in, sign-out, or a session finishing hydration all change which bucket
// is live. Without this the sidebar badge would keep showing the last account's
// count until an unrelated render happened to rebuild it.
let lastUserId = currentUserId()
useAuthStore.subscribe((state) => {
  const uid = state.user?.id ?? null
  if (uid === lastUserId) return
  lastUserId = uid

  // Only purge on the way *in*. Signing out leaves the bucket alone, so the
  // same user coming back still has their drafts.
  if (uid !== null) {
    // Order matters: drop the cache, then force a read so `drainLegacyKeys`
    // can adopt any pre-namespace drafts into this user's bucket, and only
    // then purge. Purging first would delete the un-namespaced legacy list
    // (it shares the prefix) before the migration ever saw it.
    cache = null
    cacheKey = null
    listDrafts()
    purgeForeignDrafts(`${KEY_PREFIX}:${uid}`)
  }

  invalidate()
})

/** Live view of the draft list; re-renders on save/delete, including cross-tab. */
export function useDrafts(): BriefDraft[] {
  return useSyncExternalStore(subscribe, listDrafts, () => EMPTY)
}
