import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Input } from '@/components/ui/Input'
import { Spinner } from '@/components/ui/Spinner'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { PercentField } from '@/components/editor/PercentField'
import { MAX_ZOOM, MIN_ZOOM } from '@/lib/zoom'
import type { PanelTab } from '@/components/editor/ToolsPanel'

/**
 * The editor's top bar. Left: home, the logo, then the two modes (Edit and
 * Narrate pick the tools panel's tab) and history. Centre: the deck title.
 * Right: zoom, Export, Present and Generate quiz.
 *
 * Edit and Narrate are the tools panel's tabs, moved up here: they carry the ids
 * the panel's tabpanels are labelled by (`tools-tab-design` / `-narration`).
 */
export function TopBar({
  title,
  onTitleChange,
  saveStatus,
  tab,
  onTabChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  zoom,
  onZoomChange,
  onFit,
  onExport,
  exporting,
  canExport,
  presentHref,
  onQuiz,
  quizDisabledReason,
}: {
  title: string
  onTitleChange: (title: string) => void
  saveStatus: 'idle' | 'loading' | 'saving' | 'error'
  tab: PanelTab
  onTabChange: (tab: PanelTab) => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  zoom: number
  /** The requested zoom, or `null` with a direction to step it; the page clamps. */
  onZoomChange: (zoom: number | null, direction?: 1 | -1) => void
  onFit: () => void
  onExport: () => void
  exporting: boolean
  canExport: boolean
  presentHref: string
  onQuiz: () => void
  /** Why a quiz cannot be made right now, or `null` when it can. */
  quizDisabledReason: string | null
}) {
  return (
    /*
      Three columns rather than `justify-between`, so the title sits at the true
      centre of the bar: the `1fr` side columns leave the `auto` middle one
      centred whatever width the two side groups happen to have.
    */
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-app-border bg-app-background px-4 py-2">
      <div className="flex min-w-0 items-center gap-3">
        {/*
          An arrow alone, as a round button that nudges left on hover — the
          direction it takes you. The word "Home" is in the label for anyone who
          cannot see the arrow, and in the tooltip for anyone who is not sure what
          it does.
        */}
        <Link
          to="/"
          aria-label="Back to home"
          title="Back to home"
          className="group flex size-9 shrink-0 items-center justify-center rounded-full border border-app-border bg-app-surface text-app-foreground/80 transition-colors hover:border-app-accent/50 hover:bg-app-accent/15 hover:text-app-accent-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent"
        >
          <svg {...stroke} className="size-[18px] transition-transform duration-150 group-hover:-translate-x-0.5">
            <path d="M16 10H4.5M9.5 4.5L4 10l5.5 5.5" />
          </svg>
        </Link>

        {/* A placeholder: the logo goes here. */}
        <div
          aria-hidden="true"
          className="flex h-8 w-24 shrink-0 items-center justify-center rounded-app-sm border border-dashed border-app-border text-[10px] font-medium tracking-wide text-app-muted uppercase"
        >
          Logo
        </div>

        <div
          role="tablist"
          aria-label="Mode"
          className="flex shrink-0 items-center gap-0.5 rounded-app bg-app-surface p-0.5"
          onKeyDown={(e) => {
            // Two tabs, so either arrow just goes to the other one.
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
            e.preventDefault()
            const next: PanelTab = tab === 'design' ? 'narration' : 'design'
            onTabChange(next)
            document.getElementById(`tools-tab-${next}`)?.focus()
          }}
        >
          <ModeButton
            id="tools-tab-design"
            controls="tools-panel-design"
            selected={tab === 'design'}
            onClick={() => onTabChange('design')}
            icon={<EditIcon />}
          >
            Edit
          </ModeButton>
          <ModeButton
            id="tools-tab-narration"
            controls="tools-panel-narration"
            selected={tab === 'narration'}
            onClick={() => onTabChange('narration')}
            icon={<MicIcon />}
          >
            Narrate
          </ModeButton>
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <IconButton label="Undo" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={onUndo}>
            <UndoIcon />
          </IconButton>
          <IconButton label="Redo" title="Redo (Ctrl+Shift+Z)" disabled={!canRedo} onClick={onRedo}>
            <UndoIcon flip />
          </IconButton>
        </div>

        {/* The failed case is red rather than muted grey: it is the one value
            here that is not a progress note. The reason is on the banner below. */}
        <span
          className={`shrink-0 text-xs ${saveStatus === 'error' ? 'font-medium text-red-600 dark:text-red-400' : 'text-app-muted'}`}
        >
          {saveStatus === 'saving' && 'Saving…'}
          {saveStatus === 'error' && 'Not saved'}
        </span>
      </div>

      {/*
        The width lives on this wrapper, not on the input: the middle column is
        `auto` and `Input` is `w-full`, a percentage of a width that depends on
        it. A definite width here breaks the loop.
      */}
      <div className="w-[clamp(10rem,24vw,22rem)]">
        <Input
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          aria-label="Presentation title"
          title={title}
          className="border-transparent bg-transparent px-2 text-center text-base font-semibold hover:border-app-border focus:border-app-accent"
        />
      </div>

      <div className="flex min-w-0 items-center justify-end gap-2">
        <div className="flex items-center gap-0.5">
          <IconButton
            label="Zoom out"
            title="Zoom out (Ctrl+scroll down)"
            disabled={zoom <= MIN_ZOOM}
            onClick={() => onZoomChange(null, -1)}
          >
            <svg {...stroke} className="size-4">
              <path d="M5 10h10" />
            </svg>
          </IconButton>
          <PercentField compact label="Zoom" value={zoom} min={MIN_ZOOM} max={MAX_ZOOM} onCommit={(next) => onZoomChange(next)} />
          <IconButton
            label="Zoom in"
            title="Zoom in (Ctrl+scroll up)"
            disabled={zoom >= MAX_ZOOM}
            onClick={() => onZoomChange(null, 1)}
          >
            <svg {...stroke} className="size-4">
              <path d="M5 10h10M10 5v10" />
            </svg>
          </IconButton>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onFit}
            title="Fit the slides to the window width"
            className={`h-8 cursor-pointer rounded-[6px] px-2 text-xs font-medium text-app-foreground/90 transition-colors hover:bg-app-foreground/10 ${FOCUS_RING}`}
          >
            Fit
          </button>
        </div>

        <span aria-hidden="true" className="h-5 w-px bg-app-border" />

        {/* Icon only: the spinner replaces the glyph while the file is built. */}
        <IconButton
          label="Export as PowerPoint"
          title={canExport ? 'Export as PowerPoint (.pptx)' : 'Nothing to export yet'}
          disabled={!canExport || exporting}
          onClick={onExport}
        >
          {exporting ? <Spinner /> : <DownloadIcon />}
        </IconButton>
        {/* A link, not a button, because it navigates. */}
        <Link
          to={presentHref}
          title="Present this deck"
          className={`flex h-8 items-center gap-1.5 rounded-app-sm px-2.5 text-sm font-medium text-app-foreground transition-colors hover:bg-app-foreground/10 ${FOCUS_RING}`}
        >
          <PlayIcon />
          Present
        </Link>
        {/* Disabled, with the reason as its tooltip, without a Groq key or with
            no slide content to ask about. */}
        <button
          type="button"
          onClick={onQuiz}
          disabled={quizDisabledReason !== null}
          title={quizDisabledReason ?? 'Make a quiz from these slides'}
          className={`flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-app-sm bg-app-accent px-3 text-sm font-semibold text-white transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:brightness-100 ${FOCUS_RING}`}
        >
          <QuizIcon />
          Generate quiz
        </button>
        <ThemeToggle />
      </div>
    </div>
  )
}

