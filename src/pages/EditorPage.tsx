import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { flushScheduledSaves, usePresentationStore } from '@/store/presentationStore'
import { ThemeProvider } from '@/components/theme/ThemeProvider'
import { TopBar } from '@/components/editor/TopBar'
import { CardOutlineSidebar } from '@/components/editor/CardOutlineSidebar'
import { CardCanvas } from '@/components/editor/CardCanvas'
import { SlideStage } from '@/components/theme/SlideStage'
import { ToolsPanel } from '@/components/editor/ToolsPanel'
import { previewFont } from '@/engine/fontPreview'
import { cardKindOf, layoutVarieties, resolveLayout } from '@/engine/layoutEngine'
import { CardTypeModal } from '@/components/editor/CardTypeModal'
import { Button } from '@/components/ui/Button'
import type { CreatableKind } from '@/engine/cardTemplates'
import { hasMarkThroughout, markValueAt, textRef, type TextRange } from '@/engine/marks'
import { firstEditableField, type ContentType } from '@/engine/newContent'
import {
  selectionAfterCardPress,
  selectionAfterElementPress,
  selectionAfterEscape,
  selectionAfterItemPress,
  typographyScope,
  type Selection,
} from '@/engine/textScope'
import { parseTextRef } from '@/engine/blockText'
import { SLIDE_BODY_ATTR, blockIndexOf, blockStyleKey } from '@/components/layouts/adjustContext'
import { useRenderedAlign } from '@/components/editor/useRenderedAlign'
import { useExportPptx } from '@/export/useExportPptx'
import { DEFAULT_ZOOM, clampZoom, scrollTopAfterZoom, stepZoom, zoomFromWheel } from '@/lib/zoom'
import { useCanvasPan } from '@/components/editor/useCanvasPan'

const SIDEBAR_WIDTH_PX = 160
const RIGHT_PANEL_WIDTH_PX = 280

