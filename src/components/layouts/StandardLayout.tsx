import type { ContentBlock } from '@/engine/contentBlocks'
import { BlockRenderer } from './BlockRenderer'

export function StandardLayout({ blocks }: { blocks: ContentBlock[] }) {
  return (
    <div className="flex gap-5 border-l-4 border-slide-accent pl-5">
      <div className="flex flex-1 flex-col gap-4">
        {blocks.map((block, i) => (
          <BlockRenderer key={i} block={block} />
        ))}
      </div>
    </div>
  )
}
