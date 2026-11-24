import { useEffect, useRef, useState } from 'react'
import { ThemeProvider } from '@/components/theme/ThemeProvider'
import { SlideStage } from '@/components/theme/SlideStage'
import { FittedSlide } from '@/components/theme/FittedSlide'
import { PresentSlide } from '@/components/present/PresentSlide'
import { presentDrawing } from '@/components/present/presentDrawing'
import { useLaserTrail } from '@/components/present/useLaserTrail'
import { Whiteboard } from '@/components/present/Whiteboard'
import type { Stroke } from '@/engine/overlay'
import { WHITEBOARD_ID, type LaserPoint, type LiveInk } from '@/present/liveInk'
import { DEFAULT_BOARD_VIEW, type BoardView } from '@/present/boardView'
import { presenterKeyIntent } from '@/present/keys'
import {
  ALIVE_INTERVAL_MS,
  ORPHAN_AFTER_MS,
  channelName,
  parseConsoleMessage,
  type DeckSnapshot,
  type ScreenMessage,
  type ShownState,
} from '@/present/protocol'

/** `gone` means the console said bye or end. */
export type ScreenPhase = 'waiting' | 'orphan' | 'live' | 'gone'

/** The pointer is hidden after this long without moving. */
export const CURSOR_HIDE_MS = 3000

function Message({ children }: { children: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center p-8 text-center text-xl text-white/80">
      {children}
    </div>
  )
}

/** What the console has drawn: finished ink, the stroke being drawn, and the laser, each on one slide. */
export interface ScreenInk {
  ink: LiveInk
  live: { cardId: string; stroke: Stroke } | null
  laser: { cardId: string; trail: readonly LaserPoint[] } | null
  /** Where the console has the whiteboard panned and zoomed to. */
  view?: BoardView
}

const NO_INK: ScreenInk = { ink: {}, live: null, laser: null }

function liveContent(deck: DeckSnapshot | null, shown: ShownState | null, drawn: ScreenInk) {
  if (!deck || !shown) return <Message>Waiting for the presenter…</Message>
  if (shown.black) return null
  if (shown.ended) return <Message>End of presentation</Message>
  const card = deck.cards[shown.index]
  if (!card) return <Message>End of presentation</Message>
  // The whiteboard stands in for the slide, with its own ink.
  const inkId = shown.board ? WHITEBOARD_ID : card.id
  const strokes = [...(drawn.ink[inkId] ?? []), ...(drawn.live?.cardId === inkId ? [drawn.live.stroke] : [])]
  const drawing = presentDrawing({
    strokes,
    laser: drawn.laser?.cardId === inkId ? drawn.laser.trail : undefined,
  })
  if (shown.board) {
    return (
      <ThemeProvider theme={deck.theme}>
        <SlideStage className="h-full w-full">
          <div className="relative h-full min-h-0 w-full min-w-0">
            <Whiteboard items={drawn.ink[WHITEBOARD_ID]} drawing={drawing} view={drawn.view ?? DEFAULT_BOARD_VIEW} />
          </div>
        </SlideStage>
      </ThemeProvider>
    )
  }
  return (
    <ThemeProvider theme={deck.theme}>
      <SlideStage className="h-full w-full">
        <div className="relative h-full min-h-0 w-full min-w-0">
          <FittedSlide>
            <PresentSlide card={card} textStyle={deck.textStyle} isFirstCard={shown.index === 0} drawing={drawing} />
          </FittedSlide>
        </div>
      </SlideStage>
    </ThemeProvider>
  )
}

/** The projector window's picture: pure, so each state can be rendered in a test. */
export function SlideWindowView({
  phase,
  deck,
  shown,
  showFullscreenHint,
  drawn = NO_INK,
}: {
  phase: ScreenPhase
  deck: DeckSnapshot | null
  shown: ShownState | null
  showFullscreenHint: boolean
  /** The console's live ink and laser. */
  drawn?: ScreenInk
}) {
  let content
  if (phase === 'waiting') content = <Message>Waiting for the presenter…</Message>
  else if (phase === 'orphan') {
    content = <Message>Open Presenter view from the editor to use this window.</Message>
  } else if (phase === 'gone') content = <Message>Presentation ended</Message>
  else content = liveContent(deck, shown, drawn)

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black">
      {content}
      {showFullscreenHint && (
        <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs text-white">
          Click or press F for full screen
        </div>
      )}
    </div>
  )
}