export function EditorPage() {
  const { id } = useParams<{ id: string }>()
  const store = usePresentationStore()
  const { cards, undo, redo } = store

  const [activeCardId, setActiveCardId] = useState<string | null>(null)
  const [outlineOpen, setOutlineOpen] = useState(true)
  // The tools panel on the right; collapsible, open by default.
  const [toolsOpen, setToolsOpen] = useState(true)
  /*
    The font the pointer is currently over in the panel, shown on the slide but
    never stored. `undefined` is "nothing hovered"; `null` previews the theme's own
    font. See `previewFont`.
  */
  const [fontPreview, setFontPreview] = useState<string | null | undefined>(undefined)
  // Distinct from `activeCardId`, which merely tracks what the outline rail
  // highlights and defaults to the first card. Selection is a deliberate act
  // and starts empty, because it is what decides the toolbar's level.
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)
  // Level 3: which run of text is being edited, and what is selected inside it.
  const [activeTextRef, setActiveTextRef] = useState<string | null>(null)
  const [textRange, setTextRange] = useState<TextRange | null>(null)
  // Free-form: which block of the selected card carries the selection box. Held
  // beside `selectedCardId` rather than inside it because the two clear on
  // different events — picking a different card drops the element, but editing
  // text inside the element must not.
  const [selectedBlockIndex, setSelectedBlockIndex] = useState<number | null>(null)
  // Which item of that element is picked out, when it is a list. Held beside the
  // element rather than in place of it: the list stays the selected element and
  // the item is a refinement of it.
  const [selectedItemIndex, setSelectedItemIndex] = useState<number | null>(null)
  // Whether the add-a-slide type picker is open.
  const [addSlideOpen, setAddSlideOpen] = useState(false)
  // A card added from the picker does not exist in the DOM until the next
  // render, so the scroll has to wait for its ref rather than run inline.
  const [pendingScrollId, setPendingScrollId] = useState<string | null>(null)
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  // How large the canvas is drawn. A view setting: not stored, not undoable.
  const [zoom, setZoom] = useState(DEFAULT_ZOOM)
  const canvasRef = useRef<HTMLElement>(null)
  const previousZoom = useRef(DEFAULT_ZOOM)
  const { status: exportStatus, error: exportError, exportDeck } = useExportPptx()


  /*
    Ctrl+scroll zooms the canvas. React's `onWheel` is passive, so it cannot stop
    the browser zooming the whole *page* on the same gesture — a native listener
    with `passive: false` is what makes `preventDefault` take effect. A trackpad
    pinch arrives as a Ctrl+wheel too, so it works the same way. ⌘ is accepted for
    the same reason the rest of the editor accepts it.
  */
  useEffect(() => {
    const node = canvasRef.current
    if (!node) return
    function onWheel(e: WheelEvent) {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      setZoom((current) => zoomFromWheel(current, e.deltaY))
    }
    node.addEventListener('wheel', onWheel, { passive: false })
    return () => node.removeEventListener('wheel', onWheel)
    // The canvas only exists once the deck has loaded, hence the dependency.
  }, [store.status])

  // Ctrl + drag grabs the canvas and moves it, for getting around once zoomed in.
  useCanvasPan(canvasRef, store.status !== 'loading')

  // Keeps the middle of the view on the same content when the zoom changes; the
  // content grows or shrinks under a fixed scroll offset otherwise.
  useLayoutEffect(() => {
    const node = canvasRef.current
    if (node && previousZoom.current !== zoom) {
      node.scrollTop = scrollTopAfterZoom(node.scrollTop, node.clientHeight, previousZoom.current, zoom)
    }
    previousZoom.current = zoom
  }, [zoom])

  useEffect(() => {
    if (id) void store.loadDeck(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  /*
    An edit is in memory immediately but only in the database once its 500ms
    debounce fires, so closing or reloading the tab in between drops it. Firing
    the pending writes here is best-effort — the browser will not wait for them
    — but it turns a guaranteed loss into a request that usually completes, and
    a released drag is already written immediately (see `setBlockAdjust`), so
    what is left in flight here is small.
  */
  useEffect(() => {
    const flush = () => void flushScheduledSaves()
    window.addEventListener('beforeunload', flush)
    return () => {
      window.removeEventListener('beforeunload', flush)
      /*
        Leaving the editor flushes too, and `beforeunload` does not cover it:
        clicking back to the dashboard is a client-side navigation, so the tab
        never unloads. A debounced edit was still sitting on its timer while the
        dashboard re-read the deck list — which then showed the deck's old
        timestamp and sorted it as though it had not been touched.
      */
      flush()
    }
  }, [])

  useEffect(() => {
    if (cards.length > 0 && !activeCardId) setActiveCardId(cards[0].id)
  }, [cards, activeCardId])

  // Brings a newly added slide into view once it has actually rendered.
  useEffect(() => {
    if (!pendingScrollId) return
    const node = cardRefs.current.get(pendingScrollId)
    if (!node) return
    node.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setPendingScrollId(null)
  }, [pendingScrollId, cards])

  // A deleted card must not stay selected: the toolbar would keep showing
  // Level 2 and write style patches to a row that no longer exists.
  useEffect(() => {
    if (selectedCardId && !cards.some((c) => c.id === selectedCardId)) setSelectedCardId(null)
  }, [cards, selectedCardId])

  /*
    Leaving a card ends any edit inside it — otherwise the toolbar would stay at
    Level 3 pointing at a run that is no longer on screen.

    Only the edit. The element selection is not this effect's business: every
    press now resolves card and element together through `engine/textScope.ts`,
    so whatever changed the card has already said what happens to the element.
  */
  useEffect(() => {
    setActiveTextRef(null)
    setTextRange(null)
  }, [selectedCardId])

  /** Presses on a card's own surface, rather than on one of its elements. */
  function selectCard(cardId: string | null) {
    apply(selectionAfterCardPress(cardId))
  }

  /*
    A press on an element takes the card first and the element only once that
    card is already selected — the drill-in the whole scope model rests on, and
    the reason "format this whole slide" is a state the canvas can reach at all.
    The rule itself lives in `engine/textScope.ts`; this only applies it.
  */
  function selectElement(cardId: string, index: number) {
    const current: Selection = { cardId: selectedCardId, blockIndex: selectedBlockIndex, itemIndex: selectedItemIndex }
    apply(selectionAfterElementPress(current, { cardId, blockIndex: index }))
    endEditOutside(index)
  }

  // The same drill-in for one item of a list.
  function selectItem(cardId: string, blockIndex: number, itemIndex: number) {
    const current: Selection = { cardId: selectedCardId, blockIndex: selectedBlockIndex, itemIndex: selectedItemIndex }
    apply(selectionAfterItemPress(current, { cardId, blockIndex, itemIndex }))
    endEditOutside(blockIndex, itemIndex)
  }

  /*
    Picking something other than the run being typed in ends that edit.

    Selecting no longer implies editing, so a press elsewhere can no longer rely
    on its own click to move the edit along: the old run would stay live, the
    toolbar would stay at Level 3, and Backspace — which now removes the selected
    element — would be swallowed as a keystroke for a run the user has left. A
    press *inside* the run being edited must not end it, though, or clicking to
    move the caret would throw the user out of the text they are editing; and a
    press on the list around an item being edited does not either.
  */
  function endEditOutside(blockIndex: number, itemIndex?: number) {
    if (!activeTextRef) return
    const active = parseTextRef(activeTextRef)
    const sameBlock = active?.blockIndex === blockIndex
    const sameItem = itemIndex === undefined || (active?.itemIndex ?? null) === itemIndex
    if (sameBlock && sameItem) return
    setActiveTextRef(null)
    setTextRange(null)
  }

  function apply(next: Selection) {
    setSelectedCardId(next.cardId)
    setSelectedBlockIndex(next.blockIndex)
    setSelectedItemIndex(next.itemIndex)
  }

  function scrollToCard(cardId: string) {
    setActiveCardId(cardId)
    cardRefs.current.get(cardId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  /*
    The selection-dependent keys — Backspace and Delete to remove, Escape to step
    out — read what is selected *now*. The listener is registered once, so it
    reaches them through a ref that is refreshed after every render; listing them
    as dependencies instead would tear the listener down and re-add it on every
    selection change.
  */
  const selectionKeys = useRef<{ remove: () => boolean; escape: () => void }>({
    remove: () => false,
    escape: () => {},
  })
  useEffect(() => {
    selectionKeys.current = { remove: removeSelected, escape: stepOut }
  })

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      // A field owns its own keys — the deck title in TopBar, above all.
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
        return
      }
      /*
        No exception for a live run of text, and that is deliberate.

        The browser's own undo stack only knows about typing, so with a run
        focused ⌘Z did nothing at all for everything else the deck had done — a
        nudge, a resize, bold, a font, an added element — and an element that is
        highlighted very often has its run focused. The store's history covers all
        of it, typing included. What used to make that unsafe was the run's node
        keeping the old text after a store undo; `EditableText` now repaints when
        the store moves the text underneath it, so the two cannot disagree.
      */
      const mod = e.metaKey || e.ctrlKey
      if (!mod && !e.altKey && (e.key === 'Backspace' || e.key === 'Delete')) {
        if (selectionKeys.current.remove()) e.preventDefault()
        return
      }
      // An Escape a dropdown already used to close itself is not also a request
      // to step the selection back.
      if (e.key === 'Escape') {
        if (!e.defaultPrevented) selectionKeys.current.escape()
        return
      }
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

  /*
    Removes whatever is highlighted: the item if one is picked out, otherwise the
    element. From the keyboard it does nothing while text is being edited
    (Backspace is then a keystroke for that text) or while a dialog is open. The
    bin on the element is an explicit request, so it goes ahead either way — and
    ends the edit, since the run being typed in may be the thing removed.

    Reports whether it removed anything so the key is only swallowed when it did.
  */
  function removeSelected(fromButton = false): boolean {
    if (!fromButton && (activeTextRef || addSlideOpen)) return false
    const card = cards.find((c) => c.id === selectedCardId)
    if (!card || selectedBlockIndex === null) return false

    if (fromButton) {
      setActiveTextRef(null)
      setTextRange(null)
    }

    if (selectedItemIndex !== null) {
      const result = store.removeListItem(card.id, selectedBlockIndex, selectedItemIndex)
      if (!result) return false
      // The list stays selected unless it was the last item that took it with it.
      apply({ cardId: card.id, blockIndex: result.blockRemoved ? null : selectedBlockIndex, itemIndex: null })
      return true
    }

    if (!store.removeBlock(card.id, selectedBlockIndex)) return false
    // Every later element moved up a place, so a selection kept at this index
    // would now be a different element.
    apply(selectionAfterCardPress(card.id))
    return true
  }

  // One step back out: item to list, list to card.
  function stepOut() {
    if (activeTextRef || addSlideOpen) return
    apply(selectionAfterEscape({ cardId: selectedCardId, blockIndex: selectedBlockIndex, itemIndex: selectedItemIndex }))
  }

  const sortedCards = [...cards].sort((a, b) => a.orderIndex - b.orderIndex)
  const selectedIndex = sortedCards.findIndex((c) => c.id === selectedCardId)
  const selectedCard = selectedIndex >= 0 ? sortedCards[selectedIndex] : null
  // The picker offers varieties of this type only, so the type is resolved once
  // here and drives both the options and the menu's heading.
  const activeInline = activeTextRef ? selectedCard?.inline?.[activeTextRef] : undefined
  /*
    The style the toolbar reads and writes, and the scope it belongs to.

    Read straight off the selection — element, else card, else deck — so what
    the canvas shows as picked is what the toolbar formats. Selecting an element
    is now a deliberate second press (see `selectElement`), which is what makes
    the card scope reachable and lets this be a plain three-way rule rather than
    a guess about what the user meant.

    A run of characters is deliberately not a fourth scope. Font, size and
    alignment are whole-element properties — per-character alignment is not a
    thing, and neither is half a word in Georgia — so editing a run does not
    narrow them to that run. Bold and italic are the ones that do narrow, and
    they take a different route entirely (`onToggleMark`), so nothing here
    decides their scope. Writing all three to the run's own `textRef` is what
    the toolbar used to do, and no surface renders that: every ordinary attempt
    to change a slide's font stored the choice and moved nothing on screen.
  */
  const scope = typographyScope({ cardId: selectedCardId, blockIndex: selectedBlockIndex, itemIndex: selectedItemIndex })
  const typographyRef = scope.kind === 'element' ? blockStyleKey(scope.blockIndex) : null
  const elementStyle = typographyRef ? selectedCard?.inline?.[typographyRef]?.style : undefined

  // What the selected element is actually aligned as on screen, so the toolbar
  // can light that button rather than only one somebody explicitly set.
  const renderedAlign = useRenderedAlign(() => {
    if (!selectedCard) return null
    const body = cardRefs.current.get(selectedCard.id)?.querySelector(`[${SLIDE_BODY_ATTR}]`)
    return body instanceof HTMLElement ? body : null
  }, selectedBlockIndex)
  const level: 1 | 2 | 3 = activeTextRef ? 3 : selectedCard ? 2 : 1
  const hasTextSelection = Boolean(textRange && textRange.end > textRange.start)
  // The scope the text tools are writing to, in words — narrowest first, the same
  // order `typographyScope` and the character-range routing use.
  const scopeLabel =
    level === 3 && hasTextSelection
      ? 'selected text'
      : scope.kind === 'element'
        ? selectedItemIndex !== null
          ? 'selected item'
          : 'selected element'
        : scope.kind === 'card'
          ? 'this slide'
          : 'whole deck'
  const markState = {
    bold: hasTextSelection && hasMarkThroughout(activeInline?.marks ?? [], textRange!, 'bold'),
    italic: hasTextSelection && hasMarkThroughout(activeInline?.marks ?? [], textRange!, 'italic'),
    underline: hasTextSelection && hasMarkThroughout(activeInline?.marks ?? [], textRange!, 'underline'),
  }
  // What the selected characters currently are, for the font, size and colour
  // controls — read at the selection's first character (see `markValueAt`).
  const runValues = hasTextSelection
    ? {
        fontFamily: markValueAt(activeInline?.marks ?? [], textRange!, 'fontFamily') as string | null,
        fontScale: markValueAt(activeInline?.marks ?? [], textRange!, 'fontScale') as number | null,
        color: markValueAt(activeInline?.marks ?? [], textRange!, 'color') as string | null,
      }
    : undefined

  /*
    What the canvas draws: the real cards, or — while the pointer is over a font in
    the panel — a derived copy with that font applied where a click would write it.
    Nothing is stored and no history entry is made; moving off the row stops
    deriving. Only the canvas reads this. Everything that acts on the deck (the
    toolbar's own state, the outline, saving) keeps reading `cards`.
  */
  const previewed = useMemo(() => {
    if (fontPreview === undefined) return { cards, textStyle: store.textStyle }
    return previewFont(
      cards,
      store.textStyle,
      {
        scope,
        typographyRef,
        run:
          selectedCardId && activeTextRef && hasTextSelection
            ? { cardId: selectedCardId, ref: activeTextRef, range: textRange! }
            : null,
      },
      fontPreview,
    )
  }, [fontPreview, cards, store.textStyle, scope, typographyRef, selectedCardId, activeTextRef, hasTextSelection, textRange])

  /*
    The card's type, and the layout it is actually rendering as.

    `cardKindOf` rather than `cardKind`: a title slide added anywhere but the
    front carries an explicit `hero` layout precisely because the classifier
    would not award it, and reading the blocks alone would report that card as
    a text slide — so the toolbar would name a type the slide plainly is not.
  */
  const selectedCardKind = selectedCard
    ? cardKindOf(selectedCard, { isFirstCard: selectedIndex === 0 })
    : undefined
  const selectedResolvedLayout = selectedCard
    ? resolveLayout(selectedCard.layout, selectedCard.blocks, { isFirstCard: selectedIndex === 0 })
    : undefined

  // The plus under a selected list names its own block; nothing else calls this.
  function addListItem(blockIndex: number) {
    if (!selectedCard) return
    const itemIndex = store.addListItem(selectedCard.id, blockIndex)
    if (itemIndex === null) return
    /*
      Leaves the *list* highlighted, not the new item. Adding an item is an act on
      the list as a whole, so the whole group is what lights up — with an item
      selected instead, the list's own box is hidden and the group the user just
      grew never shows as picked. The new item is one press away from there, the
      same drill-in every other list item takes.
    */
    apply({ cardId: selectedCard.id, blockIndex, itemIndex: null })
    setActiveTextRef(null)
    setTextRange(null)
  }

  /*
    Adds a new element to the selected card and opens it for typing.

    It goes at the end of the card (see `withBlockAppended`), so no existing
    element changes address. The new element is selected — which is what lights up
    its box — and its first run opened, with the placeholder selected so the first
    keystroke replaces it.
  */
  function addContent(type: ContentType) {
    if (!selectedCard) return
    const blockIndex = store.addBlock(selectedCard.id, type)
    if (blockIndex === null) return
    // Read back from the store rather than rebuilt here: the block was just
    // written, and this is the one place that knows what it holds.
    const block = usePresentationStore.getState().cards.find((c) => c.id === selectedCard.id)?.blocks[blockIndex]
    apply({ cardId: selectedCard.id, blockIndex, itemIndex: null })
    if (!block) return
    const { field, item } = firstEditableField(block)
    setActiveTextRef(textRef(blockIndex, field, item))
    setTextRange(null)
  }

  /*
    Undo and redo can remove the very thing that is selected — undoing an "Add
    content" takes the new element back out — and the selection is held by index,
    so it would be left pointing past the end of the card, or at a different
    element. When what it names no longer exists, fall back to the card.
  */
  useEffect(() => {
    if (!selectedCard) return
    const blocks = selectedCard.blocks
    const editedIndex = activeTextRef ? blockIndexOf(activeTextRef) : null
    if (selectedBlockIndex !== null && selectedBlockIndex >= blocks.length) {
      apply(selectionAfterCardPress(selectedCard.id))
    }
    if (editedIndex !== null && editedIndex >= blocks.length) {
      setActiveTextRef(null)
      setTextRange(null)
    }
    // `apply` only sets state; the inputs below are everything this reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCard, selectedBlockIndex, activeTextRef])

  function addCardOfKind(kind: CreatableKind) {
    // After the card the user is looking at — the selected one if there is one,
    // otherwise whichever the rail has highlighted.
    const newCardId = store.addCard(kind, selectedCardId ?? activeCardId)
    setActiveCardId(newCardId)
    selectCard(newCardId)
    setPendingScrollId(newCardId)
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
        canExport={cards.length > 0}
        exporting={exportStatus === 'working'}
        onExport={() =>
          void exportDeck({
            title: store.title,
            theme: store.theme,
            textStyle: store.textStyle,
            cards,
          })
        }
      />
      {/*
        A failed write used to say "Save failed" in grey, 11px, in the corner of
        the top bar — and `errorMessage`, which carries the reason, was rendered
        nowhere at all. Everything still worked on screen, because the store is
        the source of truth for the session, so the deck looked fine right up
        until the tab was closed. A write that did not land is the one failure in
        this app that silently destroys work, so it says so, in full, where the
        user is looking.
      */}
      {store.status === 'error' && store.errorMessage && (
        <p role="alert" className="bg-red-50 px-4 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          Not saved — {store.errorMessage}. Your changes are on screen but have not reached the
          server; reloading this page will lose them.
        </p>
      )}
      {exportError && (
        <p role="alert" className="bg-red-50 px-4 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          Export failed: {exportError}
        </p>
      )}

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
                onAddCard={() => setAddSlideOpen(true)}
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
        <main ref={canvasRef} className="scrollbar-subtle relative flex-1 overflow-auto">
          {cards.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-app-muted">
              <p>No slides yet.</p>
              {/* A blank project used to be a dead end that told the user to go
                  and start a different one. It can now be built by hand, one
                  slide at a time — generation is still the way to get a whole
                  deck at once, not the only way to get a slide. */}
              <p className="text-sm">Add one by hand, or start a new project to generate a deck.</p>
              <Button variant="primary" onClick={() => setAddSlideOpen(true)}>
                Add a slide
              </Button>
            </div>
          ) : (
            <ThemeProvider theme={store.theme}>
              <CardCanvas
                cards={previewed.cards}
                cardRefs={cardRefs}
                deckTextStyle={previewed.textStyle}
                selectedCardId={selectedCardId}
                onSelectCard={(cardId) => {
                  // Clicking the card body (not a run of text) leaves Level 3,
                  // and drops the element selection: `Adjustable` stops its own
                  // click, so reaching here means the press landed on the card
                  // around its elements rather than on one of them.
                  selectCard(cardId)
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
                  // ⌘B / ⌘I from inside the run. It carries its own range
                  // rather than relying on `textRange`, which is a render
                  // behind at the moment the key is pressed.
                  onToggleMark: (ref, range, type) => {
                    if (selectedCard) store.toggleTextMark(selectedCard.id, ref, range, type)
                  },
                }}
                selectedBlockIndex={selectedBlockIndex}
                selectedItemIndex={selectedItemIndex}
                onSelectElement={selectElement}
                onSelectItem={selectItem}
                onChangeAdjust={store.setBlockAdjust}
                onRemoveSelected={() => void removeSelected(true)}
                onAddItem={addListItem}
                zoom={zoom}
              />
            </ThemeProvider>
          )}
        </main>

        {/* The tools dock. Mirrors the outline rail on the other side: floats on
            the stage, animates its width to 0 when collapsed, and is toggled by
            an arrow pinned to the vertical centre of its inner edge. Unlike the
            rail it has a surface of its own (inside `ToolsPanel`), since it is
            full of controls rather than pictures. `relative` is required: the
            stage layer is absolutely positioned, so without it this panel's
            static content paints *underneath* the deck's backdrop. */}
        <div className="relative flex shrink-0 items-stretch py-3">
          <button
            onClick={() => setToolsOpen((v) => !v)}
            aria-label={toolsOpen ? 'Collapse tools' : 'Expand tools'}
            // Straddling the gap while open; tucked inside the window edge when
            // collapsed, where the dock has no width to hang it on and a centred
            // arrow would be half off-screen.
            className={`absolute top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 cursor-pointer ${
              toolsOpen ? 'left-0 -translate-x-1/2' : 'right-1'
            } items-center justify-center rounded-full border border-app-border bg-app-background text-lg text-app-muted shadow-app transition-colors hover:text-app-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent`}
          >
            {toolsOpen ? '›' : '‹'}
          </button>
          <aside
            className="h-full overflow-hidden transition-all duration-200"
            style={{ width: toolsOpen ? RIGHT_PANEL_WIDTH_PX : 0, marginRight: toolsOpen ? 12 : 0, marginLeft: toolsOpen ? 12 : 0 }}
          >
            <div className="h-full" style={{ width: RIGHT_PANEL_WIDTH_PX }}>
              <ToolsPanel
                level={level}
                scopeLabel={scopeLabel}
                canUndo={store.past.length > 0}
                canRedo={store.future.length > 0}
                onUndo={undo}
                onRedo={redo}
                presentHref={`/deck/${id}/present`}
                // Read from the same scope it writes to, or the panel reports a
                // state it is not editing.
                textStyle={
                  scope.kind === 'element'
                    ? (elementStyle ?? {})
                    : scope.kind === 'card'
                      ? (selectedCard?.textStyle ?? {})
                      : store.textStyle
                }
                onTextStyleChange={(patch) => {
                  if (scope.kind === 'element' && typographyRef) {
                    // The selected element, not the whole card. `inline` keyed by a
                    // bare block index addresses the element; the same store action
                    // serves both because a run's key only differs by carrying a
                    // field. See `blockStyleKey`.
                    store.setInlineStyle(scope.cardId, typographyRef, patch)
                  } else if (scope.kind === 'card') {
                    store.setCardTextStyle(scope.cardId, patch)
                  } else {
                    store.setTextStyle(patch)
                  }
                }}
                onFontPreview={setFontPreview}
                markState={markState}
                hasTextSelection={hasTextSelection}
                // Only at element scope: the card and deck scopes have no one
                // element to read, and fall back to their stored value. Null
                // whenever no element is selected, which is what says so.
                activeAlign={renderedAlign}
                onToggleMark={(type) => {
                  if (selectedCard && activeTextRef && textRange) {
                    store.toggleTextMark(selectedCard.id, activeTextRef, textRange, type)
                  }
                }}
                runValues={runValues}
                onRunValue={(type, value) => {
                  if (selectedCard && activeTextRef && textRange) {
                    store.setTextMarkValue(selectedCard.id, activeTextRef, textRange, type, value)
                  }
                }}
                layout={
                  selectedCard && selectedCardKind
                    ? {
                        options: layoutVarieties(selectedCard.blocks, selectedCardKind),
                        active: selectedCard.layout,
                        activeVisualStyle: selectedCard.visualStyle,
                        onChange: (layout, visualStyle) =>
                          store.setCardVariety(selectedCard.id, layout, visualStyle),
                        kind: selectedCardKind,
                        resolved: selectedResolvedLayout,
                        card: selectedCard,
                        isFirstCard: selectedIndex === 0,
                      }
                    : undefined
                }
                onAddContent={selectedCard ? addContent : undefined}
                theme={store.theme}
                deckTextStyle={store.textStyle}
                onThemeChange={store.setTheme}
                zoom={zoom}
                onZoomChange={(next, direction) =>
                  setZoom((current) => (next !== null ? clampZoom(next) : stepZoom(current, direction ?? 1)))
                }
              />
            </div>
          </aside>
        </div>
      </div>

      {addSlideOpen && (
        <CardTypeModal
          onClose={() => setAddSlideOpen(false)}
          onPick={(kind) => {
            addCardOfKind(kind)
            setAddSlideOpen(false)
          }}
        />
      )}
    </div>
  )
}
