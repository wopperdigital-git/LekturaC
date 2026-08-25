import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { ThemeToggle } from '@/components/ui/ThemeToggle'

/** The editor docks one panel at a time on the right; `null` means none is open. */
export type RightPanel = 'theme' | null

export function TopBar({
  title,
  onTitleChange,
  presentationId,
  saveStatus,
}: {
  title: string
  onTitleChange: (title: string) => void
  presentationId: string
  saveStatus: 'idle' | 'loading' | 'saving' | 'error'
}) {
  return (
    /*
      Three columns rather than `justify-between`, because Present has to sit at
      the true centre of the bar. With two flex groups the middle item lands at
      whatever point the two side groups happen to leave it, which drifts as the
      title or the save status changes width. The `1fr` side columns make the
      `auto` middle one genuinely centred instead.
    */
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-app-border bg-app-background px-4 py-3">
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
      <div className="flex justify-center">
        <Link to={`/deck/${presentationId}/present`}>
          <Button variant="primary">Present</Button>
        </Link>
      </div>

      <div className="flex items-center justify-end gap-2">
        <span className="text-xs text-app-muted">
          {saveStatus === 'saving' && 'Saving…'}
          {saveStatus === 'error' && 'Save failed'}
        </span>
        {/* Undo/redo used to live here; they moved into the floating
            EditorToolbar, next to the other editing verbs. */}
        <ThemeToggle />
        {/* TODO: no behaviour yet — the narration feature this fronts hasn't
            been built. Kept non-interactive rather than wired to a silent no-op
            so it can't read as broken: a button that visibly does nothing on
            click is worse than one that says it isn't ready. */}
        <Button variant="primary" disabled title="Narration isn't available yet">
          Narrate PPT
        </Button>
      </div>
    </div>
  )
}
