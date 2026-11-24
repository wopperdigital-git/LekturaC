import type { MouseEvent, PointerEvent as ReactPointerEvent } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePresentationStore } from '@/store/presentationStore'
import { ThemeProvider } from '@/components/theme/ThemeProvider'
import { SlideStage } from '@/components/theme/SlideStage'
import { FittedSlide } from '@/components/theme/FittedSlide'
import { PresentSlide } from '@/components/present/PresentSlide'
import { presentDrawing } from '@/components/present/presentDrawing'
import { useLaserTrail } from '@/components/present/useLaserTrail'
import { ClearIcon, ToolIcon, UndoIcon, WhiteboardIcon } from '@/components/present/liveToolIcons'
import { BOARD_BLEED_PX, Whiteboard, type BoardTyping } from '@/components/present/Whiteboard'
import { DEFAULT_BOARD_VIEW, stepBoardZoom, type BoardView } from '@/present/boardView'
import type { CardDrawing } from '@/components/editor/drawingContext'
import { SLIDE_BODY_ATTR } from '@/components/layouts/adjustContext'
import { contentFraction, type Stroke } from '@/engine/overlay'
import { LiveToolMenu } from '@/components/present/LiveToolMenu'
import { swatch } from '@/components/present/inkSwatch'
import { DeckLoadError } from '@/components/editor/DeckLoadError'
import {
  commitJump,
  initialPresenterState,
  reducePresenter,
  typeDigit,
  type JumpBuffer,
  type PresenterState,
} from '@/present/presenterState'
import { confirmsExit, EXIT_CONFIRM_MS, inkUndoKey, leavesKeyToBrowser, presenterKeyIntent } from '@/present/keys'
import {
  channelName,
  nextScreenLink,
  parseScreenMessage,
  type ConsoleMessage,
  type DeckSnapshot,
  type ForwardedKey,
  type ScreenLink,
} from '@/present/protocol'
import { loadInk, loadSession, restoreState, saveInk, saveSession } from '@/present/session'
import {
  DEFAULT_LIVE_PEN,
  LIVE_TEXT_SIZES,
  liveToolMenu,
  WHITEBOARD_ID,
  addLiveItem,
  canRedoInk,
  canUndoInk,
  clearLiveSlide,
  eraseLiveStrokes,
  livePenSettings,
  isLiveText,
  recordInk,
  redoInk,
  setLiveText,
  slideHasInk,
  undoInk,
  type InkHistory,
  type LiveInk,
  type LiveItem,
  type LivePen,
  type LiveTool,
} from '@/present/liveInk'
import { closeSlideWindow, lastOpenOutcome, openSlideWindow } from '@/present/slideWindow'

// The script sizes belong to this view and its tests; a separate file would only hold this line.
// oxlint-disable-next-line react/only-export-components
export const NOTE_SIZES = ['text-base', 'text-lg', 'text-xl', 'text-2xl', 'text-3xl'] as const
const DEFAULT_NOTE_SIZE = 1

export interface PresenterConsoleViewProps {
  deck: DeckSnapshot
  state: PresenterState
  noteSize: number
  screen: ScreenLink
  /** The first Escape has been pressed; a second within the window ends. */
  exitPending: boolean
  onPrev: () => void
  onNext: () => void
  onToggleBlack: () => void
  onNotesSmaller: () => void
  onNotesLarger: () => void
  onOpenScreen: () => void
  onEnd: () => void
  /** The live pen: which tool, and the pen's and highlighter's colours. */
  pen?: LivePen
  onTool?: (tool: LiveTool) => void
  onColor?: (color: string) => void
  /** A size picked in a tool's menu. */
  onPenChange?: (patch: Partial<LivePen>) => void
  /** The tool whose settings menu is open, if any; pressing the chosen tool again opens it. */
  toolMenu?: LiveTool | null
  onToolMenu?: (tool: LiveTool | null) => void
  /** Whether the current slide has live ink to clear. */
  hasInk?: boolean
  onClearSlide?: () => void
  /** Whether the current slide's ink has a change to undo, or an undone one to redo. */
  canUndo?: boolean
  canRedo?: boolean
  onUndo?: () => void
  onRedo?: () => void
  /** The current slide's live ink and laser, and what captures the pen; `null` draws none. */
  drawing?: CardDrawing | null
  /** The laser moved to this point on the slide (fractions of the content width), or left it. */
  onLaserPoint?: (point: [number, number] | null) => void
  /** The whiteboard is up in place of the slide, with these items on it. */
  board?: boolean
  boardItems?: readonly LiveItem[]
  onToggleBoard?: () => void
  /** Typing on the whiteboard with the Text tool. */
  typing?: BoardTyping | null
  /** Where the whiteboard is panned and zoomed to, and the way to move it. */
  boardView?: BoardView
  onBoardView?: (view: BoardView) => void
}

