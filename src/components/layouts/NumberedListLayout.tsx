import { blocksOfType, type ContentBlock, type VisualStyle } from '@/engine/contentBlocks'
import { Heading } from './BlockRenderer'

/** Full-width numbered rows for a bullet list too long or too detailed for the compact icon grid. */
export function NumberedListLayout({ blocks, variant }: { blocks: ContentBlock[]; variant: VisualStyle }) {
  const headings = blocksOfType(blocks, 'heading')
  const list = blocksOfType(blocks, 'bulletList')[0]

  if (variant === 'expressive') {
    return (
      <div className="flex flex-col gap-6">
        {headings.map((h, i) => (
          <Heading key={i} text={h.text} />
        ))}
        {list && (
          <ol className="flex flex-col gap-3">
            {list.items.map((item, i) => (
              <li key={i} className="flex items-center gap-4 rounded-slide-sm bg-slide-surface p-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slide-accent text-sm font-semibold text-slide-accent-foreground">
                  {i + 1}
                </span>
                <span className="text-slide-foreground/90">{item}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {headings.map((h, i) => (
        <Heading key={i} text={h.text} />
      ))}
      {list && (
        <ol className="flex flex-col divide-y divide-slide-border">
          {list.items.map((item, i) => (
            <li key={i} className="flex items-baseline gap-4 py-3">
              <span
                className="shrink-0 text-slide-accent"
                style={{ fontFamily: 'var(--font-slide-heading)', fontWeight: 600 }}
              >
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="text-slide-foreground/90">{item}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
