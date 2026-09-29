import type { ReactNode } from 'react'
import type { EditorTool } from '@/engine/editorTool'
import type { ContentType } from '@/engine/newContent'
import type { PenSettings } from '@/engine/penSettings'
import { ToolbarMenu } from './ToolbarMenu'
import { LayoutMenu, type LayoutTools } from './LayoutPicker'
import { ContentGrid } from './ContentPicker'
import { PenPopover } from './PenPopover'
import { ShapePopover } from './ShapePopover'
import type { ShapeSettings } from '@/engine/shapes'
import type { EditorGrid } from './gridContext'

/**
 * The floating toolbar over the canvas. Icons only; each is named in a tooltip
 * under it on hover or keyboard focus.
 *
 * Always: Select, Move (the hand), Pen, Shapes, then the grid's two view settings,
 * Show grid and Snap to grid (the magnet). Between them, by what is selected:
 *
 * - **Slide** (nothing picked, or a whole slide; given by `slide`): the slide
 *   number in front. After Move come Layout and Insert (headings, body text and
 *   every other element), only while a slide is actually selected — with nothing selected there is no slide
 *   to act on.
 * - **Element** (an element picked on the slide): nothing more.
 *
 * App chrome, not part of the deck. It lives outside the scrolling canvas, so it
 * neither scrolls away nor counts as "the empty canvas" a press deselects on.
 * The pen and shapes buttons are present when the page gives them their state.
 */
export function EditorToolbar({
  tool,
  onToolChange,
  slide,
  grid,
  onGridChange,
  pen,
  shapes,
}: {
  tool: EditorTool
  onToolChange: (tool: EditorTool) => void
  /**
   * Present while no element is picked: shows the slide set instead of the element
   * set. `number` is 1-based and absent for an empty deck. `layout` and
   * `onAddContent` are given only while a slide is selected.
   */
  slide?: {
    number?: number
    total: number
    layout?: LayoutTools
    onAddContent?: (type: ContentType) => void
  }
  /** The grid's view settings: shown or not, and whether drops snap to it. */
  grid: EditorGrid
  onGridChange: (grid: EditorGrid) => void
  /** The drawing tool: its settings and what its popover can do. Absent = no pen button. */
  pen?: {
    settings: PenSettings
    onChange: (patch: Partial<PenSettings>) => void
    hasTemporaryHere: boolean
    hasTemporary: boolean
    onClearSlide: () => void
    onClearAll: () => void
    atLimit: boolean
  }
  /** The shape tool: its settings, the ink it shares with the pen, and the slide-full note. Absent = no shapes button. */
  shapes?: {
    settings: ShapeSettings
    onChange: (patch: Partial<ShapeSettings>) => void
    ink: Pick<PenSettings, 'color' | 'keep'>
    onInkChange: (patch: Partial<Pick<PenSettings, 'color' | 'keep'>>) => void
    atLimit: boolean
  }
}) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex justify-center">
      <div
        role="toolbar"
        aria-label="Editing tools"
        className="pointer-events-auto flex items-center gap-0.5 rounded-app border border-app-border bg-app-background p-1 shadow-app"
      >
        {slide && (
          <>
            <span
              aria-label={slide.number ? `Slide ${slide.number} of ${slide.total}` : 'No slides'}
              className="flex h-8 items-center gap-1.5 px-2 text-xs font-medium tabular-nums text-app-foreground/90"
            >
              <SlideIcon />
              {slide.number ? `${slide.number} / ${slide.total}` : '–'}
            </span>
            <Divider />
          </>
        )}

        <Tip name="Select">
          <ToolButton label="Select" pressed={tool === 'select'} onClick={() => onToolChange('select')}>
            <CursorIcon />
          </ToolButton>
        </Tip>
        <Tip name="Move">
          <ToolButton label="Move" pressed={tool === 'pan'} onClick={() => onToolChange('pan')}>
            <HandIcon />
          </ToolButton>
        </Tip>

        {slide && (
          <>
            {slide.layout && (
              <Tip name="Layout">
                <ToolbarMenu
                  label="Layout"
                  title=""
                  icon={<LayoutIcon />}
                  panel={<LayoutMenu layout={slide.layout} />}
                />
              </Tip>
            )}
            {slide.onAddContent && (
              <Tip name="Insert">
                <ToolbarMenu
                  label="Insert"
                  title=""
                  icon={<ContentIcon />}
                  panel={<ContentGrid onPick={slide.onAddContent} />}
                />
              </Tip>
            )}
          </>
        )}

        {pen && (
          <Tip name="Pen">
            <ToolbarMenu
              label="Pen"
              title=""
              icon={<PenIcon />}
              pressed={tool === 'pen'}
              onTrigger={() => onToolChange('pen')}
              panel={<PenPopover {...pen} />}
            />
          </Tip>
        )}
        {shapes && (
          <Tip name="Shapes">
            <ToolbarMenu
              label="Shapes"
              title=""
              icon={<ShapesIcon />}
              pressed={tool === 'shape'}
              onTrigger={() => onToolChange('shape')}
              panel={<ShapePopover {...shapes} />}
            />
          </Tip>
        )}

        <Divider />

        <Tip name="Show grid">
          <ToolButton label="Show grid" pressed={grid.show} onClick={() => onGridChange({ ...grid, show: !grid.show })}>
            <GridIcon />
          </ToolButton>
        </Tip>
        <Tip name="Snap to grid">
          <ToolButton label="Snap to grid" pressed={grid.snap} onClick={() => onGridChange({ ...grid, snap: !grid.snap })}>
            <MagnetIcon />
          </ToolButton>
        </Tip>
      </div>
    </div>
  )
}