const TOOLS: readonly { tool: LiveTool; label: string; title: string }[] = [
  { tool: 'pointer', label: 'Pointer', title: 'Pointer: click the slide without drawing' },
  { tool: 'pen', label: 'Pen', title: 'Pen: draw on the slide' },
  { tool: 'highlighter', label: 'Highlighter', title: 'Highlighter: a wide see-through mark' },
  { tool: 'laser', label: 'Laser', title: 'Laser pointer: a red dot that leaves no mark' },
  { tool: 'eraser', label: 'Eraser', title: 'Eraser: drag over ink to remove it' },
  { tool: 'text', label: 'Text', title: 'Text: click the whiteboard and type' },
]

const ICON_BUTTON =
  'inline-flex size-9 cursor-pointer items-center justify-center rounded-app-sm border border-app-border bg-app-surface text-app-foreground transition-colors hover:bg-app-border/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-app-surface'
const ICON_PRESSED = 'border-app-accent bg-app-accent text-app-accent-foreground hover:bg-app-accent'

const noop = () => {}

/**
 * A mouse press must not leave a button focused: Enter and Space on a focused button
 * press it, so a clicked Black screen would eat the clicker's next Space. Tab still focuses.
 */
function refuseFocus(e: MouseEvent) {
  e.preventDefault()
}

const BUTTON =
  'inline-flex cursor-pointer items-center justify-center rounded-app-sm border border-app-border bg-app-surface px-3 py-1.5 text-sm font-medium text-app-foreground transition-colors hover:bg-app-border/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent disabled:cursor-not-allowed disabled:opacity-50'

function ScreenBanner({ screen, onOpenScreen }: { screen: ScreenLink; onOpenScreen: () => void }) {
  if (screen !== 'closed' && screen !== 'blocked') return null
  const closed = screen === 'closed'
  return (
    <div
      role="status"
      className="flex items-center justify-between gap-3 border-b border-app-border bg-app-highlight px-4 py-2 text-sm text-app-highlight-foreground"
    >
      <span>{closed ? 'Slide window closed' : 'Your browser blocked the slide window'}</span>
      <button type="button" onMouseDown={refuseFocus} onClick={onOpenScreen} className={BUTTON}>
        {closed ? 'Reopen' : 'Open slide window'}
      </button>
    </div>
  )
}

