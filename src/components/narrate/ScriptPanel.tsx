import { usePresentationStore } from '@/store/presentationStore'
import { isResettable, narrationStatus, type NarrationStatus } from '@/engine/narration'
import { formatDuration, speakingSeconds, wordCount } from '@/lib/speakingTime'
import { Button } from '@/components/ui/Button'
import type { Card } from '@/engine/contentBlocks'

const STATUS_LABEL: Record<NarrationStatus, string> = {
  empty: 'No script yet',
  generated: 'Generated',
  edited: 'Edited by you',
}

const STATUS_CLASS: Record<NarrationStatus, string> = {
  empty: 'text-app-muted',
  generated: 'text-app-accent-text',
  edited: 'text-app-highlight-text',
}

/**
 * One slide's script, and the two ways to generate.
 *
 * There is deliberately no slide list here any more. Navigation is the viewer's
 * job (‹ ›, arrow keys, the counter), and per-slide status now lives in two
 * better places: the current slide's own status line below, and the generate
 * dialog, which is the only screen where knowing every slide's state at once
 * actually changes what you do.
 */
export function ScriptPanel({
  cards,
  index,
  onGenerateOne,
  onOpenGenerateAll,
  generating,
  onCancel,
  error,
}: {
  cards: Card[]
  index: number
  onGenerateOne: () => void
  onOpenGenerateAll: () => void
  generating: boolean
  onCancel: () => void
  error: string | null
}) {
  const setNarrationText = usePresentationStore((s) => s.setNarrationText)
  const resetNarration = usePresentationStore((s) => s.resetNarration)

  const card = cards[index]
  const narration = card?.narration
  const text = narration?.text ?? ''
  const words = wordCount(text)
  const status = narrationStatus(narration)

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-app-border p-4">
        {generating ? (
          <>
            <Button variant="secondary" onClick={onCancel} className="w-full">
              Cancel
            </Button>
            <p className="mt-2 text-xs text-app-muted">Writing narration…</p>
          </>
        ) : (
          <div className="flex flex-col gap-2">
            <Button
              variant="secondary"
              onClick={onGenerateOne}
              disabled={!card}
              className="w-full"
              title="Write a script for the slide you are looking at"
            >
              Generate script for this slide only
            </Button>
            <Button
              variant="primary"
              onClick={onOpenGenerateAll}
              disabled={cards.length === 0}
              className="w-full"
              title="Choose which slides to write"
            >
              Generate scripts for all slides
            </Button>
          </div>
        )}
        {error && <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">{error}</p>}
      </div>

      {card && (
        <div className="flex min-h-0 flex-1 flex-col p-4">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-app-foreground">Slide {index + 1} script</h2>
            {isResettable(narration) && (
              <button
                onClick={() => resetNarration(card.id)}
                className="rounded-app-sm text-xs text-app-muted underline transition-colors hover:text-app-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent"
                title="Put the AI's version back"
              >
                Reset to generated
              </button>
            )}
          </div>

          {/* With the list gone this is the only standing answer to "where does
              this slide stand", so it carries the status the chips used to. */}
          <p className={`mb-2 text-xs ${STATUS_CLASS[status]}`}>{STATUS_LABEL[status]}</p>

          <textarea
            value={text}
            onChange={(e) => setNarrationText(card.id, e.target.value)}
            placeholder="What the narrator says while this slide is on screen."
            className="scrollbar-subtle min-h-0 flex-1 resize-none rounded-app border border-app-border bg-app-background p-3 text-sm leading-relaxed text-app-foreground outline-none focus:border-app-accent"
          />

          <p className="mt-2 text-xs text-app-muted">
            {words} {words === 1 ? 'word' : 'words'} · ~{formatDuration(speakingSeconds(text))}
          </p>
        </div>
      )}
    </div>
  )
}
