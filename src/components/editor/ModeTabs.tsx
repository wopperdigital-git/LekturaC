import type { ReactNode } from 'react'
import type { PanelTab } from '@/components/editor/ToolsPanel'

const FOCUS_RING = 'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-app-accent'

/**
 * The editor's two modes, Edit and Narrate, as a row above the tools panel.
 *
 * They are the panel's tabs, kept outside it so the panel itself stays a list of
 * properties: they carry the ids its tabpanels are labelled by (`tools-tab-design`
 * / `-narration`), and sit directly on top of the thing they switch.
 */
export function ModeTabs({ tab, onTabChange }: { tab: PanelTab; onTabChange: (tab: PanelTab) => void }) {
  return (
    <div
      role="tablist"
      aria-label="Mode"
      className="flex shrink-0 items-center gap-0.5 rounded-app border border-app-border bg-app-surface p-0.5"
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
  )
}

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
      // Radius: the tray's less its 2px padding, so the chip's corners follow the tray's.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`flex h-8 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[calc(var(--app-radius)-2px)] px-2.5 text-sm font-medium transition-colors ${FOCUS_RING} ${
        selected
          ? 'bg-app-background text-app-foreground ring-1 ring-app-border'
          : 'text-app-muted hover:text-app-foreground'
      }`}
    >
      {icon}
      {children}
    </button>
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
