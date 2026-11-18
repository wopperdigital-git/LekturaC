import { blocksOfTypeIndexed, type ContentBlock, type VisualStyle } from '@/engine/contentBlocks'
import { SLIDE_GAP } from '@/lib/theme-tokens'
import { pointRuns } from '@/engine/groups'
import { BlockRenderer, BlockUnit } from './BlockRenderer'
import { SlideFrame } from './SlideFrame'

/**
 * The image slide: the photo is the point. It is the frame's aside, about three fifths
 * of the slide on the left, with the claim, lead and the rest of the card in the text
 * column beside it (stacked under the photo below the slide's 640px).
 *
 * The aside is the card's FIRST image, named by index so the frame keeps it out of
 * the body even when the card holds two; any other block, a second image included, is
 * drawn by `BlockRenderer` in the body, so nothing on the card goes missing. From 640px up
 * the photo bleeds to the slide's left, top and bottom edges (the frame's `bleed`) and
 * draws no frame of its own; below it, expressive frames the stacked photo in an accent
 * outline.
 */
export function ImageFocusLayout({ blocks, variant }: { blocks: ContentBlock[]; variant: VisualStyle }) {
  const photo = blocksOfTypeIndexed(blocks, 'image')[0]
  const expressive = variant === 'expressive'

  return (
    <SlideFrame
      blocks={blocks}
      variant={variant}
      aside={
        photo
          ? {
              node: (
                <BlockRenderer
                  block={photo.block}
                  index={photo.index}
                  photoClass={`aspect-[4/3] ${expressive ? 'outline-4 -outline-offset-4 outline-slide-accent @min-[640px]:outline-0' : ''}`}
                  bleed
                />
              ),
              side: 'left',
              width: 'wide',
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
