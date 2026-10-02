import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { PercentField } from '@/components/editor/PercentField'
import { MAX_ZOOM, MIN_ZOOM } from '@/lib/zoom'
import { AccountMenu, ExportMenu } from '@/components/editor/TopBarMenus'

/**
 * The editor's top bar. Left: home and the deck title. Right: zoom, the Export menu (PowerPoint, script, quiz), Present and the account menu.
 *
 * The Edit / Narrate modes are not here: they sit above the tools panel they
 * switch (`ModeTabs`). Undo and redo are not here either: they lead the
 * floating toolbar.
 */
export function TopBar({
  title,
  onTitleChange,
  saveStatus,
  zoom,
  onZoomChange,
  onExport,
  exporting,
  canExport,
  onExportScript,
  scriptDisabledReason,
  presentHref,
  onQuiz,
  quizDisabledReason,
  accountName,
  accountType,
  onProfileSettings,
  quizStrip,
  exportHighlight,
}: {
  title: string
  onTitleChange: (title: string) => void
  saveStatus: 'idle' | 'loading' | 'saving' | 'error'
  zoom: number
  /** The requested zoom, or `null` with a direction to step it; the page clamps. */
  onZoomChange: (zoom: number | null, direction?: 1 | -1) => void
  onExport: () => void
  exporting: boolean
  canExport: boolean
  onExportScript: () => void
  /** Why there is no narration script to export, or `null` when there is. */
  scriptDisabledReason: string | null
  presentHref: string
  onQuiz: () => void
  /** Why a quiz cannot be made right now, or `null` when it can. */
  quizDisabledReason: string | null
  accountName: string
  /** The account type in words, shown under the name. */
  accountType: string
  onProfileSettings: () => void
  /** The background quiz job's progress, drawn after the save status. */
  quizStrip?: ReactNode
  /** A finished quiz the user has not opened yet: rings the Export trigger. */
  exportHighlight?: boolean
}) {
  return (
    // The title's side is the flexible one: it takes what the right group leaves, and wraps.
    <div className="flex items-center justify-between gap-4 border-b border-app-border bg-app-background px-4 py-2">
      <div className="flex min-w-0 flex-1 items-center gap-3">
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

        {/*
          The title is exactly as wide as its words, and wraps onto another line
          when the column runs out — never clipped, never scrolled sideways. An
          input can do neither, so the invisible span is what takes the room (it
          sizes and wraps like any text) and the textarea is laid over it, where
          it wraps at the same width because it shares the span's box and type.
          The only flexible thing in this row, so it is what gives way.
        */}
        <div className="relative min-w-0 text-base leading-snug font-semibold">
          <span
            aria-hidden="true"
            className="invisible block min-w-16 border border-transparent px-2 py-1 break-words whitespace-pre-wrap"
          >
            {/* The trailing space keeps a line that ends in one from collapsing. */}
            {title}{' '}
          </span>
          <textarea
            rows={1}
            value={title}
            // One title, however many lines it is drawn on: no line breaks in it.
            onChange={(e) => onTitleChange(e.target.value.replace(/[\r\n]+/g, ' '))}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return
              e.preventDefault()
              e.currentTarget.blur()
            }}
            aria-label="Presentation title"
            title={title}
            className="absolute inset-0 size-full resize-none overflow-hidden rounded-app-sm border border-transparent bg-transparent px-2 py-1 break-words whitespace-pre-wrap text-app-foreground outline-none transition-colors hover:border-app-border focus:border-app-accent"
          />
        </div>

        {/* The failed case is red rather than muted grey: it is the one value
            here that is not a progress note. The reason is on the banner below. */}
        <span
          className={`shrink-0 text-xs ${saveStatus === 'error' ? 'font-medium text-red-600 dark:text-red-400' : 'text-app-muted'}`}
        >
          {saveStatus === 'saving' && 'Saving…'}
          {saveStatus === 'error' && 'Not saved'}
        </span>
        {quizStrip}
      </div>

      <div className="flex shrink-0 items-center justify-end gap-2">
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
        </div>

        <span aria-hidden="true" className="h-5 w-px bg-app-border" />

        <ExportMenu
          onExportPptx={onExport}
          exporting={exporting}
          canExport={canExport}
          onExportScript={onExportScript}
          scriptDisabledReason={scriptDisabledReason}
          onQuiz={onQuiz}
          quizDisabledReason={quizDisabledReason}
          highlight={exportHighlight}
          highlightQuiz={exportHighlight}
        />
        {/* A link, not a button, because it navigates. */}
        <Link
          to={presentHref}
          aria-label="Present"
          title="Present this deck"
          className={`flex size-8 shrink-0 items-center justify-center rounded-[6px] text-app-foreground/90 transition-colors hover:bg-app-foreground/10 ${FOCUS_RING}`}
        >
          <PlayIcon />
        </Link>
        <AccountMenu name={accountName} accountType={accountType} onProfileSettings={onProfileSettings} />
      </div>
    </div>
  )
}

const FOCUS_RING = 'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-app-accent'

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

function PlayIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="size-4">
      <path d="M6 4.5v11l9-5.5-9-5.5Z" />
    </svg>
  )
}