function Divider() {
  return <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-app-border" />
}

/**
 * The name under a button while it is hovered or focused. Hidden while the
 * button's own menu is open, which opens on the same side.
 */
function Tip({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="group relative">
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-full z-30 mt-2 -translate-x-1/2 whitespace-nowrap rounded-[5px] bg-app-foreground px-2 py-1 text-[11px] font-medium text-app-background opacity-0 shadow-app transition-opacity delay-150 group-focus-within:opacity-100 group-hover:opacity-100 group-has-[[aria-expanded=true]]:hidden"
      >
        {name}
      </span>
    </div>
  )
}

/** A plain icon button; `pressed` makes it a toggle. Refuses focus on mousedown so a text caret survives the click. */
function ToolButton({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string
  pressed?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-[6px] text-app-foreground/90 transition-colors hover:bg-app-foreground/10 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-app-accent ${
        pressed ? 'bg-app-foreground/15' : ''
      }`}
    >
      {children}
    </button>
  )
}

/* Inline SVG on `currentColor`, like the tools panel's icons. */

const strokeProps = {
  viewBox: '0 0 20 20',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  className: 'size-[18px]',
}

function CursorIcon() {
  return (
    <svg {...strokeProps}>
      <path d="M5 3.5v12l3.2-3.1 2.3 4.6 2.1-1-2.3-4.5H15L5 3.5Z" />
    </svg>
  )
}

function HandIcon() {
  return (
    <svg {...strokeProps}>
      <path d="M7 10V4.8a1.1 1.1 0 0 1 2.2 0V9m0-.5V3.8a1.1 1.1 0 0 1 2.2 0V9m0-.7V4.8a1.1 1.1 0 0 1 2.2 0V11m0-3a1.1 1.1 0 0 1 2.2 0v3.5A5.2 5.2 0 0 1 10.4 17H9.8a5 5 0 0 1-4-2L3.7 12a1.1 1.1 0 0 1 1.8-1.3L7 12.4" />
    </svg>
  )
}

function PenIcon() {
  return (
    <svg {...strokeProps}>
      <path d="m12.5 4.5 3 3-8 8H4.5v-3l8-8Z" />
      <path d="m11 6 3 3" />
    </svg>
  )
}

function ShapesIcon() {
  return (
    <svg {...strokeProps}>
      <rect x="3" y="8" width="9" height="9" rx="1" />
      <circle cx="13" cy="7" r="4.5" />
    </svg>
  )
}

function SlideIcon() {
  return (
    <svg {...strokeProps} className="size-4">
      <rect x="3" y="4.5" width="14" height="11" rx="1.5" />
    </svg>
  )
}

function LayoutIcon() {
  return (
    <svg {...strokeProps}>
      <rect x="3" y="4" width="14" height="12" rx="1.5" />
      <path d="M3 8h14M9 8v8" />
    </svg>
  )
}

function ContentIcon() {
  return (
    <svg {...strokeProps}>
      <rect x="3" y="3" width="6" height="6" rx="1" />
      <rect x="11" y="3" width="6" height="6" rx="1" />
      <rect x="3" y="11" width="6" height="6" rx="1" />
      <path d="M14 11v6M11 14h6" />
    </svg>
  )
}

function GridIcon() {
  return (
    <svg {...strokeProps}>
      <rect x="3.5" y="3.5" width="13" height="13" rx="1.5" />
      <path d="M3.5 7.8h13M3.5 12.2h13M7.8 3.5v13M12.2 3.5v13" />
    </svg>
  )
}

function MagnetIcon() {
  return (
    <svg {...strokeProps}>
      <path d="M5 3.5h3v6.5a2 2 0 0 0 4 0V3.5h3V10a5 5 0 0 1-10 0V3.5Z" />
      <path d="M5 6.5h3M12 6.5h3" />
    </svg>
  )
}
