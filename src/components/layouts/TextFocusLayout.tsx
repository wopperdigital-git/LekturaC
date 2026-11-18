import type { ContentBlock, VisualStyle } from '@/engine/contentBlocks'
import { compositionOf } from '@/engine/composition'
import { BlockRenderer } from './BlockRenderer'
import { BodyUnits, SlideFrame, frameBody } from './SlideFrame'

/**
 * Flowing prose for narrative cards with no natural list or number structure: the claim
 * and lead in the frame's head, every other block below in author order, held to a
 * readable measure. Both visual treatments share this markup; `variant` reaches the
 * claim through the frame.
 */
export function TextFocusLayout({ blocks, variant }: { blocks: ContentBlock[]; variant: VisualStyle }) {
  const body = frameBody(blocks)
  const composition = compositionOf(blocks, body.map((index) => [index]), 'textFocus')
  return (
    <SlideFrame blocks={blocks} variant={variant} composition={composition}>
      {(indices) => {
        const units = indices.map((index) => (
          <BlockRenderer key={index} block={blocks[index]} index={index} variant={variant} />
        ))
        const drawn = <BodyUnits composition={composition} units={units} />
        return composition === 'stack' ? <div className="max-w-prose">{drawn}</div> : drawn
      }}
    </SlideFrame>
  )
}
