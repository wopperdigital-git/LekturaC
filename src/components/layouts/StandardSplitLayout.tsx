import { blocksOfTypeIndexed, type ContentBlock, type VisualStyle } from '@/engine/contentBlocks'
import { SLIDE_GAP } from '@/lib/theme-tokens'
import { pointRuns } from '@/engine/groups'
import { BlockRenderer, BlockUnit } from './BlockRenderer'
import { SlideFrame } from './SlideFrame'

/**
 * Text on one half, the photo on the other, on the slide frame: the claim and lead
 * head the text column, the photo is the frame's aside. The photo's side alternates
 * down the deck (the right on the first slide, the left on the next), so neighbouring
 * splits do not look alike; stacked below the slide's 640px. From 640px up the photo
 * bleeds to the slide's edge on its side (the frame's `bleed`).
 *
 * The aside is the card's FIRST image, named by index so the frame keeps it out of
 * the body even when the card holds two. A second image stays in the body and is drawn
 * by `BlockRenderer` where it sits, so every block is drawn once and nothing is left
 * over.
 */
export function StandardSplitLayout({
  blocks,
  variant,
  position,
}: {
  blocks: ContentBlock[]
  variant: VisualStyle
  position: number
}) {
  const photo = blocksOfTypeIndexed(blocks, 'image')[0]
  const photoOnLeft = position % 2 === 1

  return (
    <SlideFrame
      blocks={blocks}
      variant={variant}
      aside={
        photo
          ? {
              node: (
                <BlockRenderer block={photo.block} index={photo.index} photoClass="aspect-[4/3]" bleed />
              ),
              side: photoOnLeft ? 'left' : 'right',
              width: 'half',
              index: photo.index,
              bleed: true,
            }
          : undefined
      }
    >
      {(body) => (
        <div className="flex flex-col" style={{ gap: SLIDE_GAP.group }}>
          {pointRuns(blocks, body).map((unit) => (
            <BlockUnit key={unit[0]} blocks={blocks} unit={unit} variant={variant} />
          ))}
        </div>
      )}
    </SlideFrame>
  )
}
