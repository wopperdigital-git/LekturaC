import { blocksOfType, type ContentBlock, type VisualStyle } from '@/engine/contentBlocks'
import { Heading } from './BlockRenderer'

export function IconGridLayout({ blocks, variant }: { blocks: ContentBlock[]; variant: VisualStyle }) {
  const headings = blocksOfType(blocks, 'heading')
  const list = blocksOfType(blocks, 'bulletList')[0]

  if (variant === 'expressive') {
    return (
      <div className="flex flex-col gap-6">
        {headings.map((h, i) => (
          <Heading key={i} text={h.text} />
        ))}
        {list && (
          <div className="flex flex-wrap gap-3">
            {list.items.map((item, i) => (
              <div
                key={i}
                className="flex items-center gap-2 rounded-full bg-slide-accent/10 py-2 pl-2 pr-4"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slide-accent text-xs font-semibold text-slide-accent-foreground">
                  {i + 1}
                </span>
                <span className="text-sm text-slide-foreground/90">{item}</span>
              </div>
            ))}
          </div>
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
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {list.items.map((item, i) => (
            <div
              key={i}
              className="flex flex-col items-start gap-2 rounded-slide-sm border border-slide-border bg-slide-surface p-4"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slide-accent text-sm font-semibold text-slide-accent-foreground">
                {i + 1}
              </span>
              <span className="text-sm text-slide-foreground/90">{item}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
