import type { VisualStyle } from '@/engine/contentBlocks'
import { nodeKey, type RenderNode } from '@/engine/groups'
import { BlockRenderer } from './BlockRenderer'
import { GroupRenderer } from './GroupRenderer'

/**
 * One render node of a body, drawn the way `FlowLayout` draws it: a leaf through
 * `BlockRenderer`, a group through `GroupRenderer`, every block under its own index. The
 * new frames that arrange their own body (two columns, stat split, photo list) draw the
 * nodes they do not place themselves through this, so no block can go undrawn.
 */
export function BodyNode({
  node,
  variant,
  fill = false,
}: {
  node: RenderNode
  variant: VisualStyle
  fill?: boolean
}) {
  return node.kind === 'leaf' ? (
    <BlockRenderer block={node.block} index={node.index} variant={variant} />
  ) : (
    <GroupRenderer key={nodeKey(node)} node={node} variant={variant} accentIndex={null} fill={fill} />
  )
}
