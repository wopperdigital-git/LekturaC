import type { ContentBlock, VisualStyle } from '@/engine/contentBlocks'
import { compositionOf } from '@/engine/composition'
import { BlockRenderer } from './BlockRenderer'
import { BodyUnits, SlideFrame } from './SlideFrame'
import { frameBody } from './slideFrameParts'

/**
 * The plain stacked slide: the claim and lead in the frame's head, every other block
 * below in author order. Both visual treatments share this markup; `variant` reaches
 * the claim (the expressive heading is set heavier) through the frame.
 */
export function StandardLayout({ blocks, variant }: { blocks: ContentBlock[]; variant: VisualStyle }) {
  const body = frameBody(blocks)
  const composition = compositionOf(blocks, body.map((index) => [index]), 'standard')
  return (
    <SlideFrame blocks={blocks} variant={variant} composition={composition}>
      {(indices) => {
        const units = indices.map((index) => (
          <BlockRenderer key={index} block={blocks[index]} index={index} variant={variant} />
        ))
        return <BodyUnits composition={composition} units={units} />
      }}
    </SlideFrame>
  )
}
