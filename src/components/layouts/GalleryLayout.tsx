import { blocksOfTypeIndexed, type ContentBlock, type VisualStyle } from '@/engine/contentBlocks'
import { Heading, Leftovers } from './BlockRenderer'
import { Adjustable } from './Adjustable'
import { textRef } from '@/engine/marks'

export function GalleryLayout({ blocks, variant }: { blocks: ContentBlock[]; variant: VisualStyle }) {
  const headings = blocksOfTypeIndexed(blocks, 'heading')
  const images = blocksOfTypeIndexed(blocks, 'image')

  if (variant === 'expressive' && images.length >= 2) {
    const [featured, ...rest] = images
    // This branch shows the featured image and at most two others, so a fourth
    // image is a leftover here even though the structured branch draws them all.
    const shown = [featured, ...rest.slice(0, 2)]
    const consumed = [...headings, ...shown].map((entry) => entry.index)
    return (
      <div className="flex flex-col gap-6">
        {headings.map(({ block, index }) => (
          <Heading key={index} text={block.text} textRef={textRef(index, 'text')} />
        ))}
        <div className="grid grid-cols-2 gap-3">
          <Adjustable index={featured.index}>
            <figure className="row-span-2 overflow-hidden rounded-slide-sm border border-slide-border">
              <img
                src={featured.block.url}
                alt={featured.block.alt ?? ''}
                className="h-full w-full object-cover"
              />
            </figure>
          </Adjustable>
          <div className="grid grid-rows-2 gap-3">
            {rest.slice(0, 2).map((img, i) => (
              <Adjustable key={i} index={img.index}>
                <figure className="overflow-hidden rounded-slide-sm border border-slide-border">
                  <img
                    src={img.block.url}
                    alt={img.block.alt ?? ''}
                    className="aspect-square w-full object-cover"
                  />
                </figure>
              </Adjustable>
            ))}
          </div>
        </div>
        <Leftovers blocks={blocks} consumed={consumed} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {headings.map(({ block, index }) => (
        <Heading key={index} text={block.text} textRef={textRef(index, 'text')} />
      ))}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {images.map((img, i) => (
          <Adjustable key={i} index={img.index}>
            <figure className="overflow-hidden rounded-slide-sm border border-slide-border">
              <img
                src={img.block.url}
                alt={img.block.alt ?? ''}
                className="aspect-square w-full object-cover"
              />
            </figure>
          </Adjustable>
        ))}
      </div>
      <Leftovers blocks={blocks} consumed={[...headings, ...images].map((e) => e.index)} />
    </div>
  )
}
