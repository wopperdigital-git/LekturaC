import { blocksOfTypeIndexed, type ContentBlock, type VisualStyle } from '@/engine/contentBlocks'
import { BlockRenderer, Heading, Leftovers } from './BlockRenderer'
import { textRef } from '@/engine/marks'

export function StandardSplitLayout({ blocks, variant }: { blocks: ContentBlock[]; variant: VisualStyle }) {
  const headings = blocksOfTypeIndexed(blocks, 'heading')
  const images = blocksOfTypeIndexed(blocks, 'image')
  /*
    Index carried through the filter, not re-derived from the filtered array:
    `rest` skips headings and images, so its positions do not match the card's.
    Passing the filtered position as a block index would address a different
    block entirely and hang Level 3's edits on the wrong text.
  */
  const rest = blocks
    .map((block, index) => ({ block, index }))
    .filter(({ block }) => block.type !== 'heading' && block.type !== 'image')

  const text = (
    <div className="flex flex-col gap-4">
      {headings.map(({ block, index }) => (
        <Heading key={index} text={block.text} textRef={textRef(index, 'text')} size={block.size} />
      ))}
      {rest.map(({ block, index }) => (
        <BlockRenderer key={index} block={block} index={index} />
      ))}
    </div>
  )
  const image = <div>{images[0] && <BlockRenderer block={images[0].block} index={images[0].index} />}</div>

  // This layout draws every non-image block already; the one thing it leaves
  // out is a SECOND image, since the split has exactly one image slot.
  const consumed = [...headings, ...rest, ...(images[0] ? [images[0]] : [])].map((e) => e.index)

  return (
    <div className="flex flex-col gap-8">
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
      <Leftovers blocks={blocks} consumed={consumed} />
    </div>
  )
}
