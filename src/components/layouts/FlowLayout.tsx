import type { ContentBlock, LayoutType, VisualStyle } from '@/engine/contentBlocks'
import { inferGroups, nodeKey } from '@/engine/groups'
import { BlockRenderer } from './BlockRenderer'
import { GroupRenderer } from './GroupRenderer'

/**
 * A card drawn as a sequence of leaves and groups, in the author's order.
 *
 * This is what a "family" layout (stat grid, timeline, comparison, the two list
 * layouts, gallery) renders as now. Each of those used to draw only the block
 * types it understood and push everything else to the bottom; here every block
 * is drawn where it sits, and a run of same-type blocks gets the arrangement
 * that family used to give the whole card. Nothing can be dropped, because
 * `inferGroups` accounts for every block and this draws every node it returns.
 *
 * `hint` is the card's stored `layout`, forwarded so an explicit choice from the
 * Level 2 picker still decides how a bullet list is arranged.
 */
export function FlowLayout({
  blocks,
  variant,
  hint,
}: {
  blocks: ContentBlock[]
  variant: VisualStyle
  hint: LayoutType
}) {
  return (
    <div className="flex flex-col gap-6">
      {inferGroups(blocks, hint).map((node) =>
        node.kind === 'leaf' ? (
          <BlockRenderer key={nodeKey(node)} block={node.block} index={node.index} />
        ) : (
          <GroupRenderer key={nodeKey(node)} node={node} variant={variant} />
        ),
      )}
    </div>
  )
}
