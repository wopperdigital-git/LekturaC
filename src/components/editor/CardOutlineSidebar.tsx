import { useLayoutEffect, useRef, useState } from 'react'
import { DndContext, closestCenter, type DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Card } from '@/engine/contentBlocks'
import type { ThemeTokens } from '@/lib/theme-tokens'
import { ThemeProvider } from '@/components/theme/ThemeProvider'
import { LayoutRenderer } from '@/components/layouts/LayoutRenderer'
import { SlideBody } from '@/components/layouts/SlideBody'
import { SlideSurface } from '@/components/theme/SlideSurface'
import { SlideStage } from '@/components/theme/SlideStage'
import { TextStyleScope } from '@/components/theme/TextStyleScope'
import { mergeTextStyle, type TextStyle } from '@/engine/textStyle'

// Live-scaled preview: the real layout is rendered at full slide width inside an
// offscreen box, then shrunk with a CSS transform — always in sync with the
// actual card, no screenshot/canvas capture needed.
const THUMB_BASE_WIDTH = 800
// Cards size to their content (no fixed aspect ratio — see CardCanvas), so the
// thumbnail can't assume 16:9 either. This is only the pre-measurement guess
// used for the very first layout pass.
const THUMB_FALLBACK_HEIGHT = (THUMB_BASE_WIDTH * 9) / 16
// A long card would otherwise tower over its neighbours in the rail, so past
// this height it gets zoomed out further rather than cropped.
const THUMB_MAX_DISPLAY_HEIGHT = 200
// Only reached if the frame reports a zero width (measurement happens in a
// layout effect, i.e. before paint), so this is a guard, not a visible state.
const THUMB_FALLBACK_DISPLAY_HEIGHT = 76

/*
  Fits the whole card into the rail's width — `contain`, not `cover`.

  The previous version forced the slide into a fixed 800x450 box and clipped the
  overflow, which cropped the bottom off any card with more than a screenful of
  content and cut the last words off long headings. Measuring the natural height
  instead means the thumbnail always shows the entire card at the card's own
  proportions; nothing is readable at this size anyway, and recognisable is what
  a thumbnail is for.
*/
function CardThumbnail({
  card,
  index,
  deckTextStyle,
}: {
  card: Card
  index: number
  deckTextStyle: TextStyle
}) {
  const frameRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [frameWidth, setFrameWidth] = useState(0)
  const [naturalHeight, setNaturalHeight] = useState(THUMB_FALLBACK_HEIGHT)

  useLayoutEffect(() => {
    const frame = frameRef.current
    const content = contentRef.current
    if (!frame || !content) return

    // Measure once up front rather than waiting on the observer's first
    // callback, which lands after paint and would flash a mis-sized frame.
    function measure() {
      if (!frame || !content) return
      setFrameWidth(frame.clientWidth)
      // offsetHeight is the pre-transform layout box, so the scale we apply
      // below can't feed back into the measurement.
      setNaturalHeight(content.offsetHeight || THUMB_FALLBACK_HEIGHT)
    }
    measure()

    // Content height moves after mount too — late webfonts, a theme swap that
    // changes the spacing multiplier — so keep watching both boxes.
    const observer = new ResizeObserver(measure)
    observer.observe(frame)
    observer.observe(content)
    return () => observer.disconnect()
  }, [])

  const scale =
    frameWidth > 0
      ? Math.min(frameWidth / THUMB_BASE_WIDTH, THUMB_MAX_DISPLAY_HEIGHT / naturalHeight)
      : 0
  const displayHeight = scale > 0 ? naturalHeight * scale : THUMB_FALLBACK_DISPLAY_HEIGHT
  // Centre the card when the height cap made it narrower than the rail.
  const offsetX = Math.max(0, (frameWidth - THUMB_BASE_WIDTH * scale) / 2)

  return (
    <div
      ref={frameRef}
      className="relative w-full overflow-hidden rounded-slide bg-slide-background shadow-slide"
      style={{ height: displayHeight }}
    >
      {/* Rendered at full slide width and shrunk with a transform, so the
          backdrop's stars and rings scale with everything else instead of
          needing their own thumbnail-sized values. */}
      <div
        ref={contentRef}
        className="pointer-events-none absolute top-0 origin-top-left"
        style={{ left: offsetX, width: THUMB_BASE_WIDTH, transform: `scale(${scale})` }}
      >
        {/* A miniature of the real canvas: themed stage behind, solid card
            floating on it. The inset padding is what lets the backdrop show
            around the card — without it the stage would be completely covered
            and every theme would look identical in the rail. */}
        <SlideStage className="w-full p-10">
          {/* Same merged style as the canvas, so a Level 2 edit shows up in the
              rail immediately rather than only on the big card. */}
          <TextStyleScope style={mergeTextStyle(deckTextStyle, card.textStyle)}>
            <SlideSurface className="w-full rounded-slide p-8 shadow-slide-card sm:p-10">
              <SlideBody card={card}>
                <LayoutRenderer card={card} context={{ isFirstCard: index === 0 }} />
              </SlideBody>
            </SlideSurface>
          </TextStyleScope>
        </SlideStage>
      </div>
      <span className="absolute bottom-1.5 left-1.5 rounded-full bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
        {index + 1}
      </span>
    </div>
  )
}

