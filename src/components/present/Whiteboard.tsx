import { useContext, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { FittedSlide } from '@/components/theme/FittedSlide'
import { SlideBody } from '@/components/layouts/SlideBody'
import { CardBoxContext, SLIDE_BODY_ATTR } from '@/components/layouts/adjustContext'
import { DrawingContext, type CardDrawing } from '@/components/editor/drawingContext'
import { contentFraction, inkColor } from '@/engine/overlay'
import { isLiveText, type LiveItem, type LiveText } from '@/present/liveInk'
import { SLIDE_WIDTH_PX } from '@/lib/slideSize'
import { DEFAULT_BOARD_VIEW, isBoardPanPress, panBoard, wheelZoomFactor, zoomBoardAt, type BoardView } from '@/present/boardView'

/*
  The presenter view's whiteboard: a blank white page in place of the slide, on
  the console and the projector alike. It is drawn through `SlideBody`, so the
  pen, highlighter, eraser and laser work on it exactly as on a slide, at the
  same 976px layout width and the same fractions-of-width coordinates.

  Typed text is the board's own: placed with the Text tool, edited in place on
  the console, mirrored on the projector as it is typed.

  The board is infinite: the page is a window (`BoardView`) onto it. The whole
  `SlideBody` is moved and scaled by one CSS transform, so every press already
  lands in board coordinates (`contentFraction` reads the transformed box) and
  ink, text and the laser need no change. The pen reaches the whole page
  (`BOARD_BLEED_PX`) since the board does not end at the box.
*/

/** Past the content box, the pen and the Text tool still take a press this far out: the whole board. */
export const BOARD_BLEED_PX = 100_000

/** The dot grid's pitch at zoom 1, in layout px; it moves and scales with the board so a pan can be seen. */
const DOT_PITCH_PX = 24

/** A text's widest line before it wraps, as a fraction of the page width. */
const TEXT_MAX_WIDTH = 0.8

/** "Text colour" on the white page: the theme's foreground could be light, so the board pins a dark ink. */
const BOARD_INK = '#1f2937'

/** What the console passes to type on the board; the projector passes none. */
export interface BoardTyping {
  /** The text tool is active: a press places or picks text instead of drawing. */
  active: boolean
  /** The text being edited, if any. */
  editingId: string | null
  /** A press on empty board, at this point (fractions of the content width). */
  onPlace: (point: [number, number]) => void
  onEdit: (id: string) => void
  onChange: (id: string, text: string) => void
  onDone: (id: string) => void
}

export function Whiteboard({
  items,
  drawing,
  typing = null,
  view = DEFAULT_BOARD_VIEW,
  onView,
  pannable = false,
}: {
  items: readonly LiveItem[] | undefined
  drawing: CardDrawing | null
  typing?: BoardTyping | null
  view?: BoardView
  /** Given on the console only: the wheel zooms, and a drag pans. */
  onView?: (view: BoardView) => void
  /** A plain left drag pans (the Pointer tool); right, middle and Ctrl+left always do (`isBoardPanPress`). */
  pannable?: boolean
}) {
  const texts = (items ?? []).filter(isLiveText)
  const page = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number; width: number; view: BoardView } | null>(null)
  const [dragging, setDragging] = useState(false)
  // The listeners below outlive renders; they read whatever is current.
  const latest = useRef({ view, onView })
  useEffect(() => {
    latest.current = { view, onView }
  }, [view, onView])

  // The wheel zooms about the pointer. A native listener, since React's is passive and cannot stop the page scrolling.
  const zoomable = onView !== undefined
  useEffect(() => {
    const node = page.current
    if (!node || !zoomable) return
    function onWheel(e: WheelEvent) {
      const rect = node!.getBoundingClientRect()
      if (rect.width <= 0) return
      e.preventDefault()
      const { view: current, onView: set } = latest.current
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY
      const anchor: [number, number] = [(e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.width]
      set?.(zoomBoardAt(current, anchor, wheelZoomFactor(delta)))
    }
    node.addEventListener('wheel', onWheel, { passive: false })
    return () => node.removeEventListener('wheel', onWheel)
  }, [zoomable])

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (!onView || !isBoardPanPress(e, pannable)) return
    const rect = e.currentTarget.getBoundingClientRect()
    if (rect.width <= 0) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, width: rect.width, view }
    setDragging(true)
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const d = drag.current
    if (!d || !onView) return
    onView(panBoard(d.view, (e.clientX - d.x) / d.width, (e.clientY - d.y) / d.width))
  }

  function endDrag() {
    drag.current = null
    setDragging(false)
  }

  const scale = view.zoom
  const shiftX = -view.x * SLIDE_WIDTH_PX
  const shiftY = -view.y * SLIDE_WIDTH_PX
  const pitch = DOT_PITCH_PX * scale
  const dots: CSSProperties =
    pitch >= 8
      ? {
          backgroundImage: 'radial-gradient(circle, #cbd5e1 1.1px, transparent 1.6px)',
          backgroundSize: `${pitch}px ${pitch}px`,
          backgroundPosition: `${shiftX * scale}px ${shiftY * scale}px`,
        }
      : {}

  return (
    <FittedSlide>
      <DrawingContext.Provider value={drawing}>
        <div
          ref={page}
          data-whiteboard
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          // The middle button's autoscroll and the right button's menu must not start: both drag the board.
          onAuxClick={onView ? (e) => e.preventDefault() : undefined}
          onContextMenu={onView ? (e) => e.preventDefault() : undefined}
          className="relative aspect-video w-full overflow-clip rounded-slide bg-white shadow-slide-card"
          style={{
            '--slide-foreground': BOARD_INK,
            ...dots,
            cursor: dragging ? 'grabbing' : onView && pannable ? 'grab' : undefined,
            touchAction: 'none',
          } as CSSProperties}
        >
          {/* The board itself: one page-sized box, moved and scaled to the view. */}
          <div
            data-board-world
            className="absolute top-0 left-0 flex aspect-video w-full origin-top-left flex-col"
            style={{ transform: `scale(${scale}) translate(${shiftX}px, ${shiftY}px)` }}
          >
            <SlideBody card={{}}>
              <BoardText texts={texts} typing={typing} />
            </SlideBody>
          </div>
        </div>
      </DrawingContext.Provider>
    </FittedSlide>
  )
}

