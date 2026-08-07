import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

export function TopBar({
  title,
  onTitleChange,
  presentationId,
  saveStatus,
  outlineOpen,
  themeOpen,
  onToggleOutline,
  onToggleTheme,
  onOpenSettings,
}: {
  title: string
  onTitleChange: (title: string) => void
  presentationId: string
  saveStatus: 'idle' | 'loading' | 'saving' | 'error'
  outlineOpen: boolean
  themeOpen: boolean
  onToggleOutline: () => void
  onToggleTheme: () => void
  onOpenSettings: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-app-border bg-app-background px-4 py-3">
      <div className="flex items-center gap-3">
        <Link to="/" className="text-sm text-app-muted hover:text-app-foreground">
          ← Home
        </Link>
        <Button
          variant="ghost"
          onClick={onToggleOutline}
          className={outlineOpen ? 'bg-app-surface text-app-accent' : ''}
        >
          Outline
        </Button>
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
        <Button
          variant="secondary"
          onClick={onToggleTheme}
          className={themeOpen ? 'border-app-accent text-app-accent' : ''}
        >
          Theme
        </Button>
        <Button variant="secondary" onClick={onOpenSettings}>
          Settings
        </Button>
        <Link to={`/deck/${presentationId}/present`} target="_blank" rel="noreferrer">
          <Button variant="primary">Present</Button>
        </Link>
      </div>
    </div>
  )
}
