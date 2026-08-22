import type { ContentBlock, VisualStyle } from '@/engine/contentBlocks'
import { BlockRenderer } from './BlockRenderer'
import { idx } from './blockTags'

export function StandardLayout({ blocks, variant }: { blocks: ContentBlock[]; variant: VisualStyle }) {
  if (variant === 'expressive') {
    return (
      <div className="rounded-slide-sm bg-slide-surface p-6">
        <div className="flex flex-col gap-4">
          {blocks.map((block, i) => (
            <BlockRenderer key={i} block={block} index={idx(blocks, block)} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-5 border-l-4 border-slide-accent pl-5">
      <div className="flex flex-1 flex-col gap-4">
        {blocks.map((block, i) => (
          <BlockRenderer key={i} block={block} index={idx(blocks, block)} />
        ))}
      </div>
    </div>
  )
}
