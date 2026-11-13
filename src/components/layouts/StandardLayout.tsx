import type { ContentBlock, VisualStyle } from '@/engine/contentBlocks'
import { BlockRenderer } from './BlockRenderer'

export function StandardLayout({ blocks, variant }: { blocks: ContentBlock[]; variant: VisualStyle }) {
  if (variant === 'expressive') {
    return (
      <div className="flex flex-col gap-5">
        {blocks.map((block, i) => (
          <BlockRenderer key={i} block={block} index={i} variant={variant} />
        ))}
      </div>
    )
  }

  return (
    <div className="flex gap-5">
      <div className="flex flex-1 flex-col gap-4">
        {blocks.map((block, i) => (
          <BlockRenderer key={i} block={block} index={i} />
        ))}
      </div>
    </div>
  )
}
