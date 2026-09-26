import type { ReactNode } from 'react'
import { EDITOR_TOOLS, type EditorTool } from '@/engine/editorTool'
import { CONTENT_OPTIONS, type ContentType } from '@/engine/newContent'
import type { PenSettings } from '@/engine/penSettings'
import { ToolbarMenu } from './ToolbarMenu'
import { PenPopover } from './PenPopover'
import { ShapePopover } from './ShapePopover'
import type { ShapeSettings } from '@/engine/shapes'

/** The levels the text tool offers: the headings and body text, from the shared "Add content" list. */
const TEXT_LEVELS: readonly ContentType[] = ['h1', 'h2', 'h3', 'body']
const TEXT_ITEMS = CONTENT_OPTIONS.filter((option) => TEXT_LEVELS.includes(option.type)).map((option) => ({
  id: option.type,
  label: option.label,
  description: option.description,
}))
const TOOL_ITEMS = EDITOR_TOOLS.map((tool) => ({ id: tool.id, label: tool.label }))

/**
 * The floating toolbar over the canvas: history, the arrow tool (Select elements
 * or Move screen) and the text tool.
 *
 * App chrome, not part of the deck. It lives outside the scrolling canvas, so it
 * neither scrolls away nor counts as "the empty canvas" a press deselects on.
 * The pen and shapes buttons are present when the page gives them their state.
 */
export function EditorToolbar({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  tool,
  onToolChange,
  onAddText,
  pen,
  shapes,
}: {
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  tool: EditorTool
  onToolChange: (tool: EditorTool) => void
  /** Appends text of a level to the selected slide; absent while no slide is selected. */
  onAddText?: (type: ContentType) => void
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
  const activeTool = EDITOR_TOOLS.find((entry) => entry.id === tool) ?? EDITOR_TOOLS[0]

  return (
    <div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex justify-center">
      <div
        role="toolbar"
        aria-label="Editing tools"
        className="pointer-events-auto flex items-center gap-0.5 rounded-app border border-app-border bg-app-background p-1 shadow-app"
      >
        <PlainButton label="Undo" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={onUndo}>
          <UndoIcon />
        </PlainButton>
        <PlainButton label="Redo" title="Redo (Ctrl+Shift+Z)" disabled={!canRedo} onClick={onRedo}>
          <UndoIcon flip />
        </PlainButton>

        <Divider />

        <ToolbarMenu
          hover
          label={`Tool: ${activeTool.label}`}
          title={activeTool.label}
          icon={tool === 'pan' ? <HandIcon /> : <CursorIcon />}
          items={TOOL_ITEMS}
          activeId={tool}
          onPick={(id) => onToolChange(id as EditorTool)}
        />
        <ToolbarMenu
          label="Text"
          title={onAddText ? 'Add text' : 'Select a slide first'}
          icon={<TextIcon />}
          items={TEXT_ITEMS}
          disabled={!onAddText}
          onPick={(id) => onAddText?.(id as ContentType)}
        />
        {pen && (
          <ToolbarMenu
            label="Pen"
            title="Draw (pen, marker, eraser)"
            icon={<PenIcon />}
            pressed={tool === 'pen'}
            onTrigger={() => onToolChange('pen')}
            panel={<PenPopover {...pen} />}
          />
        )}
        {shapes && (
          <ToolbarMenu
            label="Shapes"
            title="Draw a shape"
            icon={<ShapesIcon />}
            pressed={tool === 'shape'}
            onTrigger={() => onToolChange('shape')}
            panel={<ShapePopover {...shapes} />}
          />
        )}
      </div>
    </div>
  )
}

function Divider() {
  return <span aria-hidden="true" className="mx-1 h-5 w-px bg-app-border" />
}

/** A plain icon button. Refuses focus on mousedown so a text caret survives the click. */
function PlainButton({
  label,
  title,
  disabled,
  onClick,
  children,
}: {
  label: string
  title: string
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={title}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-[6px] text-app-foreground/90 transition-colors hover:bg-app-foreground/10 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-app-accent disabled:cursor-not-allowed disabled:opacity-40"
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

/* One glyph for both directions: redo is the same arrow mirrored. */
function UndoIcon({ flip }: { flip?: boolean }) {
  return (
    <svg {...strokeProps} style={flip ? { transform: 'scaleX(-1)' } : undefined}>
      <path d="M4 9h8.5a3.5 3.5 0 0 1 0 7H8" />
      <path d="M7 5.5 3.5 9 7 12.5" />
    </svg>
  )
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

function TextIcon() {
  return (
    <svg {...strokeProps}>
      <path d="M4.5 6V4.5h11V6M10 4.5v11M8 15.5h4" />
    </svg>
  )
}
