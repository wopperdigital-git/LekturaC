import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Spinner } from '@/components/ui/Spinner'

/*
  The top bar's two dropdowns: Create & export (the things a deck can be turned into) and
  the account menu. Small popovers hung under their trigger, right-aligned since
  both sit at the bar's right end. They close on an outside press, on Escape and
  on a pick.

  `defaultOpen` exists for the render tests (no jsdom, so nothing can click the
  trigger): it is only the initial state.
*/

const FOCUS_RING = 'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-app-accent'

function Dropdown({
  label,
  title,
  trigger,
  triggerClassName,
  defaultOpen = false,
  align = 'end',
  children,
}: {
  /** The trigger's accessible name, and the popover's. */
  label: string
  /** Which edge of the trigger the popover lines up with: the right (top bar) or the left. */
  align?: 'start' | 'end'
  title?: string
  trigger: ReactNode
  triggerClassName: string
  defaultOpen?: boolean
  /** The popover's content; `close` is for an item to call once picked. */
  children: (close: () => void) => ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  const root = useRef<HTMLDivElement>(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      // The editor's own Escape stands down for a key a dropdown already used.
      e.preventDefault()
      setOpen(false)
    }
    // Capture phase, like the toolbar's menus: the canvas's pan hook stops presses
    // in its own capture phase, which a bubble listener would never hear.
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  return (
    <div ref={root} className="relative shrink-0">
      <button
        type="button"
        aria-label={label}
        title={title ?? label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        // Never take focus from a text run being edited.
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((current) => !current)}
        className={`${triggerClassName} ${FOCUS_RING} ${open ? 'bg-app-foreground/15' : ''}`}
      >
        {trigger}
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          className={`absolute ${align === 'end' ? 'right-0' : 'left-0'} top-full z-30 mt-1.5 min-w-52 rounded-app-sm border border-app-border bg-app-background p-1 shadow-app`}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

function MenuItem({
  icon,
  disabled,
  title,
  onClick,
  className,
  children,
}: {
  icon: ReactNode
  disabled?: boolean
  className?: string
  /** Why it is disabled, as a tooltip. */
  title?: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`flex h-8 w-full cursor-pointer items-center gap-2 rounded-[5px] px-2 text-left text-sm text-app-foreground transition-colors hover:bg-app-foreground/10 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent ${FOCUS_RING}${className ? ` ${className}` : ''}`}
    >
      <span aria-hidden="true" className="flex size-4 shrink-0 items-center justify-center text-app-foreground/80">
        {icon}
      </span>
      {children}
    </button>
  )
}

/** A captioned run of menu items. The caption is for sight; the group's name carries it for a screen reader. */
function MenuGroup({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={caption}>
      <p aria-hidden="true" className="px-2 pt-1.5 pb-1 text-[11px] font-semibold text-app-muted">
        {caption}
      </p>
      {children}
    </div>
  )
}

/**
 * Everything a deck turns into, under one labelled button: what can be made from it
 * (a quiz, a narrated video) and then what can be downloaded (PowerPoint, the
 * narration script). Making comes first because those were the hard ones to find
 * when this was an icon-only "Export" menu. Each item that cannot run right now is
 * disabled with the reason as its tooltip. The trigger's glyph becomes a spinner
 * while the PowerPoint file is built.
 */
export function ExportMenu({
  onExportPptx,
  exporting,
  canExport,
  onExportScript,
  scriptDisabledReason,
  onQuiz,
  quizDisabledReason,
  onVideo,
  videoDisabledReason,
  defaultOpen,
  highlight,
  highlightQuiz,
  align,
}: {
  onExportPptx: () => void
  exporting: boolean
  canExport: boolean
  onExportScript: () => void
  /** Why there is no script to export, or `null` when there is. */
  scriptDisabledReason: string | null
  onQuiz: () => void
  /** Why a quiz cannot be made right now, or `null` when it can. */
  quizDisabledReason: string | null
  /** Opens the narrated video dialog. */
  onVideo: () => void
  /** Why a video cannot be made right now, or `null` when it can. */
  videoDisabledReason: string | null
  defaultOpen?: boolean
  /** Rings the trigger: something new is inside. */
  highlight?: boolean
  /** Marks the Quiz item: a quiz finished and has not been opened. */
  highlightQuiz?: boolean
  /** The popover opens to the right of a trigger at the left of the screen (the phone view). */
  align?: 'start' | 'end'
}) {
  return (
    <Dropdown
      label="Create & export"
      align={align}
      trigger={
        <>
          {exporting ? <Spinner /> : <DownloadIcon />}
          Create &amp; export
          <svg {...stroke} className="size-3.5 text-app-muted">
            <path d="M5 8l5 5 5-5" />
          </svg>
        </>
      }
      triggerClassName={`flex h-8 cursor-pointer items-center gap-1.5 rounded-[6px] px-2 text-sm font-medium whitespace-nowrap text-app-foreground/90 transition-colors hover:bg-app-foreground/10${highlight ? ' ring-2 ring-amber-400 ring-offset-1 ring-offset-app-background' : ''}`}
      defaultOpen={defaultOpen}
    >
      {(close) => (
        <>
          <MenuGroup caption="Make from this deck">
            <MenuItem
              icon={<QuizIcon />}
              disabled={quizDisabledReason !== null}
              title={quizDisabledReason ?? 'Make a quiz from these slides'}
              className={highlightQuiz ? 'bg-amber-400/15 font-medium' : undefined}
              onClick={() => {
                close()
                onQuiz()
              }}
            >
              Quiz…
              {highlightQuiz && <span aria-hidden className="ml-auto size-2 rounded-full bg-amber-400" />}
            </MenuItem>
            <MenuItem
              icon={<VideoIcon />}
              disabled={videoDisabledReason !== null}
              title={videoDisabledReason ?? 'Pick a voice and make a video of the deck read aloud'}
              onClick={() => {
                close()
                onVideo()
              }}
            >
              Narrated video…
            </MenuItem>
          </MenuGroup>
          <div aria-hidden="true" className="my-1 h-px bg-app-border" />
          <MenuGroup caption="Download">
            <MenuItem
              icon={<SlidesIcon />}
              disabled={!canExport || exporting}
              title={!canExport ? 'Nothing to export yet' : 'Download as PowerPoint (.pptx)'}
              onClick={() => {
                close()
                onExportPptx()
              }}
            >
              PowerPoint (.pptx)
            </MenuItem>
            <MenuItem
              icon={<ScriptIcon />}
              disabled={scriptDisabledReason !== null}
              title={scriptDisabledReason ?? 'Download the narration scripts as a text file'}
              onClick={() => {
                close()
                onExportScript()
              }}
            >
              Narration script (.txt)
            </MenuItem>
          </MenuGroup>
        </>
      )}
    </Dropdown>
  )
}

/**
 * The signed-in account: an avatar with a down arrow that opens who it is (name,
 * with the account type under it) and the way into the profile settings.
 */
export function AccountMenu({
  name,
  accountType,
  onProfileSettings,
  defaultOpen,
}: {
  name: string
  /** The account type in words ("Teacher"), or a dash when it could not be read. */
  accountType: string
  onProfileSettings: () => void
  defaultOpen?: boolean
}) {
  return (
    <Dropdown
      label="Account"
      title={name}
      trigger={
        <>
          <Avatar name={name} />
          <svg {...stroke} className="size-3.5 text-app-muted">
            <path d="M5 8l5 5 5-5" />
          </svg>
        </>
      }
      triggerClassName="flex h-9 cursor-pointer items-center gap-1 rounded-full pr-1.5 pl-0.5 transition-colors hover:bg-app-foreground/10"
      defaultOpen={defaultOpen}
    >
      {(close) => (
        <>
          <div className="flex items-center gap-2.5 px-2 py-2">
            <Avatar name={name} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-app-foreground">{name}</p>
              <p className="truncate text-xs text-app-muted">{accountType}</p>
            </div>
          </div>
          <div aria-hidden="true" className="my-1 h-px bg-app-border" />
          <MenuItem
            icon={<PersonIcon />}
            onClick={() => {
              close()
              onProfileSettings()
            }}
          >
            Profile settings
          </MenuItem>
        </>
      )}
    </Dropdown>
  )
}

function Avatar({ name }: { name: string }) {
  return (
    <span
      aria-hidden="true"
      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-app-accent text-sm font-semibold text-white uppercase"
    >
      {name.trim().charAt(0) || '?'}
    </span>
  )
}

/* Inline SVG on `currentColor`, like the top bar's icons. */

const stroke = {
  viewBox: '0 0 20 20',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

function DownloadIcon() {
  return (
    <svg {...stroke} className="size-[18px]">
      <path d="M10 3.5v9M6 8.75l4 4 4-4M4 16.5h12" />
    </svg>
  )
}

function SlidesIcon() {
  return (
    <svg {...stroke} className="size-4">
      <rect x="3" y="4.5" width="14" height="9.5" rx="1.5" />
      <path d="M10 14v3M7 17h6" />
    </svg>
  )
}

function ScriptIcon() {
  return (
    <svg {...stroke} className="size-4">
      <path d="M5.5 3h6.5l3 3v11h-9.5z" />
      <path d="M8 9.5h4.5M8 12.5h4.5" />
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

function VideoIcon() {
  return (
    <svg {...stroke} className="size-4">
      <rect x="2.5" y="5" width="11" height="10" rx="1.5" />
      <path d="M13.5 8.5l4-2.5v8l-4-2.5" />
    </svg>
  )
}

function PersonIcon() {
  return (
    <svg {...stroke} className="size-4">
      <circle cx="10" cy="7" r="3.5" />
      <path d="M4 17c0-3.3 2.7-6 6-6s6 2.7 6 6" />
    </svg>
  )
}
