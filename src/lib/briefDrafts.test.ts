import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The auth store is stubbed rather than imported: the real one reaches for
 * Supabase at module load, and these tests are about the storage rules, not
 * about sessions. The stub keeps the two methods `briefDrafts` actually uses.
 */
vi.mock('@/store/authStore', () => {
  let state: { user: { id: string } | null } = { user: null }
  const listeners = new Set<(s: typeof state) => void>()
  return {
    useAuthStore: {
      getState: () => state,
      setState: (partial: Partial<typeof state>) => {
        state = { ...state, ...partial }
        listeners.forEach((fn) => fn(state))
      },
      subscribe: (fn: (s: typeof state) => void) => {
        listeners.add(fn)
        return () => listeners.delete(fn)
      },
    },
    // The factory survives `vi.resetModules()`, so both the user and the
    // subscriber list persist between tests — the latter meaning every
    // discarded `briefDrafts` instance would still react to a sign-in and
    // purge against the shared localStorage. Reset both explicitly.
    __resetAuthStub: () => {
      state = { user: null }
      listeners.clear()
    },
  }
})

type AuthStub = {
  useAuthStore: {
    setState: (partial: { user: { id: string } | null }) => void
  }
  __resetAuthStub: () => void
}

function installLocalStorage() {
  const store = new Map<string, string>()
  const mock = {
    get length() {
      return store.size
    },
    key: (i: number) => [...store.keys()][i] ?? null,
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  }
  vi.stubGlobal('localStorage', mock)
  return store
}

const KEY = (uid: string) => `lekturac:brief-drafts:${uid}`

/**
 * A fresh module registry per test — `briefDrafts` holds module-level cache and
 * last-seen-user state, so tests would otherwise leak into each other.
 *
 * `signedInAtLoad` is the difference between a page load with an existing
 * session (no account change, so no purge) and a sign-in (account change, purge
 * fires). Both matter, and they run different code.
 */
async function load(signedInAtLoad: string | null) {
  vi.resetModules()
  const auth = (await import('@/store/authStore')) as unknown as AuthStub
  auth.__resetAuthStub()
  // Set before importing, so this counts as "already signed in at page load"
  // rather than a sign-in the fresh module observes.
  if (signedInAtLoad) auth.useAuthStore.setState({ user: { id: signedInAtLoad } })
  const drafts = await import('./briefDrafts')
  return { auth, drafts }
}

function draftWith(id: string, topic: string) {
  return {
    id,
    answers: {
      topic,
      slideCount: null,
      audience: null,
      detailLevel: null,
      tone: null,
      guidance: null,
    },
    pendingText: '',
    savedAt: Date.now(),
  }
}

let store: Map<string, string>

beforeEach(() => {
  store = installLocalStorage()
})

describe('per-user namespacing', () => {
  it('writes under a key scoped to the signed-in user', async () => {
    const { drafts } = await load('user-a')
    drafts.saveDraft(draftWith('d1', 'Quarterly review'))

    expect(store.has(KEY('user-a'))).toBe(true)
    expect(drafts.listDrafts()).toHaveLength(1)
  })

  it('hides one account’s drafts from another', async () => {
    const a = await load('user-a')
    a.drafts.saveDraft(draftWith('d1', 'Quarterly review'))

    // Same browser, same localStorage, different session.
    const b = await load('user-b')
    expect(b.drafts.listDrafts()).toEqual([])
  })

  it('reports no drafts and writes nothing while the session is unresolved', async () => {
    const { drafts } = await load(null)
    drafts.saveDraft(draftWith('d1', 'Quarterly review'))

    expect(drafts.listDrafts()).toEqual([])
    expect(store.size).toBe(0)
  })

  it('drops a draft with no answers and no pending text', async () => {
    const { drafts } = await load('user-a')
    drafts.saveDraft(drafts.emptyDraft())

    expect(drafts.listDrafts()).toEqual([])
  })
})

describe('sign-in purge', () => {
  it('deletes the previous account’s bucket when a different user signs in', async () => {
    const a = await load('user-a')
    a.drafts.saveDraft(draftWith('d1', 'Layoff comms plan'))
    expect(store.has(KEY('user-a'))).toBe(true)

    // Sign out, then in as somebody else.
    const b = await load(null)
    b.auth.useAuthStore.setState({ user: { id: 'user-b' } })

    // Hidden is not enough — the bytes have to be gone.
    expect(store.has(KEY('user-a'))).toBe(false)
    expect(b.drafts.listDrafts()).toEqual([])
  })

  it('keeps your own drafts when you sign back in as yourself', async () => {
    const a = await load('user-a')
    a.drafts.saveDraft(draftWith('d1', 'Quarterly review'))

    const again = await load(null)
    again.auth.useAuthStore.setState({ user: { id: 'user-a' } })

    expect(store.has(KEY('user-a'))).toBe(true)
    expect(again.drafts.listDrafts()).toHaveLength(1)
  })

  it('leaves the signed-out user’s bucket alone until someone else arrives', async () => {
    const a = await load('user-a')
    a.drafts.saveDraft(draftWith('d1', 'Quarterly review'))

    // Sign-out alone must not purge, or every sign-out would destroy own work.
    a.auth.useAuthStore.setState({ user: null })
    expect(store.has(KEY('user-a'))).toBe(true)
  })
})

describe('legacy migration', () => {
  it('adopts the pre-drafts single-slot blob', async () => {
    store.set('lekturac:create-draft', JSON.stringify({ topic: 'Old brief' }))

    const { drafts } = await load('user-a')
    const list = drafts.listDrafts()

    expect(list).toHaveLength(1)
    expect(list[0].answers.topic).toBe('Old brief')
    expect(store.has('lekturac:create-draft')).toBe(false)
  })

  it('adopts the un-namespaced list rather than letting the purge eat it', async () => {
    // Regression guard: the shared legacy key starts with the same prefix the
    // purge sweeps, so purging before the migration ran would delete it.
    store.set('lekturac:brief-drafts', JSON.stringify([draftWith('d1', 'Pre-namespace brief')]))

    const fresh = await load(null)
    fresh.auth.useAuthStore.setState({ user: { id: 'user-a' } })

    expect(fresh.drafts.listDrafts()).toHaveLength(1)
    expect(store.has('lekturac:brief-drafts')).toBe(false)
    expect(store.has(KEY('user-a'))).toBe(true)
  })
})
