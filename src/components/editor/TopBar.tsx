import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { ThemeToggle } from '@/components/ui/ThemeToggle'

/** The editor docks one panel at a time on the right; `null` means none is open. */
export type RightPanel = 'theme' | 'script' | null

export function TopBar({
  title,
  onTitleChange,
  presentationId,
  saveStatus,
  rightPanel,
  onToggleRightPanel,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: {
  title: string
  onTitleChange: (title: string) => void
  presentationId: string
  saveStatus: 'idle' | 'loading' | 'saving' | 'error'
  rightPanel: RightPanel
  onToggleRightPanel: (panel: Exclude<RightPanel, null>) => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-app-border bg-app-background px-4 py-3">
      <div className="flex items-center gap-3">
        <Link
          to="/"
          className="rounded-app-sm text-sm text-app-muted transition-colors hover:text-app-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent"
        >
          ← Home
        </Link>
        <Input
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          className="w-64 border-transparent bg-transparent px-1 text-base font-semibold hover:border-app-border focus:border-app-accent"
        />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-app-muted">
          {saveStatus === 'saving' && 'Saving…'}
          {saveStatus === 'error' && 'Save failed'}
        </span>
        <HistoryButton
          onClick={onUndo}
          disabled={!canUndo}
          label="Undo"
          hint="Undo (Ctrl+Z)"
          flip={false}
        />
        <HistoryButton
          onClick={onRedo}
          disabled={!canRedo}
          label="Redo"
          hint="Redo (Ctrl+Shift+Z)"
          flip
        />
        <ThemeToggle />
        <Button
          variant="secondary"
          onClick={() => onToggleRightPanel('script')}
          aria-pressed={rightPanel === 'script'}
          className={rightPanel === 'script' ? 'border-app-accent text-app-accent' : ''}
        >
          Script
        </Button>
        <Button
          variant="secondary"
          onClick={() => onToggleRightPanel('theme')}
          aria-pressed={rightPanel === 'theme'}
          className={rightPanel === 'theme' ? 'border-app-accent text-app-accent' : ''}
        >
          Theme
        </Button>
        <Link to={`/deck/${presentationId}/present`}>
          <Button variant="primary">Present</Button>
        </Link>
      </div>
    </div>
  )
}

function HistoryButton({
  onClick,
  disabled,
  label,
  hint,
  flip,
}: {
  onClick: () => void
  disabled: boolean
  label: string
  hint: string
  flip: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={hint}
      className="flex size-9 cursor-pointer items-center justify-center rounded-app-sm text-app-muted transition-colors hover:bg-app-surface hover:text-app-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-app-muted"
    >
      <svg
        className="size-4"
        style={flip ? { transform: 'scaleX(-1)' } : undefined}
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M4 9h8.5a3.5 3.5 0 0 1 0 7H8" />
        <path d="M7 5.5 3.5 9 7 12.5" />
      </svg>
    </button>
  )
}