function BoardText({ texts, typing }: { texts: readonly LiveText[]; typing: BoardTyping | null }) {
  const width = useContext(CardBoxContext)?.width ?? 0
  const active = typing?.active ?? false

  function place(e: ReactPointerEvent<HTMLDivElement>) {
    // Ctrl+left drags the board instead (it reaches the page's own handler).
    if (!typing || e.button !== 0 || e.ctrlKey) return
    // Keep focus where it is until the new text's own field takes it.
    e.preventDefault()
    // Measured on the board's box, not this (much larger) surface, so the point is in board units.
    const rect = e.currentTarget.closest(`[${SLIDE_BODY_ATTR}]`)?.getBoundingClientRect()
    if (!rect) return
    if (rect.width <= 0) return
    typing.onPlace(contentFraction({ x: e.clientX, y: e.clientY }, rect))
  }

  return (
    <>
      {active && (
        <div
          aria-hidden="true"
          data-board-type-surface
          onPointerDown={place}
          className="absolute z-30"
          style={{ inset: -BOARD_BLEED_PX, cursor: 'text', touchAction: 'none' }}
        />
      )}
      {width > 0 &&
        texts.map((t) => {
          const style: CSSProperties = {
            position: 'absolute',
            left: t.x * width,
            top: t.y * width,
            maxWidth: TEXT_MAX_WIDTH * width,
            fontSize: t.size * width,
            lineHeight: 1.25,
            color: inkColor(t.color),
            whiteSpace: 'pre-wrap',
            overflowWrap: 'anywhere',
            zIndex: 40,
          }
          if (typing && typing.editingId === t.id) {
            return (
              <textarea
                key={t.id}
                autoFocus
                aria-label="Text on the whiteboard"
                value={t.text}
                rows={1}
                onChange={(e) => typing.onChange(t.id, e.target.value)}
                onBlur={() => typing.onDone(t.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') e.currentTarget.blur()
                }}
                className="resize-none border-0 bg-transparent p-0 font-sans outline-2 outline-offset-4 outline-dashed outline-sky-500/70"
                style={{ ...style, fieldSizing: 'content', minWidth: t.size * width * 2 } as CSSProperties}
              />
            )
          }
          return (
            <div
              key={t.id}
              data-board-text
              onPointerDown={
                active
                  ? (e) => {
                      if (e.button !== 0 || e.ctrlKey) return
                      e.preventDefault()
                      e.stopPropagation()
                      typing?.onEdit(t.id)
                    }
                  : undefined
              }
              className="font-sans"
              style={{ ...style, cursor: active ? 'text' : undefined, pointerEvents: active ? 'auto' : 'none' }}
            >
              {t.text}
            </div>
          )
        })}
    </>
  )
}
