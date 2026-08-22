import type { Card } from '@/engine/contentBlocks'

/**
 * Narration script for one card. There is no voice/AI integration behind this
 * yet — `script` is always undefined today, so the panel renders its empty
 * state. It takes the text as a prop rather than reading a store so that
 * wiring a real source later touches nothing but the call site.
 */
export function ScriptPanel({
  card,
  index,
  script,
}: {
  card: Card | null
  index: number
  script?: string | null
}) {
  const heading = card?.blocks.find((b) => b.type === 'heading')?.text
  const wordCount = script ? script.trim().split(/\s+/).length : 0

  return (
    <div className="flex h-full flex-col overflow-hidden p-3">
      <p className="mb-1 px-1 text-xs font-medium uppercase tracking-wide text-app-muted">Narration</p>

      {card ? (
        <p className="mb-3 px-1 text-sm text-app-foreground">
          <span className="text-app-muted">Slide {index + 1}</span>
          {heading ? ` · ${heading}` : ''}
        </p>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {!card ? (
          <p className="px-1 text-sm text-app-muted">Pick a slide in the outline to see its script.</p>
        ) : script ? (
          <div className="flex h-full flex-col gap-2">
            <p className="whitespace-pre-wrap rounded-app-sm bg-app-surface p-3 text-sm leading-relaxed text-app-foreground">
              {script}
            </p>
            <p className="px-1 text-xs text-app-muted">
              {wordCount} words · about {Math.max(1, Math.round(wordCount / 130))} min to read aloud
            </p>
          </div>
        ) : (
          <div className="flex h-full min-h-40 flex-col items-center justify-center gap-1.5 rounded-app-sm border border-dashed border-app-border px-4 text-center">
            <p className="text-sm font-medium text-app-foreground">Nothing to read out yet</p>
            <p className="text-xs leading-relaxed text-app-muted">
              A narrator hasn't been given this slide. Its spoken script lands here.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
