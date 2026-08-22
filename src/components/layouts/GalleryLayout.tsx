import { blocksOfType, type ContentBlock, type VisualStyle } from '@/engine/contentBlocks'
import { Heading } from './BlockRenderer'
import { idx } from './blockTags'

export function GalleryLayout({ blocks, variant }: { blocks: ContentBlock[]; variant: VisualStyle }) {
  const headings = blocksOfType(blocks, 'heading')
  const images = blocksOfType(blocks, 'image')

  if (variant === 'expressive' && images.length >= 2) {
    const [featured, ...rest] = images
    return (
      <div className="flex flex-col gap-6">
        {headings.map((h, i) => (
          <Heading key={i} text={h.text} blockIndex={idx(blocks, h)} path="text" />
        ))}
        <div className="grid grid-cols-2 gap-3">
          <figure className="row-span-2 overflow-hidden rounded-slide-sm border border-slide-border">
            <img
              data-block-index={idx(blocks, featured)}
              src={featured.url}
              alt={featured.alt ?? ''}
              className="h-full w-full object-cover"
            />
          </figure>
          <div className="grid grid-rows-2 gap-3">
            {rest.slice(0, 2).map((img, i) => (
              <figure key={i} className="overflow-hidden rounded-slide-sm border border-slide-border">
                <img
                  data-block-index={idx(blocks, img)}
                  src={img.url}
                  alt={img.alt ?? ''}
                  className="aspect-square w-full object-cover"
                />
              </figure>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {headings.map((h, i) => (
        <Heading key={i} text={h.text} blockIndex={idx(blocks, h)} path="text" />
      ))}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {images.map((img, i) => (
          <figure key={i} className="overflow-hidden rounded-slide-sm border border-slide-border">
            <img
                  data-block-index={idx(blocks, img)}
                  src={img.url}
                  alt={img.alt ?? ''}
                  className="aspect-square w-full object-cover"
                />
          </figure>
        ))}
      </div>
    </div>
  )
}
