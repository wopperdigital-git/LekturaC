import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { usePresentationStore } from '@/store/presentationStore'
import { ThemeProvider } from '@/components/theme/ThemeProvider'
import { ThemePanel } from '@/components/theme/ThemePanel'
import { TopBar, type RightPanel } from '@/components/editor/TopBar'
import { CardOutlineSidebar } from '@/components/editor/CardOutlineSidebar'
import { CardCanvas, type BlockSelection, type EditTarget } from '@/components/editor/CardCanvas'
import { ScriptPanel } from '@/components/editor/ScriptPanel'

const SIDEBAR_WIDTH_PX = 160
const THEME_PANEL_WIDTH_PX = 256
const SCRIPT_PANEL_WIDTH_PX = 320

export function EditorPage() {
  const { id } = useParams<{ id: string }>()
  const store = usePresentationStore()
  const { cards, editBlockText, deleteBlock, undo, redo } = store

  const [activeCardId, setActiveCardId] = useState<string | null>(null)
  const [selection, setSelection] = useState<BlockSelection | null>(null)
  const [outlineOpen, setOutlineOpen] = useState(true)
  const [rightPanel, setRightPanel] = useState<RightPanel>(null)
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  // Which panel to *render* while the dock is collapsing: dropping straight to
  // `null` would blank the panel out before the width transition finishes.
  const lastRightPanel = useRef<Exclude<RightPanel, null>>('theme')
  if (rightPanel) lastRightPanel.current = rightPanel
  const rightPanelWidth =
    lastRightPanel.current === 'script' ? SCRIPT_PANEL_WIDTH_PX : THEME_PANEL_WIDTH_PX

  useEffect(() => {
    if (id) void store.loadDeck(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => {
    if (cards.length > 0 && !activeCardId) setActiveCardId(cards[0].id)
  }, [cards, activeCardId])

  function scrollToCard(cardId: string) {
    setActiveCardId(cardId)
    cardRefs.current.get(cardId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const handleSelect = useCallback((next: BlockSelection | null) => {
    setSelection(next)
    if (next) setActiveCardId(next.cardId)
  }, [])

  const handleEditText = useCallback(
    (target: EditTarget, text: string) => {
      editBlockText(target.cardId, target.blockIndex, target.path, text)
    },
    [editBlockText],
  )

  const handleDeleteBlock = useCallback(
    (target: BlockSelection) => {
      deleteBlock(target.cardId, target.blockIndex)
      setSelection(null)
    },
    [deleteBlock],
  )

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      // Text being edited owns its own keys — including Backspace and ⌘Z.
      if (
        target &&
        (target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')
      ) {
        return
      }

      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
        setSelection(null)
        return
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        redo()
        setSelection(null)
        return
      }
      if (mod || e.altKey) return

      if (e.key === 'Escape') {
        setSelection(null)
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selection) {
        e.preventDefault()
        handleDeleteBlock(selection)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selection, handleDeleteBlock, undo, redo])

  const sortedCards = [...cards].sort((a, b) => a.orderIndex - b.orderIndex)
  const activeIndex = sortedCards.findIndex((c) => c.id === activeCardId)

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
        rightPanel={rightPanel}
        onToggleRightPanel={(panel) => setRightPanel((current) => (current === panel ? null : panel))}
        canUndo={store.past.length > 0}
        canRedo={store.future.length > 0}
        onUndo={() => {
          undo()
          setSelection(null)
        }}
        onRedo={() => {
          redo()
          setSelection(null)
        }}
      />

      <div className="flex flex-1 overflow-hidden">
        <div className="relative flex shrink-0 items-stretch py-3">
          <aside
            className="h-full overflow-hidden rounded-[16px] border border-app-border bg-app-surface shadow-app transition-all duration-200"
            style={{ width: outlineOpen ? SIDEBAR_WIDTH_PX : 0, marginLeft: outlineOpen ? 12 : 0 }}
          >
            <div className="h-full" style={{ width: SIDEBAR_WIDTH_PX }}>
              <CardOutlineSidebar
                cards={cards}
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
            className="absolute right-0 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 translate-x-1/2 cursor-pointer items-center justify-center rounded-full border border-app-border bg-app-background text-lg text-app-muted shadow-app transition-colors hover:text-app-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent"
          >
            {outlineOpen ? '‹' : '›'}
          </button>
        </div>

        <main className="flex-1 overflow-y-auto bg-app-canvas">
          {cards.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-app-muted">
              <p>No slides yet.</p>
              <p className="text-sm">This project was started blank — create a new project to generate one.</p>
            </div>
          ) : (
            <ThemeProvider theme={store.theme}>
              <CardCanvas
                cards={cards}
                cardRefs={cardRefs}
                selection={selection}
                onSelect={handleSelect}
                onEditText={handleEditText}
                onDeleteBlock={handleDeleteBlock}
              />
            </ThemeProvider>
          )}
        </main>

        <aside
          className="shrink-0 overflow-hidden border-l border-app-border bg-app-surface transition-[width] duration-200"
          style={{ width: rightPanel ? rightPanelWidth : 0 }}
        >
          <div className="h-full" style={{ width: rightPanelWidth }}>
            {lastRightPanel.current === 'script' ? (
              <ScriptPanel
                card={activeIndex >= 0 ? sortedCards[activeIndex] : null}
                index={activeIndex}
              />
            ) : (
              <ThemePanel theme={store.theme} onSelect={store.setTheme} />
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
