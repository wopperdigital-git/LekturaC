import type { VisualStyle } from '@/engine/contentBlocks'
import { flattenNodes, type GroupNode } from '@/engine/groups'
import { textRef } from '@/engine/marks'
import { BlockRenderer, StatBlockView } from './BlockRenderer'

/**
 * Draws one group of blocks in its arrangement.
 *
 * Every item is drawn under its ORIGINAL block index, the same one it has in
 * `card.blocks` — that is its `textRef` and its `card.adjusts` key, so
 * formatting, nudges and text editing keep working unchanged.
 *
 * Each arrangement is the item-drawing half of the whole-card layout it
 * replaces, moved here as-is so a card looks the same after the move. The
 * heading those layouts drew above their items is now a leaf of its own.
 */
export function GroupRenderer({ node, variant }: { node: GroupNode; variant: VisualStyle }) {
  const expressive = variant === 'expressive'

  switch (node.arrangement) {
    case 'boxes':
      // From StatGridLayout: equal cells, a surface box when expressive and a
      // top accent rule when structured.
      return (
        <div
          className="grid gap-6"
          style={{ gridTemplateColumns: `repeat(${node.items.length}, minmax(0, 1fr))` }}
        >
          {node.items.map(({ block, index }) => (
            <div
              key={index}
              className={expressive ? 'rounded-slide-sm bg-slide-surface p-5' : 'border-t-2 border-slide-accent pt-4'}
            >
              <StatBlockView
                value={block.value}
                label={block.label}
                valueRef={textRef(index, 'value')}
                labelRef={textRef(index, 'label')}
              />
            </div>
          ))}
        </div>
      )

    default:
      // An arrangement not ported yet draws its items as plain blocks — exactly
      // how Stage 0's leftovers drew them — so a card holding one looks no worse
      // than it did before. The final task of this work removes this fallback.
      return (
        <>
          {flattenNodes([node]).map(({ block, index }) => (
            <BlockRenderer key={index} block={block} index={index} />
          ))}
        </>
      )
  }
}
