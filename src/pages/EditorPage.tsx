import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { usePresentationStore } from '@/store/presentationStore'
import { ThemeProvider } from '@/components/theme/ThemeProvider'
import { ThemePanel } from '@/components/theme/ThemePanel'
import { TopBar } from '@/components/editor/TopBar'
import { CardOutlineSidebar } from '@/components/editor/CardOutlineSidebar'
import { CardCanvas } from '@/components/editor/CardCanvas'
import { SettingsModal } from '@/components/editor/SettingsModal'
import { supabaseConfigured } from '@/lib/supabaseClient'

export function EditorPage() {
  const { id } = useParams<{ id: string }>()
  const store = usePresentationStore()

  const [activeCardId, setActiveCardId] = useState<string | null>(null)
  const [outlineOpen, setOutlineOpen] = useState(true)
  const [themeOpen, setThemeOpen] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  useEffect(() => {
    if (id) store.loadDeck(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => {
    if (store.cards.length > 0 && !activeCardId) setActiveCardId(store.cards[0].id)
  }, [store.cards, activeCardId])

  function scrollToCard(cardId: string) {
    setActiveCardId(cardId)
    cardRefs.current.get(cardId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  if (!id) return null
  if (store.status === 'loading') {
    return <div className="p-8 text-app-muted">Loading…</div>
  }

  return (
    <div className="flex h-screen flex-col bg-app-canvas">
      <TopBar
        title={store.title}
        onTitleChange={store.setTitle}
        presentationId={id}
        saveStatus={store.status}
        outlineOpen={outlineOpen}
        themeOpen={themeOpen}
        onToggleOutline={() => setOutlineOpen((v) => !v)}
        onToggleTheme={() => setThemeOpen((v) => !v)}
        onOpenSettings={() => setShowSettings(true)}
      />

      {!supabaseConfigured && (
        <div className="bg-yellow-50 px-4 py-2 text-xs text-yellow-800">
          Supabase isn't configured — changes in this session won't be saved. Add
          VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY to .env to enable persistence.
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <aside
          className={`shrink-0 overflow-hidden border-r border-app-border bg-app-surface transition-[width] duration-200 ${
            outlineOpen ? 'w-52' : 'w-0'
          }`}
        >
          <div className="h-full w-52">
            <CardOutlineSidebar
              cards={store.cards}
              theme={store.theme}
              activeCardId={activeCardId}
              onSelect={scrollToCard}
              onReorder={store.reorderCards}
              onDelete={store.deleteCard}
            />
          </div>
        </aside>

        <main className="flex-1 overflow-y-auto bg-app-canvas">
          {store.cards.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-app-muted">
              <p>No slides yet.</p>
              <p className="text-sm">This project was started blank — create a new project to generate one.</p>
            </div>
          ) : (
            <ThemeProvider theme={store.theme}>
              <CardCanvas cards={store.cards} cardRefs={cardRefs} />
            </ThemeProvider>
          )}
        </main>

        <aside
          className={`shrink-0 overflow-hidden border-l border-app-border bg-app-surface transition-[width] duration-200 ${
            themeOpen ? 'w-64' : 'w-0'
          }`}
        >
          <div className="h-full w-64">
            <ThemePanel theme={store.theme} onSelect={store.setTheme} />
          </div>
        </aside>
      </div>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  )
}
