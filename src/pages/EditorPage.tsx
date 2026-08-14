import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { usePresentationStore } from '@/store/presentationStore'
import { ThemeProvider } from '@/components/theme/ThemeProvider'
import { ThemePanel } from '@/components/theme/ThemePanel'
import { TopBar } from '@/components/editor/TopBar'
import { CardOutlineSidebar } from '@/components/editor/CardOutlineSidebar'
import { CardCanvas } from '@/components/editor/CardCanvas'

const SIDEBAR_WIDTH_PX = 160

export function EditorPage() {
  const { id } = useParams<{ id: string }>()
  const store = usePresentationStore()

  const [activeCardId, setActiveCardId] = useState<string | null>(null)
  const [outlineOpen, setOutlineOpen] = useState(true)
  const [themeOpen, setThemeOpen] = useState(false)
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  useEffect(() => {
    if (id) void store.loadDeck(id)
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
        themeOpen={themeOpen}
        onToggleTheme={() => setThemeOpen((v) => !v)}
      />

      <div className="flex flex-1 overflow-hidden">
        <div className="relative flex shrink-0 items-stretch py-3">
          <aside
            className="h-full overflow-hidden rounded-[16px] border border-app-border bg-app-surface shadow-app transition-all duration-200"
            style={{ width: outlineOpen ? SIDEBAR_WIDTH_PX : 0, marginLeft: outlineOpen ? 12 : 0 }}
          >
            <div className="h-full" style={{ width: SIDEBAR_WIDTH_PX }}>
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

          <button
            onClick={() => setOutlineOpen((v) => !v)}
            aria-label={outlineOpen ? 'Collapse outline' : 'Expand outline'}
            className="absolute right-0 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 translate-x-1/2 cursor-pointer items-center justify-center rounded-full border border-app-border bg-app-background text-lg text-app-muted shadow-app hover:text-app-foreground"
          >
            {outlineOpen ? '‹' : '›'}
          </button>
        </div>

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
    </div>
  )
}
