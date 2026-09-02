import { usePresentationStore } from '@/store/presentationStore'
import { isResettable, narrationStatus, type NarrationStatus } from '@/engine/narration'
import { formatDuration, speakingSeconds, wordCount } from '@/lib/speakingTime'
import { Button } from '@/components/ui/Button'
import type { Card } from '@/engine/contentBlocks'

/*
  Glyph plus duration rather than the word "generated": the row is 384px wide
  and shares it with a heading, and the duration is the number somebody writing
  a talk actually scans the list for.
*/
const STATUS_GLYPH: Record<NarrationStatus, string> = {
  empty: '—',
  generated: '✓',
  edited: '✎',
}

const STATUS_CLASS: Record<NarrationStatus, string> = {
  empty: 'text-app-muted',
  generated: 'text-app-accent-text',
  edited: 'text-app-highlight-text',
}

function headingOf(card: Card, i: number): string {
  return card.blocks[0]?.type === 'heading' ? card.blocks[0].text : `Slide ${i + 1}`
}

export function ScriptPanel({
  cards,
  index,
  onSelect,
  onGenerate,
  generating,
  onCancel,
  error,
}: {
  cards: Card[]
  index: number
  onSelect: (i: number) => void
  onGenerate: () => void
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

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-app-border p-4">
        {generating ? (
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={onCancel} className="w-full">
              Cancel
            </Button>
          </div>
        ) : (
          <Button variant="primary" onClick={onGenerate} disabled={cards.length === 0} className="w-full">
            Generate all scripts
          </Button>
        )}
        <p className="mt-2 text-xs text-app-muted">
          {generating
            ? 'Writing narration for the whole deck…'
            : 'Scripts you have edited are never overwritten.'}
        </p>
        {error && <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">{error}</p>}
      </div>

      <ul className="scrollbar-subtle max-h-52 shrink-0 overflow-y-auto border-b border-app-border">
        {cards.map((c, i) => {
          const status = narrationStatus(c.narration)
          const seconds = speakingSeconds(c.narration?.text ?? '')
          return (
            <li key={c.id}>
              <button
                onClick={() => onSelect(i)}
                title={status === 'edited' ? 'You edited this script — Generate all will not overwrite it' : undefined}
                className={`flex w-full items-center gap-2 px-4 py-2 text-left text-xs transition-colors hover:bg-app-border/40 ${
                  i === index ? 'bg-app-border/60' : ''
                }`}
              >
                <span className="w-4 shrink-0 tabular-nums text-app-muted">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-app-foreground">{headingOf(c, i)}</span>
                <span className={`shrink-0 ${STATUS_CLASS[status]}`}>{STATUS_GLYPH[status]}</span>
                <span className="w-12 shrink-0 text-right tabular-nums text-app-muted">
                  {status === 'empty' ? '' : formatDuration(seconds)}
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      {card && (
        <div className="flex min-h-0 flex-1 flex-col p-4">
          <div className="mb-2 flex items-baseline justify-between">
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