function toggleFullscreen() {
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {})
  } else {
    document.documentElement.requestFullscreen().catch(() => {})
  }
}

/** The projector window of the two-window presenter view. Never reads Supabase. */
export function SlideWindow({ session }: { session: string | null }) {
  const [phase, setPhase] = useState<ScreenPhase>(session ? 'waiting' : 'orphan')
  const [deck, setDeck] = useState<DeckSnapshot | null>(null)
  const [shown, setShown] = useState<ShownState | null>(null)
  const [showFullscreenHint, setShowFullscreenHint] = useState(true)
  const [cursorHidden, setCursorHidden] = useState(false)
  const channelRef = useRef<BroadcastChannel | null>(null)
  const gotDeckRef = useRef(false)
  const [ink, setInk] = useState<LiveInk>({})
  const [live, setLive] = useState<ScreenInk['live']>(null)
  const [laserCard, setLaserCard] = useState<string | null>(null)
  const [laser, moveLaser] = useLaserTrail()
  const [boardView, setBoardView] = useState<BoardView>(DEFAULT_BOARD_VIEW)

  useEffect(() => {
    if (!session || typeof BroadcastChannel === 'undefined') return
    const channel = new BroadcastChannel(channelName(session))
    channelRef.current = channel
    const post = (message: ScreenMessage) => channel.postMessage(message)

    channel.onmessage = (event: MessageEvent) => {
      const message = parseConsoleMessage(event.data)
      if (!message) return
      switch (message.type) {
        case 'ping':
          post({ type: 'hello' })
          break
        case 'deck':
          gotDeckRef.current = true
          setDeck(message.deck)
          setPhase('live')
          break
        case 'state':
          setShown({ index: message.index, black: message.black, ended: message.ended, board: message.board })
          setPhase('live')
          break
        case 'ink':
          setInk(message.ink)
          break
        case 'inkLive':
          setLive(message.stroke ? { cardId: message.cardId, stroke: message.stroke } : null)
          break
        case 'laser':
          setLaserCard(message.point ? message.cardId : null)
          moveLaser(message.point)
          break
        case 'boardView':
          setBoardView(message.view)
          break
        case 'bye':
          setPhase('gone')
          break
        case 'end':
          // The browser may refuse to close a window it did not script-open.
          window.close()
          setPhase('gone')
          break
      }
    }

    post({ type: 'hello' })
    const alive = window.setInterval(() => post({ type: 'alive' }), ALIVE_INTERVAL_MS)
    const orphan = window.setTimeout(() => {
      if (!gotDeckRef.current) setPhase('orphan')
    }, ORPHAN_AFTER_MS)
    const onPageHide = () => post({ type: 'bye' })
    window.addEventListener('pagehide', onPageHide)

    return () => {
      window.clearInterval(alive)
      window.clearTimeout(orphan)
      window.removeEventListener('pagehide', onPageHide)
      channel.close()
      channelRef.current = null
    }
  }, [session, moveLaser])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const intent = presenterKeyIntent({
        key: e.key,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        altKey: e.altKey,
        inField: false,
      })
      if (!intent) return
      e.preventDefault()
      if (intent.type === 'exit') return
      if (intent.type === 'fullscreen') {
        toggleFullscreen()
        return
      }
      channelRef.current?.postMessage({ type: 'key', key: intent } satisfies ScreenMessage)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    function onFullscreenChange() {
      if (document.fullscreenElement) setShowFullscreenHint(false)
    }
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
  }, [])

  // Hide the pointer after a pause; any movement brings it back.
  useEffect(() => {
    let timer = window.setTimeout(() => setCursorHidden(true), CURSOR_HIDE_MS)
    function onMove() {
      setCursorHidden(false)
      window.clearTimeout(timer)
      timer = window.setTimeout(() => setCursorHidden(true), CURSOR_HIDE_MS)
    }
    window.addEventListener('pointermove', onMove)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('pointermove', onMove)
    }
  }, [])

  return (
    <div
      onClick={() => {
        if (!document.fullscreenElement) toggleFullscreen()
      }}
      style={cursorHidden ? { cursor: 'none' } : undefined}
    >
      <SlideWindowView
        phase={phase}
        deck={deck}
        shown={shown}
        showFullscreenHint={showFullscreenHint}
        drawn={{ ink, live, laser: laserCard ? { cardId: laserCard, trail: laser } : null, view: boardView }}
      />
    </div>
  )
}
