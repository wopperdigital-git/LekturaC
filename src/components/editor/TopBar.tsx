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
  onExport,
  exporting,
  canExport,
}: {
  title: string
  onTitleChange: (title: string) => void
  presentationId: string
  saveStatus: 'idle' | 'loading' | 'saving' | 'error'
  onExport: () => void
  exporting: boolean
  canExport: boolean
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
        {/* The failed case is red rather than muted grey: it is the one value
            here that is not a progress note. The reason itself is on the
            banner below the bar. */}
        <span
          className={`text-xs ${saveStatus === 'error' ? 'font-medium text-red-600 dark:text-red-400' : 'text-app-muted'}`}
        >
          {saveStatus === 'saving' && 'Saving…'}
          {saveStatus === 'error' && 'Not saved'}
        </span>
        <Button
          variant="secondary"
          onClick={onExport}
          loading={exporting}
          disabled={!canExport}
          title={canExport ? 'Download this deck as a PowerPoint file' : 'Nothing to export yet'}
        >
          Export
        </Button>
        <ThemeToggle />
        <Link to={`/deck/${presentationId}/narrate`}>
          <Button variant="primary">Narrate PPT</Button>
        </Link>
      </div>
    </div>
  )
}
