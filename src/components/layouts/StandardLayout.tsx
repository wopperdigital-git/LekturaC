import type { ContentBlock, VisualStyle } from '@/engine/contentBlocks'
import { compositionOf } from '@/engine/composition'
import { pointRuns } from '@/engine/groups'
import { BlockUnit } from './BlockRenderer'
import { BodyUnits, SlideFrame } from './SlideFrame'
import { frameBody } from './slideFrameParts'

/**
 * The plain stacked slide: the claim and lead in the frame's head, every other block
 * below in author order. Both visual treatments share this markup; `variant` reaches
 * the claim (the expressive heading is set heavier) through the frame.
 */
export function StandardLayout({ blocks, variant }: { blocks: ContentBlock[]; variant: VisualStyle }) {
  const body = frameBody(blocks)
  const composition = compositionOf(blocks, pointRuns(blocks, body), 'standard')
  return (
    <SlideFrame blocks={blocks} variant={variant} composition={composition}>
      {(indices) => {
        const units = pointRuns(blocks, indices).map((unit) => (
          <BlockUnit key={unit[0]} blocks={blocks} unit={unit} variant={variant} />
        ))
        return <BodyUnits composition={composition} units={units} />
      }}
    </SlideFrame>
  )
}