function SortableRow({
  card,
  index,
  isActive,
  onSelect,
  onDelete,
  deckTextStyle,
}: {
  card: Card
  index: number
  isActive: boolean
  onSelect: () => void
  onDelete: () => void
  deckTextStyle: TextStyle
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
  })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className={`group relative overflow-hidden rounded-app-sm border-2 ${
        isActive ? 'border-app-accent' : 'border-transparent hover:border-app-border'
      }`}
    >
      {/* The whole thumbnail is the drag handle — press and hold to reorder,
          click to select. `w-full` is load-bearing: a button shrink-wraps its
          content even at `display: block`, so the thumbnail's own `w-full`
          would resolve against a zero-width parent and collapse the preview.

          `touch-manipulation` rather than `touch-none`: the rail scrolls, and
          taking touch-action away entirely would trap a finger swipe here
          instead of letting it scroll the list. The hold delay is what
          separates the two gestures. */}
      <button
        {...attributes}
        {...listeners}
        onClick={onSelect}
        className="block w-full cursor-pointer touch-manipulation text-left active:cursor-grabbing focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent"
      >
        <CardThumbnail card={card} index={index} deckTextStyle={deckTextStyle} />
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
        className="absolute right-1 top-1 cursor-pointer rounded bg-black/60 px-1.5 text-xs text-white opacity-0 transition-opacity hover:bg-red-600 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        aria-label="Delete card"
      >
        ✕
      </button>
    </div>
  )
}

export function CardOutlineSidebar({
  cards,
  theme,
  deckTextStyle,
  activeCardId,
  onSelect,
  onReorder,
  onDelete,
  onAddCard,
}: {
  cards: Card[]
  theme: ThemeTokens
  deckTextStyle: TextStyle
  activeCardId: string | null
  onSelect: (id: string) => void
  onReorder: (orderedIds: string[]) => void
  onDelete: (id: string) => void
  /** Opens the card type picker; the new slide lands after the active one. */
  onAddCard: () => void
}) {
  /*
    Press-and-hold to drag, rather than the old dedicated ⠿ handle.

    A delay constraint (not a distance one) is what makes this safe now that the
    entire thumbnail is the drag source: the rail is a scrolling list, so a
    distance constraint would turn every attempt to swipe the list into a card
    drag. Holding still for `delay` starts a drag; moving further than
    `tolerance` before that cancels it, leaving a plain click — which is what
    selects the card. dnd-kit swallows the trailing click once a drag actually
    starts, so a completed reorder never also selects.
  */
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { delay: 150, tolerance: 8 } }))
  const sorted = [...cards].sort((a, b) => a.orderIndex - b.orderIndex)

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = sorted.findIndex((c) => c.id === active.id)
    const newIndex = sorted.findIndex((c) => c.id === over.id)
    onReorder(arrayMove(sorted, oldIndex, newIndex).map((c) => c.id))
  }

  return (
    /*
      `scrollbar-gutter: stable` is load-bearing, not cosmetic.

      A thumbnail scales itself to the measured width of this container, so on a
      platform with classic (space-taking) scrollbars the rail had a feedback
      loop with no fixed point: the list overflows, its scrollbar appears, every
      thumbnail loses that width and shrinks, the list now fits, the scrollbar
      goes away, every thumbnail grows, the list overflows again — forever, at
      screen refresh rate. Whether a deck lands in that window is pure
      coincidence of card count and window height, which is why it looked
      random.

      Reserving the gutter whether or not it is used makes the content width
      constant, so a thumbnail's size no longer depends on whether the list
      happens to overflow. (No effect where scrollbars are overlays and take no
      space — those platforms never had the loop.)
    */
    <div className="scrollbar-subtle flex h-full flex-col gap-1.5 overflow-y-auto p-2 [scrollbar-gutter:stable]">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={sorted.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          <ThemeProvider theme={theme}>
            <div className="flex flex-col gap-1.5">
              {sorted.map((card, i) => (
                <SortableRow
                  key={card.id}
                  card={card}
                  index={i}
                  isActive={card.id === activeCardId}
                  onSelect={() => onSelect(card.id)}
                  onDelete={() => onDelete(card.id)}
                  deckTextStyle={deckTextStyle}
                />
              ))}
            </div>
          </ThemeProvider>
        </SortableContext>
      </DndContext>

      {/*
        Below the list rather than above it, because a new slide is added
        *after* the active card and the eye reads that as "and then one more".

        It carries a solid surface of its own, unlike everything else in this
        rail: the rail floats directly on the deck's themed stage, which is
        near-black under Deep Space and near-white under Moonlight, and app
        chrome text would have to lose one of those two. The thumbnails get
        away with it by being opaque slides.
      */}
      <button
        type="button"
        onClick={onAddCard}
        className="mt-0.5 flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-app-sm border border-app-border bg-app-background/95 py-2 text-xs font-medium text-app-foreground shadow-sm transition-colors hover:bg-app-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent"
      >
        <svg
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          aria-hidden="true"
          className="size-3.5"
        >
          <path d="M10 4.5v11M4.5 10h11" />
        </svg>
        Add slide
      </button>
    </div>
  )
}
