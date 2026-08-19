import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { ThemeToggle } from '@/components/ui/ThemeToggle'

export function TopBar({
  title,
  onTitleChange,
  presentationId,
  saveStatus,
  themeOpen,
  onToggleTheme,
}: {
  title: string
  onTitleChange: (title: string) => void
  presentationId: string
  saveStatus: 'idle' | 'loading' | 'saving' | 'error'
  themeOpen: boolean
  onToggleTheme: () => void
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
        <ThemeToggle />
        <Button
          variant="secondary"
          onClick={onToggleTheme}
          className={themeOpen ? 'border-app-accent text-app-accent' : ''}
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