/** The console's picture: pure, so each state can be rendered in a test. */
export function PresenterConsoleView({
  deck,
  state,
  noteSize,
  screen,
  exitPending,
  onPrev,
  onNext,
  onToggleBlack,
  onNotesSmaller,
  onNotesLarger,
  onOpenScreen,
  onEnd,
  pen = DEFAULT_LIVE_PEN,
  onTool = noop,
  onColor = noop,
  onPenChange = noop,
  toolMenu = null,
  onToolMenu = noop,
  hasInk = false,
  onClearSlide = noop,
  canUndo = false,
  canRedo = false,
  onUndo = noop,
  onRedo = noop,
  drawing = null,
  onLaserPoint = noop,
  board = false,
  boardItems,
  onToggleBoard = noop,
  typing = null,
  boardView = DEFAULT_BOARD_VIEW,
  onBoardView = noop,
}: PresenterConsoleViewProps) {
  const count = deck.cards.length
  if (count === 0) {
    return (
      <div className="flex h-screen flex-col bg-app-background text-app-foreground">
        <header className="flex items-center justify-between gap-3 border-b border-app-border px-4 py-2">
          <h1 className="min-w-0 truncate text-sm font-semibold">{deck.title}</h1>
          <button type="button" onMouseDown={refuseFocus} onClick={onEnd} className={BUTTON}>
            End presentation
          </button>
        </header>
        <p className="p-8 text-app-muted">No slides to present.</p>
      </div>
    )
  }

  const index = Math.min(Math.max(state.index, 0), count - 1)
  const card = deck.cards[index]
  const script = card.narration?.text.trim() ? card.narration.text : ''
  // Text goes only on the whiteboard.
  const tools = board ? TOOLS : TOOLS.filter((t) => t.tool !== 'text')
  const showBoard = board && !state.ended

  // The laser follows the pointer over the slide's content box, in the ink's coordinates.
  function laserMove(e: ReactPointerEvent<HTMLElement>) {
    const body = e.currentTarget.querySelector(`[${SLIDE_BODY_ATTR}]`)
    const rect = body?.getBoundingClientRect()
    if (!rect || rect.width <= 0) return
    onLaserPoint(contentFraction({ x: e.clientX, y: e.clientY }, rect))
  }
  const laserOn = pen.tool === 'laser' && !state.ended && !state.black

  return (
    <div className="flex h-screen flex-col bg-app-background text-app-foreground">
      <p aria-live="polite" className="sr-only">
        {`Slide ${index + 1} of ${count}`}
      </p>

      <header className="flex items-center justify-between gap-3 border-b border-app-border px-4 py-2">
        <h1 className="min-w-0 truncate text-sm font-semibold">{deck.title}</h1>
        <button type="button" onMouseDown={refuseFocus} onClick={onEnd} className={BUTTON}>
          End presentation
        </button>
      </header>

      <ScreenBanner screen={screen} onOpenScreen={onOpenScreen} />

      <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-20 flex justify-center">
        {exitPending && (
          <span className="rounded-app-sm border border-app-border bg-app-surface px-3 py-1.5 text-sm font-medium text-app-foreground shadow-lg">
            Press Esc again to end presentation
          </span>
        )}
      </div>

      <div className="flex min-h-0 flex-1 gap-4 p-4">
        <section
          className="relative min-h-0 min-w-0 flex-1"
          onPointerMove={laserOn ? laserMove : undefined}
          onPointerLeave={laserOn ? () => onLaserPoint(null) : undefined}
          style={laserOn ? { cursor: 'none' } : undefined}
        >
          <ThemeProvider theme={deck.theme}>
            <SlideStage className="h-full w-full overflow-hidden rounded-app">
              {state.ended ? (
                <div className="flex h-full w-full items-center justify-center bg-black text-xl text-white">
                  End of presentation
                </div>
              ) : showBoard ? (
                <div className="relative h-full min-h-0 w-full min-w-0">
                  <Whiteboard
                    items={boardItems}
                    drawing={drawing}
                    typing={typing}
                    view={boardView}
                    onView={onBoardView}
                    pannable={pen.tool === 'pointer'}
                  />
                </div>
              ) : (
                <div className="relative h-full min-h-0 w-full min-w-0">
                  <FittedSlide>
                    <PresentSlide
                      card={card}
                      textStyle={deck.textStyle}
                      isFirstCard={index === 0}
                      drawing={drawing}
                    />
                  </FittedSlide>
                </div>
              )}
            </SlideStage>
          </ThemeProvider>
          {state.black && (
            <div className="absolute inset-0 flex items-center justify-center rounded-app bg-black/80 p-4 text-center text-sm text-white">
              Screen is black · press B to show
            </div>
          )}
        </section>

        <aside className="flex min-h-0 w-[26rem] shrink-0 flex-col gap-3">
          <div className="flex min-h-0 flex-1 flex-col rounded-app-sm border border-app-border">
            <div className="flex items-center justify-between border-b border-app-border px-3 py-1.5">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-app-muted">Script</h2>
              <div className="flex gap-1">
                <button
                  type="button"
                  onMouseDown={refuseFocus}
                  onClick={onNotesSmaller}
                  disabled={noteSize <= 0}
                  aria-label="Smaller script text"
                  className={BUTTON}
                >
                  A−
                </button>
                <button
                  type="button"
                  onMouseDown={refuseFocus}
                  onClick={onNotesLarger}
                  disabled={noteSize >= NOTE_SIZES.length - 1}
                  aria-label="Larger script text"
                  className={BUTTON}
                >
                  A+
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
              {script ? (
                <p className={`whitespace-pre-wrap ${NOTE_SIZES[noteSize] ?? NOTE_SIZES[DEFAULT_NOTE_SIZE]}`}>
                  {script}
                </p>
              ) : (
                <p className="text-sm text-app-muted">No script for this slide.</p>
              )}
            </div>
          </div>
        </aside>
      </div>

      <footer className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-app-border px-4 py-3">
        <div className="flex items-center gap-2">
          <button type="button" onMouseDown={refuseFocus} onClick={onPrev} className={BUTTON}>
            ‹ Prev
          </button>
          <span className="min-w-14 text-center text-sm tabular-nums">{`${index + 1} / ${count}`}</span>
          <button type="button" onMouseDown={refuseFocus} onClick={onNext} disabled={state.ended} className={BUTTON}>
            Next ›
          </button>
          <button
            type="button"
            onMouseDown={refuseFocus}
            onClick={onToggleBlack}
            aria-pressed={state.black}
            title="Black screen (B)"
            className={`${BUTTON} ${state.black ? 'border-app-accent bg-app-accent text-app-accent-foreground hover:bg-app-accent' : ''}`}
          >
            Black screen
          </button>
        </div>

        <div role="toolbar" aria-label="Draw on the slide" className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onMouseDown={refuseFocus}
            onClick={onToggleBoard}
            disabled={state.ended}
            aria-pressed={board}
            title={board ? 'Back to the slide' : 'Whiteboard: a blank page to write and type on'}
            className={`${BUTTON} gap-1.5 ${board ? ICON_PRESSED : ''}`}
          >
            <WhiteboardIcon />
            Whiteboard
          </button>
          <div role="group" aria-label="Tool" data-tool-row className="flex gap-1">
            {tools.map(({ tool, label, title }) => {
              const chosen = pen.tool === tool
              const menu = liveToolMenu(tool)
              const open = chosen && toolMenu === tool
              // The tool's own colour, as a dot on its button, now that the colours live in its menu.
              const dot = menu?.color ? swatch(tool === 'highlighter' ? pen.highlighterColor : pen.penColor) : null
              return (
                <div key={tool} className="relative">
                  <button
                    type="button"
                    onMouseDown={refuseFocus}
                    onClick={() => {
                      // A second press on the chosen tool opens (or closes) its settings.
                      if (chosen && menu) onToolMenu(open ? null : tool)
                      else {
                        onToolMenu(null)
                        onTool(tool)
                      }
                    }}
                    aria-pressed={chosen}
                    aria-label={label}
                    aria-haspopup={menu ? 'dialog' : undefined}
                    aria-expanded={menu ? open : undefined}
                    title={menu ? `${title} (press again for size${menu.color ? ' and colour' : ''})` : title}
                    className={`${ICON_BUTTON} relative ${chosen ? ICON_PRESSED : ''}`}
                  >
                    <ToolIcon tool={tool} />
                    {dot && (
                      <span
                        aria-hidden="true"
                        data-tool-color
                        className="absolute right-0.5 bottom-0.5 size-2.5 rounded-full border border-app-background"
                        style={{ background: dot }}
                      />
                    )}
                  </button>
                  {open && <LiveToolMenu tool={tool} pen={pen} onChange={onPenChange} onColor={onColor} />}
                </div>
              )
            })}
          </div>
          {showBoard && (
            <div role="group" aria-label="Zoom" className="flex items-center gap-1">
              <button
                type="button"
                onMouseDown={refuseFocus}
                onClick={() => onBoardView(stepBoardZoom(boardView, -1))}
                aria-label="Zoom out"
                title="Zoom out (or scroll on the board)"
                className={ICON_BUTTON}
              >
                <span aria-hidden="true" className="text-lg leading-none">−</span>
              </button>
              <button
                type="button"
                onMouseDown={refuseFocus}
                onClick={() => onBoardView(DEFAULT_BOARD_VIEW)}
                title="Back to the start of the board at 100%"
                className={`${BUTTON} min-w-16 tabular-nums`}
              >
                {`${Math.round(boardView.zoom * 100)}%`}
              </button>
              <button
                type="button"
                onMouseDown={refuseFocus}
                onClick={() => onBoardView(stepBoardZoom(boardView, 1))}
                aria-label="Zoom in"
                title="Zoom in (or scroll on the board)"
                className={ICON_BUTTON}
              >
                <span aria-hidden="true" className="text-lg leading-none">+</span>
              </button>
            </div>
          )}
          <div role="group" aria-label="History" className="flex gap-1">
            <button
              type="button"
              onMouseDown={refuseFocus}
              onClick={onUndo}
              disabled={!canUndo}
              aria-label="Undo"
              title="Undo (Ctrl+Z)"
              className={ICON_BUTTON}
            >
              <UndoIcon />
            </button>
            <button
              type="button"
              onMouseDown={refuseFocus}
              onClick={onRedo}
              disabled={!canRedo}
              aria-label="Redo"
              title="Redo (Ctrl+Shift+Z)"
              className={ICON_BUTTON}
            >
              <UndoIcon flip />
            </button>
            <button
              type="button"
              onMouseDown={refuseFocus}
              onClick={onClearSlide}
              disabled={!hasInk}
              aria-label="Clear slide"
              title="Clear slide: remove everything drawn on it"
              className={ICON_BUTTON}
            >
              <ClearIcon />
            </button>
          </div>
        </div>
      </footer>
    </div>
  )
}

