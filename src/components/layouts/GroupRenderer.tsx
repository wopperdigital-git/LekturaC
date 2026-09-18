import type { VisualStyle } from '@/engine/contentBlocks'
import { flattenNodes, type GroupNode } from '@/engine/groups'
import { textRef } from '@/engine/marks'
import { SLIDE_BODY_FONT } from '@/lib/theme-tokens'
import { Adjustable } from './Adjustable'
import { BlockRenderer, StatBlockView } from './BlockRenderer'
import { EditableText } from './EditableText'

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

    case 'timeline':
      // From TimelineLayout: a numbered card per step when expressive, a
      // vertical accent line with a dot per step when structured.
      if (expressive) {
        return (
          <ol className="flex flex-col gap-4">
            {node.items.map((step, i) => (
              <Adjustable key={step.index} index={step.index}>
                <li
                  className="flex gap-4 rounded-slide-sm bg-slide-surface p-4"
                  style={{ fontFamily: SLIDE_BODY_FONT }}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slide-accent text-sm font-semibold text-slide-accent-foreground">
                    {i + 1}
                  </span>
                  <div>
                    <div className="font-semibold text-slide-accent">
                      <EditableText textRef={textRef(step.index, 'label')} value={step.block.label} />
                    </div>
                    <div className="text-slide-foreground/90">
                      <EditableText textRef={textRef(step.index, 'text')} value={step.block.text} />
                    </div>
                  </div>
                </li>
              </Adjustable>
            ))}
          </ol>
        )
      }
      return (
        <ol className="relative flex flex-col gap-6">
          <div
            aria-hidden="true"
            className="absolute inset-y-0 left-[calc(var(--spacing)*1.5)] w-0.5 -translate-x-1/2 bg-gradient-to-b from-slide-accent/45 via-slide-accent-soft/45 to-transparent"
          />
          {node.items.map((step) => (
            <Adjustable key={step.index} index={step.index}>
              <li className="relative pl-6" style={{ fontFamily: SLIDE_BODY_FONT }}>
                <span className="absolute left-[calc(var(--spacing)*1.5)] top-1 h-3 w-3 -translate-x-1/2 rounded-full bg-slide-accent" />
                <div className="font-semibold text-slide-accent">
                  <EditableText textRef={textRef(step.index, 'label')} value={step.block.label} />
                </div>
                <div className="text-slide-foreground/90">
                  <EditableText textRef={textRef(step.index, 'text')} value={step.block.text} />
                </div>
              </li>
            </Adjustable>
          ))}
        </ol>
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
