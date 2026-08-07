import { blocksOfType, type ContentBlock } from '@/engine/contentBlocks'
import { Heading } from './BlockRenderer'

export function IconGridLayout({ blocks }: { blocks: ContentBlock[] }) {
  const headings = blocksOfType(blocks, 'heading')
  const list = blocksOfType(blocks, 'bulletList')[0]

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
