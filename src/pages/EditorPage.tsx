import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { usePresentationStore } from '@/store/presentationStore'
import { ThemeProvider } from '@/components/theme/ThemeProvider'
import { ThemePanel } from '@/components/theme/ThemePanel'
import { TopBar, type RightPanel } from '@/components/editor/TopBar'
import { CardOutlineSidebar } from '@/components/editor/CardOutlineSidebar'
import { CardCanvas } from '@/components/editor/CardCanvas'
import { SlideStage } from '@/components/theme/SlideStage'
import { EditorToolbar } from '@/components/editor/EditorToolbar'
import { cardKind, layoutVarieties } from '@/engine/layoutEngine'
import { hasMarkThroughout, type TextRange } from '@/engine/marks'

const SIDEBAR_WIDTH_PX = 160
const RIGHT_PANEL_WIDTH_PX = 256

export function EditorPage() {
  const { id } = useParams<{ id: string }>()
  const store = usePresentationStore()
  const { cards, undo, redo } = store

  const [activeCardId, setActiveCardId] = useState<string | null>(null)
  const [outlineOpen, setOutlineOpen] = useState(true)
  const [rightPanel, setRightPanel] = useState<RightPanel>(null)
  // Distinct from `activeCardId`, which merely tracks what the outline rail
  // highlights and defaults to the first card. Selection is a deliberate act
  // and starts empty, because it is what decides the toolbar's level.
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)
  // Level 3: which run of text is being edited, and what is selected inside it.
  const [activeTextRef, setActiveTextRef] = useState<string | null>(null)
  const [textRange, setTextRange] = useState<TextRange | null>(null)
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map())


  useEffect(() => {
    if (id) void store.loadDeck(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => {
    if (cards.length > 0 && !activeCardId) setActiveCardId(cards[0].id)
  }, [cards, activeCardId])

  // A deleted card must not stay selected: the toolbar would keep showing
  // Level 2 and write style patches to a row that no longer exists.
  useEffect(() => {
    if (selectedCardId && !cards.some((c) => c.id === selectedCardId)) setSelectedCardId(null)
  }, [cards, selectedCardId])

  // Leaving a card ends any edit inside it — otherwise the toolbar would stay
  // at Level 3 pointing at a run that is no longer on screen.
  useEffect(() => {
    setActiveTextRef(null)
    setTextRange(null)
  }, [selectedCardId])

  function scrollToCard(cardId: string) {
    setActiveCardId(cardId)
    cardRefs.current.get(cardId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      // A field owns its own keys — the deck title in TopBar, above all.
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return

      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
        return
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        redo()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [undo, redo])

  const sortedCards = [...cards].sort((a, b) => a.orderIndex - b.orderIndex)
  const selectedIndex = sortedCards.findIndex((c) => c.id === selectedCardId)
  const selectedCard = selectedIndex >= 0 ? sortedCards[selectedIndex] : null
  // The picker offers varieties of this type only, so the type is resolved once
  // here and drives both the options and the menu's heading.
  const activeInline = activeTextRef ? selectedCard?.inline?.[activeTextRef] : undefined
  const level: 1 | 2 | 3 = activeTextRef ? 3 : selectedCard ? 2 : 1
  const hasTextSelection = Boolean(textRange && textRange.end > textRange.start)
  const markState = {
    bold: hasTextSelection && hasMarkThroughout(activeInline?.marks ?? [], textRange!, 'bold'),
    italic: hasTextSelection && hasMarkThroughout(activeInline?.marks ?? [], textRange!, 'italic'),
  }

  const selectedCardKind = selectedCard
    ? cardKind(selectedCard.blocks, { isFirstCard: selectedIndex === 0 })
    : undefined

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
        canUndo={store.past.length > 0}
        canRedo={store.future.length > 0}
        onUndo={undo}
        onRedo={redo}
      />

      <div className="relative flex flex-1 overflow-hidden">
        {/*
          The deck's themed ground, spanning the entire editor body — behind the
          outline rail as well as the canvas. The rail and canvas are siblings
          painted over it, both transparent, so neither punches an app-coloured
          hole in the theme.

          It sits *outside* the scroll containers, which is what pins it while
          cards scroll past. And ThemeProvider wraps only this layer, never the
          chrome around it: `applyTheme` rewrites Tailwind's `--spacing`
          multiplier on its scope, so wrapping the rail or the right panel would
          make a theme's spacing density resize the app's own UI.
        */}
        {/* The wrapper does the positioning, not SlideStage: the stage sets its
            own `relative` (its backdrop is positioned against it), and passing
            `absolute` in alongside it is a coin-flip decided by Tailwind's
            stylesheet order rather than by the class list here. */}
        <div className="absolute inset-0">
          <ThemeProvider theme={store.theme}>
            <SlideStage className="h-full w-full" />
          </ThemeProvider>
        </div>

        <div className="relative flex shrink-0 items-stretch py-3">
          {/* No surface, border or shadow of its own: the thumbnails are the
              only thing that should read as an object here, floating straight
              on the page. Giving the rail a surface of its own would put a
              second card behind every card. */}
          <aside
            className="h-full overflow-hidden transition-all duration-200"
            style={{ width: outlineOpen ? SIDEBAR_WIDTH_PX : 0, marginLeft: outlineOpen ? 12 : 0 }}
          >
            <div className="h-full" style={{ width: SIDEBAR_WIDTH_PX }}>
              <CardOutlineSidebar
                cards={cards}
                theme={store.theme}
                deckTextStyle={store.textStyle}
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

        {/* Transparent: the stage layer above is the background now. */}
        <main className="scrollbar-subtle relative flex-1 overflow-y-auto">
          {/*
            Floats over the canvas rather than scrolling with it: `sticky top-0`
            with `h-0` means the bar reserves no height, so the first card sits
            exactly where it did before the toolbar existed. The wrapper is
            click-through (`pointer-events-none`) so the strip either side of the
            bar doesn't swallow clicks meant for the cards underneath.
          */}
          {cards.length > 0 && (
            <div className="pointer-events-none sticky top-0 z-20 flex h-0 justify-center">
              <div className="pt-3">
                <EditorToolbar
                  level={level}
                  textStyle={
                    level === 3
                      ? (activeInline?.style ?? {})
                      : selectedCard
                        ? (selectedCard.textStyle ?? {})
                        : store.textStyle
                  }
                  onTextStyleChange={(patch) => {
                    if (level === 3 && selectedCard && activeTextRef) {
                      store.setInlineStyle(selectedCard.id, activeTextRef, patch)
                    } else if (selectedCard) {
                      store.setCardTextStyle(selectedCard.id, patch)
                    } else {
                      store.setTextStyle(patch)
                    }
                  }}
                  markState={markState}
                  hasTextSelection={hasTextSelection}
                  onToggleMark={(type) => {
                    if (selectedCard && activeTextRef && textRange) {
                      store.toggleTextMark(selectedCard.id, activeTextRef, textRange, type)
                    }
                  }}
                  themeName={store.theme.name}
                  onOpenThemes={() => setRightPanel((current) => (current === 'theme' ? null : 'theme'))}
                  themesOpen={rightPanel === 'theme'}
                  layoutOptions={selectedCardKind ? layoutVarieties(selectedCard!.blocks, selectedCardKind) : undefined}
                  activeLayout={selectedCard?.layout}
                  activeVisualStyle={selectedCard?.visualStyle}
                  onLayoutChange={
                    selectedCard
                      ? (layout, visualStyle) =>
                          store.setCardVariety(selectedCard.id, layout, visualStyle)
                      : undefined
                  }
                  cardKind={selectedCardKind}
                />
              </div>
            </div>
          )}
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
                deckTextStyle={store.textStyle}
                selectedCardId={selectedCardId}
                onSelectCard={(cardId) => {
                  setSelectedCardId(cardId)
                  // Clicking the card body (not a run of text) leaves Level 3.
                  setActiveTextRef(null)
                  setTextRange(null)
                }}
                textEditing={{
                  activeRef: activeTextRef,
                  onSelectText: (ref) => {
                    setActiveTextRef(ref)
                    setTextRange(null)
                  },
                  onChangeText: (ref, next) => {
                    if (selectedCard) store.setBlockText(selectedCard.id, ref, next)
                  },
                  onSelectionChange: (_ref, range) => setTextRange(range),
                }}
              />
            </ThemeProvider>
          )}
        </main>

        {/* Floats on the stage like the outline rail — no surface, no divider.
            `relative` is required, not cosmetic: the stage layer is absolutely
            positioned, so without it this panel's static content paints
            *underneath* the deck's backdrop and disappears. */}
        <aside
          className="relative shrink-0 overflow-hidden transition-[width] duration-200"
          style={{ width: rightPanel ? RIGHT_PANEL_WIDTH_PX : 0 }}
        >
          <div className="h-full" style={{ width: RIGHT_PANEL_WIDTH_PX }}>
            <ThemePanel theme={store.theme} onSelect={store.setTheme} />
          </div>
        </aside>
      </div>
    </div>
  )
}
