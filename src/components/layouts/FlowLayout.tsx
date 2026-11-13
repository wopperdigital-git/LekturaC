import type { ContentBlock, LayoutType, VisualStyle } from '@/engine/contentBlocks'
import { accentOwner } from '@/engine/composition'
import { inferGroups, nodeKey } from '@/engine/groups'
import { singlePhoto } from '@/engine/blockPartition'
import { BlockRenderer } from './BlockRenderer'
import { GroupRenderer } from './GroupRenderer'
import { SlideFrame } from './SlideFrame'
import { SLIDE_GAP } from '@/lib/theme-tokens'

/**
 * A card drawn as a sequence of leaves and groups, in the author's order.
 *
 * This is what a "family" layout (stat grid, timeline, comparison, the two list
 * layouts, gallery) renders as now. Each of those used to draw only the block
 * types it understood and push everything else to the bottom; here every block
 * is drawn where it sits, and a run of same-type blocks gets the arrangement
 * that family used to give the whole card. Nothing can be dropped, because
 * `inferGroups` accounts for every block and this draws every node it returns
 * that `SlideFrame` has not put in the head (the claim and lead are never part of
 * a run, so a node is in the body when its first index is).
 *
 * A card with exactly one photo draws it as a band across the top of the body,
 * ahead of the rest, so every variety of every family keeps working with a photo.
 * Its leaf is skipped where it sits (by block index) rather than `inferGroups`
 * knowing about photos: grouping is untouched, and the band is drawn from the same
 * block at the same index, so nudges and formatting still address it.
 *
 * `hint` is the card's stored `layout`, forwarded so an explicit choice from the
 * Level 2 picker still decides how a bullet list is arranged. `layout` is the
 * resolved name (never `'auto'`): `accentOwner` reads it to name the one block that
 * may be drawn on an accent fill, and every group is told which that is.
 */
export function FlowLayout({
  blocks,
  variant,
  hint,
  layout,
}: {
  blocks: ContentBlock[]
  variant: VisualStyle
  hint: LayoutType
  layout: Exclude<LayoutType, 'auto'>
}) {
  const photo = singlePhoto(blocks)
  const nodes = inferGroups(blocks, hint)
  const accentIndex = accentOwner(blocks, layout)
  return (
    <SlideFrame blocks={blocks} variant={variant}>
      {(body) => {
        const inBody = new Set(body)
        return (
          <div className="flex flex-col" style={{ gap: SLIDE_GAP.group }}>
            {photo && (
              <BlockRenderer block={photo.block} index={photo.index} photoClass="aspect-[6/1]" />
            )}
            {nodes.map((node) => {
              const first = node.kind === 'leaf' ? node.index : node.items[0].index
              if (!inBody.has(first)) return null
              if (node.kind === 'leaf') {
                return photo && node.index === photo.index ? null : (
                  <BlockRenderer
                    key={nodeKey(node)}
                    block={node.block}
                    index={node.index}
                    variant={variant}
                  />
                )
              }
              return <GroupRenderer key={nodeKey(node)} node={node} variant={variant} accentIndex={accentIndex} />
            })}
          </div>
        )
      }}
    </SlideFrame>
  )
}
