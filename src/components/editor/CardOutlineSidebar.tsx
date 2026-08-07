import { DndContext, closestCenter, type DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Card } from '@/engine/contentBlocks'
import type { ThemeTokens } from '@/lib/theme-tokens'
import { ThemeProvider } from '@/components/theme/ThemeProvider'
import { LayoutRenderer } from '@/components/layouts/LayoutRenderer'

// Live-scaled preview: the real layout is rendered at full size inside a fixed
// offscreen box, then shrunk with a CSS transform — always in sync with the
// actual card, no screenshot/canvas capture needed.
const THUMB_BASE_WIDTH = 800
const THUMB_BASE_HEIGHT = 450
const THUMB_DISPLAY_WIDTH = 184
const THUMB_SCALE = THUMB_DISPLAY_WIDTH / THUMB_BASE_WIDTH
const THUMB_DISPLAY_HEIGHT = THUMB_BASE_HEIGHT * THUMB_SCALE

function CardThumbnail({ card, index }: { card: Card; index: number }) {
  return (
    <div
      className="relative overflow-hidden rounded-app-sm bg-slide-background"
      style={{ width: THUMB_DISPLAY_WIDTH, height: THUMB_DISPLAY_HEIGHT }}
    >
      <div
        className="pointer-events-none absolute left-0 top-0 origin-top-left bg-slide-background p-10"
        style={{ width: THUMB_BASE_WIDTH, height: THUMB_BASE_HEIGHT, transform: `scale(${THUMB_SCALE})` }}
      >
        <LayoutRenderer card={card} context={{ isFirstCard: index === 0 }} />
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
}: {
  card: Card
  index: number
  isActive: boolean
  onSelect: () => void
  onDelete: () => void
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
      <button onClick={onSelect} className="block cursor-pointer">
        <CardThumbnail card={card} index={index} />
      </button>
      <button
        {...attributes}
        {...listeners}
        className="absolute left-1 top-1 cursor-grab touch-none rounded bg-black/60 px-1 text-xs text-white opacity-0 active:cursor-grabbing group-hover:opacity-100"
        aria-label="Drag to reorder"
      >
        ⠿
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
        className="absolute right-1 top-1 cursor-pointer rounded bg-black/60 px-1.5 text-xs text-white opacity-0 hover:bg-red-600 group-hover:opacity-100"
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
  activeCardId,
  onSelect,
  onReorder,
  onDelete,
}: {
  cards: Card[]
  theme: ThemeTokens
  activeCardId: string | null
  onSelect: (id: string) => void
  onReorder: (orderedIds: string[]) => void
  onDelete: (id: string) => void
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))
  const sorted = [...cards].sort((a, b) => a.orderIndex - b.orderIndex)

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = sorted.findIndex((c) => c.id === active.id)
    const newIndex = sorted.findIndex((c) => c.id === over.id)
    onReorder(arrayMove(sorted, oldIndex, newIndex).map((c) => c.id))
  }

  return (
    <div className="flex h-full flex-col gap-2 overflow-y-auto p-3">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={sorted.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          <ThemeProvider theme={theme}>
            <div className="flex flex-col gap-2">
              {sorted.map((card, i) => (
                <SortableRow
                  key={card.id}
                  card={card}
                  index={i}
                  isActive={card.id === activeCardId}
                  onSelect={() => onSelect(card.id)}
                  onDelete={() => onDelete(card.id)}
                />
              ))}
            </div>
          </ThemeProvider>
        </SortableContext>
      </DndContext>
    </div>
  )
}
