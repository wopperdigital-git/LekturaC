import type { MouseEvent } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePresentationStore } from '@/store/presentationStore'
import { ThemeProvider } from '@/components/theme/ThemeProvider'
import { SlideStage } from '@/components/theme/SlideStage'
import { FittedSlide } from '@/components/theme/FittedSlide'
import { PresentSlide } from '@/components/present/PresentSlide'
import { DeckLoadError } from '@/components/editor/DeckLoadError'
import {
  commitJump,
  initialPresenterState,
  reducePresenter,
  typeDigit,
  type JumpBuffer,
  type PresenterState,
} from '@/present/presenterState'
import { confirmsExit, EXIT_CONFIRM_MS, leavesKeyToBrowser, presenterKeyIntent } from '@/present/keys'
import {
  channelName,
  nextScreenLink,
  parseScreenMessage,
  type ConsoleMessage,
  type DeckSnapshot,
  type ForwardedKey,
  type ScreenLink,
} from '@/present/protocol'
import { loadSession, restoreState, saveSession } from '@/present/session'
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
}

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
        <section className="relative min-h-0 min-w-0 flex-1">
          <ThemeProvider theme={deck.theme}>
            <SlideStage className="h-full w-full overflow-hidden rounded-app">
              {state.ended ? (
                <div className="flex h-full w-full items-center justify-center bg-black text-xl text-white">
                  End of presentation
                </div>
              ) : (
                <div className="relative h-full min-h-0 w-full min-w-0">
                  <FittedSlide>
                    <PresentSlide card={card} textStyle={deck.textStyle} isFirstCard={index === 0} />
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
    post({ type: 'state', index: state.index, black: state.black, ended: state.ended })
  }, [state, post])

  // One handler for the projector's forwarded keys and this window's own.
  const handleKey = useCallback((key: ForwardedKey) => {
    const at = Date.now()
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
  }, [])

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
          } satisfies ConsoleMessage)
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

  // Local keys go through the same handler as the projector's.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target
      const inField =
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')
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
      onPrev={() => setState((s) => reducePresenter(s, { type: 'prev' }))}
      onNext={() => setState((s) => reducePresenter(s, { type: 'next' }))}
      onToggleBlack={() => setState((s) => reducePresenter(s, { type: 'toggleBlack' }))}
      onNotesSmaller={() => setNoteSize((n) => Math.max(0, n - 1))}
      onNotesLarger={() => setNoteSize((n) => Math.min(NOTE_SIZES.length - 1, n + 1))}
      onOpenScreen={openScreen}
      onEnd={endPresentation}
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
