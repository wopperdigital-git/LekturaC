import { create } from 'zustand'
import { supabase } from '@/lib/supabaseClient'
import { useAuthStore } from '@/store/authStore'
import { EMPTY_BOOKENDS, bookendsToRow, parseBookends, type Bookends } from './bookends'
import { readBookendsRow, writeBookendsRow } from './bookendsRow'

/*
  The open deck's Intro and Outro text. Best effort throughout: a failed read leaves the
  starters in use, a failed write sets `warning` and never `presentationStore.status`.

  Edits are in memory at once and written 500 ms later. `load` of another deck, `flush`
  and `beforeunload` close that gap, so a pending write is never outrun by a read.
*/

export interface BookendsPorts {
  read(deckId: string): Promise<unknown>
  write(deckId: string, row: Record<string, string>): Promise<boolean>
}

export interface BookendsState {
  deckId: string | null
  bookends: Bookends
  loaded: boolean
  warning: string | null
  load(deckId: string): Promise<void>
  set(patch: Partial<Bookends>): void
  flush(): Promise<void>
  reset(): void
}

const SAVE_WARNING = 'Your intro and outro could not be saved.'

export function createBookendsStore(ports: BookendsPorts, delayMs = 500) {
  let timer: ReturnType<typeof setTimeout> | null = null
  // Bumped by reset and by a deck change, so a read in flight for the old one is dropped.
  let generation = 0

  return create<BookendsState>((set, get) => {
    async function writePending(): Promise<void> {
      if (timer === null) return
      clearTimeout(timer)
      timer = null
      const { deckId, bookends } = get()
      if (deckId === null) return
      const ok = await ports.write(deckId, bookendsToRow(bookends))
      // reset() or another deck's load ran while this was in flight: not this deck's news.
      if (get().deckId !== deckId) return
      set({ warning: ok ? null : SAVE_WARNING })
    }

    return {
      deckId: null,
      bookends: { ...EMPTY_BOOKENDS },
      loaded: false,
      warning: null,

      async load(deckId) {
        if (get().deckId === deckId && get().loaded) return
        await writePending()
        const mine = ++generation
        set({ deckId, bookends: { ...EMPTY_BOOKENDS }, loaded: false, warning: null })
        const raw = await ports.read(deckId)
        if (mine !== generation) return
        set({ bookends: parseBookends(raw), loaded: true })
      },

      set(patch) {
        const { deckId, bookends, loaded } = get()
        if (deckId === null || !loaded) return
        set({ bookends: { ...bookends, ...patch } })
        if (timer !== null) clearTimeout(timer)
        timer = setTimeout(() => void writePending(), delayMs)
      },

      flush: writePending,

      reset() {
        generation++
        if (timer !== null) clearTimeout(timer)
        timer = null
        set({ deckId: null, bookends: { ...EMPTY_BOOKENDS }, loaded: false, warning: null })
      },
    }
  })
}

export const useBookendsStore = createBookendsStore({
  async read(deckId) {
    return supabase ? readBookendsRow(supabase, deckId) : null
  },
  async write(deckId, row) {
    return supabase ? writeBookendsRow(supabase, deckId, row) : false
  },
})

if (typeof window !== 'undefined') {
  // The tab may close inside the debounce window.
  window.addEventListener('beforeunload', () => void useBookendsStore.getState().flush())
}

// A different account must never see the last one's intro and outro. Subscribed here, as
// `voiceStore` does, because importing this store from `authStore` would be a cycle.
let lastUserId = useAuthStore.getState().user?.id ?? null
useAuthStore.subscribe((state) => {
  const uid = state.user?.id ?? null
  if (uid === lastUserId) return
  lastUserId = uid
  useBookendsStore.getState().reset()
})
