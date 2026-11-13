import type { ContentBlock, VisualStyle } from '@/engine/contentBlocks'
import { SLIDE_GAP } from '@/lib/theme-tokens'
import { BlockRenderer } from './BlockRenderer'
import { SlideFrame } from './SlideFrame'

/**
 * The plain stacked slide: the claim and lead in the frame's head, every other block
 * below in author order. Both visual treatments share this markup; `variant` reaches
 * the claim (the expressive heading is set heavier) through the frame.
 */
export function StandardLayout({ blocks, variant }: { blocks: ContentBlock[]; variant: VisualStyle }) {
  return (
    <SlideFrame blocks={blocks} variant={variant}>
      {(body) => (
        <div className="flex flex-col" style={{ gap: SLIDE_GAP.group }}>
          {body.map((index) => (
            <BlockRenderer key={index} block={blocks[index]} index={index} variant={variant} />
          ))}
        </div>
      )}
    </SlideFrame>
  )
}
