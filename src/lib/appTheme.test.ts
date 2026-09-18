import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The app-chrome light/dark mode, which gained an explicit `system` setting.
 *
 * Worth testing because the three states are not the two the module used to
 * have: "follow the OS" used to be inferred from *nothing being stored*, so it
 * could not be chosen, only fallen back to. With a stored `system` the
 * inference is gone, and what has to hold instead is that an explicit choice
 * stops following the OS while `system` keeps following it — in both
 * directions, for the lifetime of the tab.
 *
 * The real module touches `localStorage`, `document` and `matchMedia` at import
 * time, so each test stubs those and re-imports it (`vi.resetModules()`), the
 * same approach `briefDrafts.test.ts` takes to the auth store.
 */

type MediaListener = (e: { matches: boolean }) => void

function stubEnvironment({ stored, systemDark }: { stored?: string; systemDark: boolean }) {
  const store = new Map<string, string>()
  if (stored !== undefined) store.set('lekturac:app-theme', stored)

  const listeners = new Set<MediaListener>()
  const dataset: Record<string, string> = {}

  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  })

  vi.stubGlobal('document', { documentElement: { dataset } })

  vi.stubGlobal('window', {
    matchMedia: (query: string) => ({
      matches: query.includes('dark') ? systemDark : false,
      addEventListener: (_: string, fn: MediaListener) => void listeners.add(fn),
      removeEventListener: (_: string, fn: MediaListener) => void listeners.delete(fn),
    }),
  })

  return {
    store,
    /** What the module actually wrote to the <html> element. */
    applied: () => dataset.theme,
    /** Fire an OS light/dark change at whatever the module subscribed. */
    emitSystemChange: (matches: boolean) => listeners.forEach((fn) => fn({ matches })),
  }
}

async function loadModule() {
  vi.resetModules()
  return (await import('./appTheme')).useAppTheme
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

describe('initial state', () => {
  it('defaults to system mode and resolves the theme from the OS', async () => {
    const env = stubEnvironment({ systemDark: true })
    const store = await loadModule()

    expect(store.getState().mode).toBe('system')
    expect(store.getState().theme).toBe('dark')
    expect(env.applied()).toBe('dark')
  })

  it('reads a stored system choice back as system, not as a resolved theme', async () => {
    stubEnvironment({ stored: 'system', systemDark: false })
    const store = await loadModule()

    expect(store.getState().mode).toBe('system')
    expect(store.getState().theme).toBe('light')
  })

  it('honours an explicit stored choice over the OS', async () => {
    const env = stubEnvironment({ stored: 'light', systemDark: true })
    const store = await loadModule()

    expect(store.getState().mode).toBe('light')
    expect(store.getState().theme).toBe('light')
    expect(env.applied()).toBe('light')
  })

  it('falls back to the OS when storage holds nonsense', async () => {
    stubEnvironment({ stored: 'chartreuse', systemDark: true })
    const store = await loadModule()

    expect(store.getState().mode).toBe('system')
    expect(store.getState().theme).toBe('dark')
  })
})

describe('setMode', () => {
  it('applies and persists an explicit choice', async () => {
    const env = stubEnvironment({ systemDark: true })
    const store = await loadModule()

    store.getState().setMode('light')

    expect(store.getState().theme).toBe('light')
    expect(env.applied()).toBe('light')
    expect(env.store.get('lekturac:app-theme')).toBe('light')
  })

  it('stores system as a real value rather than clearing the key', async () => {
    // The old module inferred "follow the OS" from an absent key. Persisting
    // `system` is what makes it a choice that survives a reload.
    const env = stubEnvironment({ stored: 'dark', systemDark: false })
    const store = await loadModule()

    store.getState().setMode('system')

    expect(env.store.get('lekturac:app-theme')).toBe('system')
    expect(store.getState().theme).toBe('light')
    expect(env.applied()).toBe('light')
  })

  it('survives storage being unavailable', async () => {
    stubEnvironment({ systemDark: false })
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('storage disabled')
      },
    })
    const store = await loadModule()

    expect(() => store.getState().setMode('dark')).not.toThrow()
    expect(store.getState().theme).toBe('dark')
  })
})

describe('following the OS', () => {
  it('re-resolves on an OS change while in system mode', async () => {
    const env = stubEnvironment({ stored: 'system', systemDark: false })
    const store = await loadModule()
    expect(store.getState().theme).toBe('light')

    env.emitSystemChange(true)

    expect(store.getState().theme).toBe('dark')
    expect(env.applied()).toBe('dark')
    // still a system choice: the OS moved, the setting didn't
    expect(store.getState().mode).toBe('system')
  })

  it('ignores an OS change once a side has been picked', async () => {
    const env = stubEnvironment({ stored: 'light', systemDark: false })
    const store = await loadModule()

    env.emitSystemChange(true)

    expect(store.getState().theme).toBe('light')
    expect(env.applied()).toBe('light')
  })

  it('starts following the OS again when switched back to system', async () => {
    const env = stubEnvironment({ stored: 'dark', systemDark: false })
    const store = await loadModule()

    store.getState().setMode('system')
    expect(store.getState().theme).toBe('light')

    env.emitSystemChange(true)
    expect(store.getState().theme).toBe('dark')
  })
})

describe('toggleTheme', () => {
  // ThemeToggle (still used on /login, which has no settings modal) flips the
  // rendered theme. From `system` that has to commit to a side, or the first
  // click would appear to do nothing when the OS already matched the target.
  it('flips the rendered theme and commits to an explicit side', async () => {
    const env = stubEnvironment({ stored: 'system', systemDark: true })
    const store = await loadModule()

    store.getState().toggleTheme()

    expect(store.getState().theme).toBe('light')
    expect(store.getState().mode).toBe('light')
    expect(env.store.get('lekturac:app-theme')).toBe('light')
  })
})