const FOCUS_RING = 'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-app-accent'

/** Edit or Narrate: a tab of the tools panel. */
function ModeButton({
  id,
  controls,
  selected,
  onClick,
  icon,
  children,
}: {
  id: string
  controls: string
  selected: boolean
  onClick: () => void
  icon: ReactNode
  children: ReactNode
}) {
  return (
    <button
      type="button"
      id={id}
      role="tab"
      aria-selected={selected}
      aria-controls={controls}
      tabIndex={selected ? 0 : -1}
      // Never take focus from a text run being edited.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`flex h-8 cursor-pointer items-center gap-1.5 rounded-[6px] px-2.5 text-sm font-medium transition-colors ${FOCUS_RING} ${
        selected
          ? 'bg-app-background text-app-foreground shadow-app'
          : 'text-app-muted hover:text-app-foreground'
      }`}
    >
      {icon}
      {children}
    </button>
  )
}

/** A plain icon button. Refuses focus on mousedown so a text caret survives the click. */
function IconButton({
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
      className={`flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-[6px] text-app-foreground/90 transition-colors hover:bg-app-foreground/10 disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS_RING}`}
    >
      {children}
    </button>
  )
}

/* Inline SVG on `currentColor`, like the toolbar's icons. */

const stroke = {
  viewBox: '0 0 20 20',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

/* One glyph for both directions: redo is the same arrow mirrored. */
function UndoIcon({ flip }: { flip?: boolean }) {
  return (
    <svg {...stroke} className="size-[18px]" style={flip ? { transform: 'scaleX(-1)' } : undefined}>
      <path d="M4 9h8.5a3.5 3.5 0 0 1 0 7H8" />
      <path d="M7 5.5 3.5 9 7 12.5" />
    </svg>
  )
}

function EditIcon() {
  return (
    <svg {...stroke} className="size-4">
      <path d="m12.5 4.5 3 3-8 8H4.5v-3l8-8Z" />
    </svg>
  )
}

function MicIcon() {
  return (
    <svg {...stroke} className="size-4">
      <rect x="7.5" y="3" width="5" height="9" rx="2.5" />
      <path d="M5 10a5 5 0 0 0 10 0M10 15v2.5" />
    </svg>
  )
}

function DownloadIcon() {
  return (
    <svg {...stroke} className="size-[18px]">
      <path d="M10 3.5v9M6 8.75l4 4 4-4M4 16.5h12" />
    </svg>
  )
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="size-3.5">
      <path d="M6 4.5v11l9-5.5-9-5.5Z" />
    </svg>
  )
}

function QuizIcon() {
  return (
    <svg {...stroke} className="size-4">
      <rect x="3.5" y="3" width="13" height="14" rx="2" />
      <path d="M7 7.5h6M7 10.5h6M7 13.5h3.5" />
    </svg>
  )
}
