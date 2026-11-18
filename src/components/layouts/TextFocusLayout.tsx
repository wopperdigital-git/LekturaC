import type { ContentBlock, VisualStyle } from '@/engine/contentBlocks'
import { compositionOf } from '@/engine/composition'
import { SLIDE_GAP } from '@/lib/theme-tokens'
import { BlockRenderer } from './BlockRenderer'
import { BodyUnits, SlideFrame } from './SlideFrame'
import { frameBody } from './slideFrameParts'

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
        // A stack is held to a readable measure; a zoned slide's panels are as wide as the zone.
        return composition === 'stack' ? (
          <div className="flex max-w-prose flex-col" style={{ gap: SLIDE_GAP.group }}>
            {units}
          </div>
        ) : (
          <BodyUnits composition={composition} units={units} />
        )
      }}
    </SlideFrame>
  )
}
