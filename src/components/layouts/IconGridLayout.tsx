import { blocksOfTypeIndexed, type ContentBlock, type VisualStyle } from '@/engine/contentBlocks'
import { Heading } from './BlockRenderer'
import { textRef } from '@/engine/marks'
import { EditableText } from './EditableText'

export function IconGridLayout({ blocks, variant }: { blocks: ContentBlock[]; variant: VisualStyle }) {
  const headings = blocksOfTypeIndexed(blocks, 'heading')
  const list = blocksOfTypeIndexed(blocks, 'bulletList')[0]

  if (variant === 'expressive') {
    return (
      <div className="flex flex-col gap-6">
        {headings.map(({ block, index }) => (
          <Heading key={index} text={block.text} textRef={textRef(index, 'text')} />
        ))}
        {list && (
          <div className="flex flex-wrap gap-3">
            {list.block.items.map((item, i) => (
              <div
                key={i}
                className="flex items-center gap-2 rounded-full bg-slide-accent/10 py-2 pl-2 pr-4"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slide-accent to-slide-accent-soft text-xs font-semibold text-slide-accent-foreground">
                  {i + 1}
                </span>
                <span className="text-sm text-slide-foreground/90">
                  <EditableText textRef={textRef(list.index, 'items', i)} value={item} />
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {headings.map(({ block, index }) => (
        <Heading key={index} text={block.text} textRef={textRef(index, 'text')} />
      ))}
      {list && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {list.block.items.map((item, i) => (
            <div
              key={i}
              className="flex flex-col items-start gap-2 rounded-slide-sm border border-slide-border bg-slide-surface p-4"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slide-accent text-sm font-semibold text-slide-accent-foreground">
                {i + 1}
              </span>
              <span className="text-sm text-slide-foreground/90">
                  <EditableText textRef={textRef(list.index, 'items', i)} value={item} />
                </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
