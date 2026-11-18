import type { ContentBlock, VisualStyle } from '@/engine/contentBlocks'
import { inferGroups, nodeKey } from '@/engine/groups'
import { SLIDE_GAP } from '@/lib/theme-tokens'
import { BodyNode } from './BodyNode'
import { SlideFrame } from './SlideFrame'

/**
 * Prose on two columns: the claim and lead head the slide on the frame, and the body flows
 * down the first column and on into the second (CSS columns, from the slide's 640px
 * container width up; one column below it). Reading order is the author's order, down then
 * across, and each block is `break-inside-avoid` so a paragraph or a list is never split
 * between the columns. Every body node is drawn once, whatever it is, under its own index.
 * Columns have no flex gap, so the space between blocks is a bottom margin from the scale.
 */
export function TwoColumnLayout({ blocks, variant }: { blocks: ContentBlock[]; variant: VisualStyle }) {
  const nodes = inferGroups(blocks, 'twoColumn')
  return (
    <SlideFrame blocks={blocks} variant={variant}>
      {(body) => {
        const inBody = new Set(body)
        return (
          <div
            data-two-column=""
            className="@min-[640px]:columns-2"
            style={{ columnGap: SLIDE_GAP.section }}
          >
            {nodes
              .filter((node) => inBody.has(nodeKey(node)))
              .map((node) => (
                <div key={nodeKey(node)} className="break-inside-avoid" style={{ marginBottom: SLIDE_GAP.group }}>
                  <BodyNode node={node} variant={variant} />
                </div>
              ))}
          </div>
        )
      }}
    </SlideFrame>
  )
}
