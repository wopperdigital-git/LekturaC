import { useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { ConfirmReplaceModal } from './ConfirmReplaceModal'
import { Button } from '@/components/ui/Button'
import { isRegenerable, narrationStatus, type NarrationStatus } from '@/engine/narration'
import { formatDuration, speakingSeconds } from '@/lib/speakingTime'
import { headingTextOf, type Card } from '@/engine/contentBlocks'

const STATUS_LABEL: Record<NarrationStatus, string> = {
  empty: 'no script',
  generated: 'generated',
  edited: 'you edited this',
}

const STATUS_CLASS: Record<NarrationStatus, string> = {
  empty: 'text-app-muted',
  generated: 'text-app-accent-text',
  edited: 'text-app-highlight-text',
}

/**
 * Picks which slides a generation should write.
 *
 * The checklist is what replaced an inferred rule with an explicit one. This
 * used to refuse, silently, to overwrite anything the user had edited; now they
 * choose, and `mergeNarration` writes to nothing outside that choice. Two
 * consequences the design leans on:
 *
 * - **A slide you edited starts unticked, but can be ticked.** Defaulting it off
 *   keeps the safe thing the default. Letting it be ticked is what makes the
 *   list honest — a checkbox that did nothing would be worse than no checkbox.
 * - **Ticking one costs a confirm.** Replacing hand-written words is the only
 *   irreversible-feeling thing this dialog does, so it is the only thing that
 *   asks twice. Everything else generates on the first press.
 */
export function GenerateScriptsModal({
  cards,
  onClose,
  onGenerate,
}: {
  cards: Card[]
  onClose: () => void
  /** Receives 0-based slide positions, in `orderIndex` order. */
  onGenerate: (targets: Set<number>) => void
}) {
  // Everything the AI may freely rewrite starts on; anything hand-written
  // starts off. That makes the first press of Generate do the expected thing on
  // a fresh deck without reading a single row.
  const [picked, setPicked] = useState<Set<number>>(
    () => new Set(cards.map((c, i) => (isRegenerable(c.narration) ? i : -1)).filter((i) => i >= 0)),
  )
  const [confirming, setConfirming] = useState(false)

  const editedPicked = useMemo(
    () => [...picked].filter((i) => narrationStatus(cards[i]?.narration) === 'edited').sort((a, b) => a - b),
    [picked, cards],
  )

  function toggle(i: number) {
    setPicked((current) => {
      const next = new Set(current)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  function submit() {
    if (editedPicked.length > 0 && !confirming) {
      setConfirming(true)
      return
    }
    onGenerate(picked)
  }

  if (confirming) {
    return (
      <ConfirmReplaceModal
        slides={editedPicked.map((i) => i + 1)}
        onBack={() => setConfirming(false)}
        onClose={onClose}
        onConfirm={() => onGenerate(picked)}
      />
    )
  }

  return (
    <Modal title="Generate scripts" onClose={onClose}>
      <p className="text-sm text-app-muted">
        Every slide is sent for context so the narration flows, but only the ones you tick are written.
      </p>

      <div className="mt-3 flex gap-3 text-xs">
        <button
          onClick={() => setPicked(new Set(cards.map((_, i) => i)))}
          className="rounded-app-sm text-app-accent-text underline transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent"
        >
          Select all
        </button>
        <button
          onClick={() => setPicked(new Set())}
          className="rounded-app-sm text-app-accent-text underline transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent"
        >
          None
        </button>
        <button
          onClick={() =>
            setPicked(
              new Set(
                cards
                  .map((c, i) => (narrationStatus(c.narration) === 'empty' ? i : -1))
                  .filter((i) => i >= 0),
              ),
            )
          }
          className="rounded-app-sm text-app-accent-text underline transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent"
        >
          Only empty
        </button>
      </div>

      <ul className="scrollbar-subtle mt-3 max-h-80 overflow-y-auto rounded-app border border-app-border">
        {cards.map((c, i) => {
          const status = narrationStatus(c.narration)
          const seconds = speakingSeconds(c.narration?.text ?? '')
          return (
            <li key={c.id}>
              <label className="flex cursor-pointer items-center gap-3 border-b border-app-border px-3 py-2 text-sm last:border-b-0 hover:bg-app-border/30">
                <input
                  type="checkbox"
                  checked={picked.has(i)}
                  onChange={() => toggle(i)}
                  className="size-4 shrink-0 accent-app-accent"
                />
                <span className="w-5 shrink-0 tabular-nums text-xs text-app-muted">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-app-foreground">{headingTextOf(c, i)}</span>
                <span className={`shrink-0 text-xs ${STATUS_CLASS[status]}`}>{STATUS_LABEL[status]}</span>
                <span className="w-12 shrink-0 text-right text-xs tabular-nums text-app-muted">
                  {status === 'empty' ? '' : formatDuration(seconds)}
                </span>
              </label>
            </li>
          )
        })}
      </ul>

      <div className="mt-6 flex items-center justify-between gap-3">
        <span className="text-xs text-app-muted">
          {picked.size} of {cards.length} selected
        </span>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={picked.size === 0}>
            Generate
          </Button>
        </div>
      </div>
    </Modal>
  )
}
