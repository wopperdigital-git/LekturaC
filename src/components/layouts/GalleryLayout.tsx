import { blocksOfType, type ContentBlock } from '@/engine/contentBlocks'
import { Heading } from './BlockRenderer'

export function GalleryLayout({ blocks }: { blocks: ContentBlock[] }) {
  const headings = blocksOfType(blocks, 'heading')
  const images = blocksOfType(blocks, 'image')

  return (
    <div className="flex flex-col gap-6">
      {headings.map((h, i) => (
        <Heading key={i} text={h.text} />
      ))}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {images.map((img, i) => (
          <figure key={i} className="overflow-hidden rounded-slide-sm border border-slide-border">
            <img src={img.url} alt={img.alt ?? ''} className="aspect-square w-full object-cover" />
          </figure>
        ))}
      </div>
    </div>
  )
}
