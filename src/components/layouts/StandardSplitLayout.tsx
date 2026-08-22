import { blocksOfType, type ContentBlock, type VisualStyle } from '@/engine/contentBlocks'
import { BlockRenderer, Heading } from './BlockRenderer'
import { idx } from './blockTags'

export function StandardSplitLayout({ blocks, variant }: { blocks: ContentBlock[]; variant: VisualStyle }) {
  const headings = blocksOfType(blocks, 'heading')
  const images = blocksOfType(blocks, 'image')
  const rest = blocks.filter((b) => b.type !== 'heading' && b.type !== 'image')

  const text = (
    <div className="flex flex-col gap-4">
      {headings.map((h, i) => (
        <Heading key={i} text={h.text} blockIndex={idx(blocks, h)} path="text" />
      ))}
      {rest.map((block, i) => (
        <BlockRenderer key={i} block={block} index={idx(blocks, block)} />
      ))}
    </div>
  )
  const image = <div>{images[0] && <BlockRenderer block={images[0]} index={idx(blocks, images[0])} />}</div>

  return (
    <div className="grid grid-cols-1 gap-8 md:grid-cols-2 md:items-center">
      {variant === 'expressive' ? (
        <>
          {image}
          {text}
        </>
      ) : (
        <>
          {text}
          {image}
        </>
      )}
    </div>
  )
}
