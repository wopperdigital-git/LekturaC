import type { ContentBlock, VisualStyle } from '@/engine/contentBlocks'
import { SLIDE_GAP } from '@/lib/theme-tokens'
import { BlockRenderer } from './BlockRenderer'
import { SlideFrame } from './SlideFrame'

/**
 * Flowing prose for narrative cards with no natural list or number structure: the claim
 * and lead in the frame's head, every other block below in author order, held to a
 * readable measure. Both visual treatments share this markup; `variant` reaches the
 * claim through the frame.
 */
export function TextFocusLayout({ blocks, variant }: { blocks: ContentBlock[]; variant: VisualStyle }) {
  return (
    <SlideFrame blocks={blocks} variant={variant}>
      {(body) => (
        <div className="flex max-w-prose flex-col" style={{ gap: SLIDE_GAP.group }}>
          {body.map((index) => (
            <BlockRenderer key={index} block={blocks[index]} index={index} variant={variant} />
          ))}
        </div>
      )}
    </SlideFrame>
  )
}
