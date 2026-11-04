import type { ContentBlock, VisualStyle } from '@/engine/contentBlocks'
import { BlockRenderer } from './BlockRenderer'

export function StandardLayout({ blocks, variant }: { blocks: ContentBlock[]; variant: VisualStyle }) {
  if (variant === 'expressive') {
    // The first heading sits on an accent panel; every block keeps its index.
    const lead = blocks.findIndex((b) => b.type === 'heading')
    return (
      <div className="flex flex-col gap-5">
        {blocks.map((block, i) => (
          <BlockRenderer key={i} block={block} index={i} variant={variant} headingPanel={i === lead} />
        ))}
      </div>
    )
  }

  return (
    <div className="flex gap-5 border-l-4 border-slide-accent pl-5">
      <div className="flex flex-1 flex-col gap-4">
        {blocks.map((block, i) => (
          <BlockRenderer key={i} block={block} index={i} />
        ))}
      </div>
    </div>
  )
}