function sessionStorageOrNull(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage
  } catch {
    return null
  }
}


function ConsoleRunner({
  deckId,
  session,
  start,
  initialDeck,
}: {
  deckId: string
  session: string
  start: number
  initialDeck: DeckSnapshot
}) {
  const navigate = useNavigate()
  // Frozen: later store changes (the editor is another tab) never reach the projector.
  const [deck] = useState(initialDeck)
  const count = deck.cards.length

  const [state, setState] = useState<PresenterState>(() => {
    const saved = count > 0 ? loadSession(sessionStorageOrNull(), session) : null
    return saved ? restoreState(saved, count) : initialPresenterState(count, start)
  })
  const [noteSize, setNoteSize] = useState(DEFAULT_NOTE_SIZE)
  const [screen, setScreen] = useState<ScreenLink>(() =>
    lastOpenOutcome(session) === 'blocked' ? 'blocked' : 'connecting',
  )

  const channelRef = useRef<BroadcastChannel | null>(null)
  const stateRef = useRef(state)
  const jumpRef = useRef<JumpBuffer | null>(null)
  // null until the slide window has been heard; a loading window cannot post yet.
  const lastHeardRef = useRef<number | null>(null)
  const connectingSinceRef = useRef(0) // set on mount and on each Open or Reopen
  const lastExitRef = useRef<number | null>(null)
  const exitTimerRef = useRef<number | undefined>(undefined)
  const [exitPending, setExitPending] = useState(false)

  const post = useCallback((message: ConsoleMessage) => {
    channelRef.current?.postMessage(message)
  }, [])

  // Live ink: drawn here, mirrored on the slide window, kept for a reload, never written to the deck.
  const [pen, setPen] = useState<LivePen>(DEFAULT_LIVE_PEN)
  // The open tool menu. Closed by an outside press (which still draws) or Escape (which does not end the talk).
  const [toolMenu, setToolMenu] = useState<LiveTool | null>(null)
  const toolMenuRef = useRef(toolMenu)
  useEffect(() => {
    toolMenuRef.current = toolMenu
    if (!toolMenu) return
    function onPointerDown(e: PointerEvent) {
      const target = e.target
      if (target instanceof Element && target.closest('[data-tool-menu], [data-tool-row]')) return
      setToolMenu(null)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [toolMenu])
  const [ink, setInk] = useState<LiveInk>(() => (count > 0 ? loadInk(sessionStorageOrNull(), session) : {}))
  const inkRef = useRef(ink)
  // Per slide, in memory only: a reload keeps the ink but starts a fresh undo.
  const [history, setHistory] = useState<InkHistory>({})
  const historyRef = useRef(history)
  const [laser, moveLaser] = useLaserTrail()

  // Posted in the same turn as the change, so the slide window gets the finished stroke
  // before the `inkLive: null` that follows it and never blinks it out.
  const showInk = useCallback(
    (next: LiveInk, nextHistory: InkHistory) => {
      historyRef.current = nextHistory
      setHistory(nextHistory)
      inkRef.current = next
      setInk(next)
      post({ type: 'ink', ink: next })
    },
    [post],
  )

  /** A change to one slide's ink, as one undo step. */
  const changeInk = useCallback(
    (cardId: string, change: (ink: LiveInk) => LiveInk) => {
      const before = inkRef.current
      const next = change(before)
      if (next === before) return
      showInk(next, recordInk(historyRef.current, cardId, before[cardId] ?? []))
    },
    [showInk],
  )

  const stepInk = useCallback(
    (cardId: string, direction: 'undo' | 'redo') => {
      const step = (direction === 'undo' ? undoInk : redoInk)(inkRef.current, historyRef.current, cardId)
      if (step) showInk(step.ink, step.history)
    },
    [showInk],
  )

  useEffect(() => {
    saveInk(sessionStorageOrNull(), session, ink)
  }, [ink, session])

  const slideId = count > 0 ? deck.cards[Math.min(Math.max(state.index, 0), count - 1)].id : null
  // The whiteboard stands in for the slide: while it is up, every ink action is on it.
  const [board, setBoard] = useState(false)
  // Kept while the board is put away, so going back finds it where it was left.
  const [boardView, setBoardView] = useState<BoardView>(DEFAULT_BOARD_VIEW)
  const boardViewRef = useRef(boardView)
  useEffect(() => {
    boardViewRef.current = boardView
    post({ type: 'boardView', view: boardView })
  }, [boardView, post])
  const boardUp = board && !state.ended
  const cardId = slideId === null ? null : boardUp ? WHITEBOARD_ID : slideId

  // Typing on the board: shown on both windows as it is typed, one undo step per edit.
  const [editing, setEditing] = useState<string | null>(null)
  const editRef = useRef<{ id: string; before: readonly LiveItem[] } | null>(null)

  const showInkOnly = useCallback(
    (next: LiveInk) => {
      if (next === inkRef.current) return
      inkRef.current = next
      setInk(next)
      post({ type: 'ink', ink: next })
    },
    [post],
  )

  /** Ends the edit in progress: an empty text is removed, and a change becomes one undo step. */
  const finishEdit = useCallback(() => {
    const edit = editRef.current
    if (!edit) return
    editRef.current = null
    setEditing(null)
    let next = inkRef.current
    const item = next[WHITEBOARD_ID]?.find((i) => i.id === edit.id)
    if (item && isLiveText(item) && item.text.trim() === '') next = eraseLiveStrokes(next, WHITEBOARD_ID, [item.id])
    const after = next[WHITEBOARD_ID] ?? []
    if (JSON.stringify(after) === JSON.stringify(edit.before)) {
      showInkOnly(next)
      return
    }
    showInk(next, recordInk(historyRef.current, WHITEBOARD_ID, edit.before))
  }, [showInk, showInkOnly])

  const typing = useMemo<BoardTyping>(
    () => ({
      active: pen.tool === 'text',
      editingId: editing,
      onPlace: (point) => {
        finishEdit()
        const before = inkRef.current[WHITEBOARD_ID] ?? []
        const id = crypto.randomUUID()
        // The press lands mid-way down the first line, not on its top edge.
        const text = {
          id,
          kind: 'text' as const,
          x: point[0],
          y: point[1] - LIVE_TEXT_SIZES[pen.textSize] * 0.6,
          text: '',
          color: pen.penColor,
          size: LIVE_TEXT_SIZES[pen.textSize],
        }
        const next = addLiveItem(inkRef.current, WHITEBOARD_ID, text)
        if (next === inkRef.current) return
        editRef.current = { id, before }
        setEditing(id)
        showInkOnly(next)
      },
      onEdit: (id) => {
        if (editRef.current?.id === id) return
        finishEdit()
        editRef.current = { id, before: inkRef.current[WHITEBOARD_ID] ?? [] }
        setEditing(id)
      },
      onChange: (id, text) => showInkOnly(setLiveText(inkRef.current, WHITEBOARD_ID, id, text)),
      onDone: (id) => {
        if (editRef.current?.id === id) finishEdit()
      },
    }),
    [pen.tool, pen.penColor, pen.textSize, editing, finishEdit, showInkOnly],
  )

  const toggleBoard = useCallback(() => {
    finishEdit()
    setBoard((b) => !b)
    setPen((p) => (p.tool === 'text' ? { ...p, tool: 'pointer' } : p))
  }, [finishEdit])

  /** Moving to another slide puts the board away. */
  const closeBoard = useCallback(() => {
    finishEdit()
    setBoard(false)
    setPen((p) => (p.tool === 'text' ? { ...p, tool: 'pointer' } : p))
  }, [finishEdit])

  const laserPoint = useCallback(
    (point: [number, number] | null) => {
      if (!cardId) return
      moveLaser(point)
      post({ type: 'laser', cardId, point })
    },
    [cardId, moveLaser, post],
  )

  // The laser never carries over to another slide or tool.
  const laserOn = pen.tool === 'laser'
  useEffect(() => {
    if (!cardId) return
    moveLaser(null)
    post({ type: 'laser', cardId, point: null })
  }, [cardId, laserOn, moveLaser, post])

  const drawing = useMemo(() => {
    if (!cardId) return null
    // The callbacks read `inkRef` only when a stroke is committed or erased, never during render.
    // oxlint-disable-next-line react/refs
    return presentDrawing({
      strokes: ink[cardId],
      settings: state.ended || state.black ? null : livePenSettings(pen),
      laser: laserOn ? laser : undefined,
      onCommit: (stroke: Stroke) => changeInk(cardId, (i) => addLiveItem(i, cardId, stroke)),
      onErase: (ids: string[]) => changeInk(cardId, (i) => eraseLiveStrokes(i, cardId, ids)),
      onLiveStroke: (stroke: Stroke | null) => post({ type: 'inkLive', cardId, stroke }),
      bleed: cardId === WHITEBOARD_ID ? BOARD_BLEED_PX : undefined,
    })
  }, [cardId, ink, pen, laserOn, laser, state.ended, state.black, changeInk, post])

  // Every change is remembered, so a reload resumes the same session.
  useEffect(() => {
    stateRef.current = state
    if (count === 0) return
    saveSession(sessionStorageOrNull(), session, {
      index: state.index,
      black: state.black,
      ended: state.ended,
    })
  }, [state, session, count])

  // The projector follows every change.
  useEffect(() => {
    post({ type: 'state', index: state.index, black: state.black, ended: state.ended, board: boardUp })
  }, [state, boardUp, post])
  const boardRef = useRef(boardUp)
  useEffect(() => {
    boardRef.current = boardUp
  }, [boardUp])

  // One handler for the projector's forwarded keys and this window's own.
  const handleKey = useCallback((key: ForwardedKey) => {
    const at = Date.now()
    // Any move to another slide puts the board away; Black screen leaves it.
    if (key.type !== 'toggleBlack' && key.type !== 'digit') closeBoard()
    if (key.type === 'digit') {
      jumpRef.current = typeDigit(jumpRef.current, key.digit, at)
      return
    }
    if (key.type === 'enter') {
      const target = commitJump(jumpRef.current, at)
      jumpRef.current = null
      setState((s) =>
        reducePresenter(s, target === null ? { type: 'next' } : { type: 'goto', index: target }),
      )
      return
    }
    setState((s) => reducePresenter(s, key))
  }, [closeBoard])

  const endPresentation = useCallback(() => {
    post({ type: 'end' })
    closeSlideWindow()
    void navigate(`/deck/${deckId}`, { replace: true })
  }, [post, navigate, deckId])

  // The listeners below outlive renders; they call whatever is current.
  const keyRef = useRef<(key: ForwardedKey | { type: 'exit' }) => void>(() => {})
  useEffect(() => {
    keyRef.current = (key) => {
      if (key.type !== 'exit') return handleKey(key)
      // A clicker's one button alternates F5 and Esc: a single Esc must not close the projector.
      const at = Date.now()
      if (confirmsExit(lastExitRef.current, at)) return endPresentation()
      lastExitRef.current = at
      setExitPending(true)
      window.clearTimeout(exitTimerRef.current)
      exitTimerRef.current = window.setTimeout(() => {
        lastExitRef.current = null
        setExitPending(false)
      }, EXIT_CONFIRM_MS)
    }
  }, [handleKey, endPresentation])

  useEffect(() => () => window.clearTimeout(exitTimerRef.current), [])

  // The channel to the slide window.
  useEffect(() => {
    lastHeardRef.current = null
    connectingSinceRef.current = Date.now()
    if (typeof BroadcastChannel === 'undefined') return
    const channel = new BroadcastChannel(channelName(session))
    channelRef.current = channel

    channel.onmessage = (event: MessageEvent) => {
      const message = parseScreenMessage(event.data)
      if (!message) return
      switch (message.type) {
        case 'hello': {
          lastHeardRef.current = Date.now()
          setScreen('open')
          channel.postMessage({ type: 'deck', deck } satisfies ConsoleMessage)
          const s = stateRef.current
          channel.postMessage({
            type: 'state',
            index: s.index,
            black: s.black,
            ended: s.ended,
            board: boardRef.current,
          } satisfies ConsoleMessage)
          channel.postMessage({ type: 'boardView', view: boardViewRef.current } satisfies ConsoleMessage)
          channel.postMessage({ type: 'ink', ink: inkRef.current } satisfies ConsoleMessage)
          break
        }
        case 'alive':
          lastHeardRef.current = Date.now()
          setScreen('open')
          break
        case 'key':
          keyRef.current(message.key)
          break
        case 'bye':
          setScreen('closed')
          break
      }
    }

    channel.postMessage({ type: 'ping' } satisfies ConsoleMessage)
    const onPageHide = () => channel.postMessage({ type: 'bye' } satisfies ConsoleMessage)
    window.addEventListener('pagehide', onPageHide)

    return () => {
      window.removeEventListener('pagehide', onPageHide)
      channel.postMessage({ type: 'bye' } satisfies ConsoleMessage)
      channel.close()
      channelRef.current = null
    }
  }, [session, deck])

  // Ctrl+Z and Ctrl+Shift+Z (or Ctrl+Y) undo and redo the ink on the slide on screen.
  const undoKeyRef = useRef<(direction: 'undo' | 'redo') => void>(() => {})
  useEffect(() => {
    undoKeyRef.current = (direction) => {
      if (cardId) stepInk(cardId, direction)
    }
  }, [cardId, stepInk])

  // Local keys go through the same handler as the projector's.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target
      const inField =
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')
      if (e.key === 'Escape' && toolMenuRef.current) {
        e.preventDefault()
        setToolMenu(null)
        return
      }
      const undoKey = inkUndoKey(e)
      if (undoKey && !inField) {
        e.preventDefault()
        undoKeyRef.current(undoKey)
        return
      }
      const intent = presenterKeyIntent({
        key: e.key,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        altKey: e.altKey,
        inField,
      })
      if (!intent) return
      // Enter and Space on a focused button or link press it, not the slide.
      const onControl =
        target instanceof Element && target.closest('button, a[href], [role="button"]') !== null
      if (leavesKeyToBrowser(e.key, onControl)) return
      e.preventDefault()
      if (intent.type === 'fullscreen') return
      keyRef.current(intent)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // One second tick: the slide window's silence.
  useEffect(() => {
    const timer = window.setInterval(() => {
      const at = Date.now()
      setScreen((current) =>
        nextScreenLink(current, at, lastHeardRef.current, connectingSinceRef.current),
      )
    }, 1000)
    return () => window.clearInterval(timer)
  }, [])

  const openScreen = useCallback(() => {
    const win = openSlideWindow(deckId, session)
    lastHeardRef.current = null
    connectingSinceRef.current = Date.now()
    setScreen(win ? 'connecting' : 'blocked')
  }, [deckId, session])

  return (
    <PresenterConsoleView
      deck={deck}
      state={state}
      noteSize={noteSize}
      screen={screen}
      exitPending={exitPending}
      onPrev={() => {
        closeBoard()
        setState((s) => reducePresenter(s, { type: 'prev' }))
      }}
      onNext={() => {
        closeBoard()
        setState((s) => reducePresenter(s, { type: 'next' }))
      }}
      onToggleBlack={() => setState((s) => reducePresenter(s, { type: 'toggleBlack' }))}
      onNotesSmaller={() => setNoteSize((n) => Math.max(0, n - 1))}
      onNotesLarger={() => setNoteSize((n) => Math.min(NOTE_SIZES.length - 1, n + 1))}
      onOpenScreen={openScreen}
      onEnd={endPresentation}
      pen={pen}
      onTool={(tool) => {
        if (tool !== 'text') finishEdit()
        setPen((p) => ({ ...p, tool }))
      }}
      onColor={(color) =>
        setPen((p) => (p.tool === 'highlighter' ? { ...p, highlighterColor: color } : { ...p, penColor: color }))
      }
      onPenChange={(patch) => setPen((p) => ({ ...p, ...patch }))}
      toolMenu={toolMenu}
      onToolMenu={setToolMenu}
      hasInk={cardId !== null && slideHasInk(ink, cardId)}
      onClearSlide={() => {
        finishEdit()
        if (cardId) changeInk(cardId, (i) => clearLiveSlide(i, cardId))
      }}
      canUndo={cardId !== null && canUndoInk(history, cardId)}
      canRedo={cardId !== null && canRedoInk(history, cardId)}
      onUndo={() => {
        finishEdit()
        if (cardId) stepInk(cardId, 'undo')
      }}
      onRedo={() => {
        finishEdit()
        if (cardId) stepInk(cardId, 'redo')
      }}
      board={boardUp}
      boardItems={ink[WHITEBOARD_ID]}
      onToggleBoard={toggleBoard}
      typing={boardUp ? typing : null}
      boardView={boardView}
      onBoardView={setBoardView}
      drawing={drawing}
      onLaserPoint={laserPoint}
    />
  )
}

/** The teacher's half of the two-window presenter view. */
export function PresenterConsole({
  deckId,
  session,
  start,
}: {
  deckId: string
  session: string
  start: number
}) {
  const presentationId = usePresentationStore((s) => s.presentationId)
  const status = usePresentationStore((s) => s.status)
  const loadError = usePresentationStore((s) => s.loadError)
  const title = usePresentationStore((s) => s.title)
  const theme = usePresentationStore((s) => s.theme)
  const textStyle = usePresentationStore((s) => s.textStyle)
  const cards = usePresentationStore((s) => s.cards)
  const loadDeck = usePresentationStore((s) => s.loadDeck)

  useEffect(() => {
    void loadDeck(deckId)
  }, [deckId, loadDeck])

  if (loadError?.deckId === deckId) {
    return <DeckLoadError error={loadError} onRetry={() => void loadDeck(deckId)} />
  }
  if (presentationId !== deckId || status === 'loading') {
    return <div className="p-8 text-app-muted">Loading…</div>
  }

  // `ConsoleRunner` keeps the first snapshot it is given.
  const sorted = [...cards].sort((a, b) => a.orderIndex - b.orderIndex)
  return (
    <ConsoleRunner
      key={`${deckId}:${session}`}
      deckId={deckId}
      session={session}
      start={start}
      initialDeck={{ title, theme, textStyle, cards: sorted }}
    />
  )
}
