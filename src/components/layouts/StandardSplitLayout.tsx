import { blocksOfType, type ContentBlock } from '@/engine/contentBlocks'
import { BlockRenderer, Heading } from './BlockRenderer'

export function StandardSplitLayout({ blocks }: { blocks: ContentBlock[] }) {
  const headings = blocksOfType(blocks, 'heading')
  const images = blocksOfType(blocks, 'image')
  const rest = blocks.filter((b) => b.type !== 'heading' && b.type !== 'image')

  return (
    <div className="grid grid-cols-1 gap-8 md:grid-cols-2 md:items-center">
      <div className="flex flex-col gap-4">
        {headings.map((h, i) => (
          <Heading key={i} text={h.text} />
        ))}
        {rest.map((block, i) => (
          <BlockRenderer key={i} block={block} />
        ))}
      </div>
      <div>{images[0] && <BlockRenderer block={images[0]} />}</div>
    </div>
  )
}
