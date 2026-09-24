import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { ThemeToggle } from '@/components/ui/ThemeToggle'

export function TopBar({
  title,
  onTitleChange,
  presentationId,
  saveStatus,
  onExport,
  exporting,
  canExport,
  onQuiz,
  quizDisabledReason,
}: {
  title: string
  onTitleChange: (title: string) => void
  presentationId: string
  saveStatus: 'idle' | 'loading' | 'saving' | 'error'
  onExport: () => void
  exporting: boolean
  canExport: boolean
  onQuiz: () => void
  quizDisabledReason: string | null
}) {
  return (
    /*
      Three columns rather than `justify-between`, because the title has to sit at
      the true centre of the bar. With two flex groups the middle item lands at
      whatever point the two side groups happen to leave it, which drifts as the
      save status or the buttons on the right change width. The `1fr` side columns
      make the `auto` middle one genuinely centred instead.

      Present is not here: it lives in the floating toolbar, between Undo and Redo,
      where the editing verbs are.
    */
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-app-border bg-app-background px-4 py-3">
      <div className="flex items-center">
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
          className="group flex size-9 items-center justify-center rounded-full border border-app-border bg-app-surface text-app-foreground/80 transition-colors hover:border-app-accent/50 hover:bg-app-accent/15 hover:text-app-accent-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent"
        >
          <svg
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="size-[18px] transition-transform duration-150 group-hover:-translate-x-0.5"
          >
            <path d="M16 10H4.5M9.5 4.5L4 10l5.5 5.5" />
          </svg>
        </Link>
      </div>

      {/*
        The width lives on this wrapper, not on the input. The middle column is
        `auto`, so it is as wide as its content, and `Input` is `w-full` — a
        percentage of a width that depends on it. With nothing to anchor the loop
        the column collapsed to the input's bare intrinsic width and clipped the
        title. A definite width here breaks it: it grows with the window between
        a floor and a ceiling, and the input simply fills it.
      */}
      <div className="w-[clamp(12rem,36vw,28rem)]">
        <Input
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          aria-label="Presentation title"
          title={title}
          className="border-transparent bg-transparent px-2 text-center text-base font-semibold hover:border-app-border focus:border-app-accent"
        />
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
        {/* An icon alone: what it does is in the label and the tooltip. While the
            file is being built the spinner replaces the glyph, so the button
            keeps its size instead of jumping. */}
        <Button
          variant="secondary"
          onClick={onExport}
          loading={exporting}
          disabled={!canExport}
          aria-label="Export as PowerPoint"
          title={canExport ? 'Download this deck as a PowerPoint file' : 'Nothing to export yet'}
          className="size-9 shrink-0 !p-0"
        >
          {!exporting && (
            <svg
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.7}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className="size-[18px] shrink-0"
            >
              <path d="M10 3.5v9M6 8.75l4 4 4-4M4 16.5h12" />
            </svg>
          )}
        </Button>
        <Button
          variant="secondary"
          onClick={onQuiz}
          disabled={quizDisabledReason !== null}
          title={quizDisabledReason ?? 'Generate a quiz from this deck'}
        >
          Quiz
        </Button>
        <ThemeToggle />
        <Link to={`/deck/${presentationId}/narrate`}>
          <Button variant="primary">Narrate PPT</Button>
        </Link>
      </div>
    </div>
  )
}
