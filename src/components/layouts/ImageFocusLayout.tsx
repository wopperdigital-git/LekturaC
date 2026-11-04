import { blocksOfTypeIndexed, type ContentBlock, type VisualStyle } from '@/engine/contentBlocks'
import { BlockRenderer, Heading, Leftovers } from './BlockRenderer'
import { textRef } from '@/engine/marks'

/**
 * The image slide: the photo is the point. It takes about three fifths of the slide
 * on the left, with the heading and its caption beside it (stacked under the photo
 * below the slide's 640px).
 *
 * "Caption" is the card's paragraphs; anything else the card holds (a timeline step
 * that arrived with a photo, a second image) is not drawn here and falls to
 * `Leftovers`, so nothing on the card goes missing. Expressive sets the lead heading
 * on its accent panel and frames the photo in an accent outline.
 */
export function ImageFocusLayout({ blocks, variant }: { blocks: ContentBlock[]; variant: VisualStyle }) {
  const headings = blocksOfTypeIndexed(blocks, 'heading')
  const paragraphs = blocksOfTypeIndexed(blocks, 'paragraph')
  const photo = blocksOfTypeIndexed(blocks, 'image')[0]
  const consumed = [...headings, ...paragraphs, ...(photo ? [photo] : [])].map((entry) => entry.index)
  const expressive = variant === 'expressive'

  return (
    <div className="flex flex-col gap-8">
      <div
        className={`grid grid-cols-1 gap-8 @min-[640px]:items-center ${
          photo ? '@min-[640px]:grid-cols-[3fr_2fr]' : ''
        }`}
      >
        {photo && (
          <BlockRenderer
            block={photo.block}
            index={photo.index}
            photoClass={`aspect-[4/3] ${expressive ? 'outline-4 -outline-offset-4 outline-slide-accent' : ''}`}
          />
        )}
        <div className="flex min-w-0 flex-col gap-4">
          {headings.map(({ block, index }, i) => (
            <Heading
              key={index}
              text={block.text}
              textRef={textRef(index, 'text')}
              size={block.size}
              variant={variant}
              panel={expressive && i === 0}
            />
          ))}
          {paragraphs.map(({ block, index }) => (
            <BlockRenderer key={index} block={block} index={index} />
          ))}
        </div>
      </div>
      <Leftovers blocks={blocks} consumed={consumed} />
    </div>
  )
}
