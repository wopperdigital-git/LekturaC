import type { VisualStyle } from '@/engine/contentBlocks'
import { flattenNodes, type GroupNode } from '@/engine/groups'
import { textRef } from '@/engine/marks'
import { SLIDE_BODY_FONT, SLIDE_HEADING_FONT } from '@/lib/theme-tokens'
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

    case 'columns':
      // From ComparisonLayout: stacked rows when expressive, side-by-side cards
      // when structured. The first column is featured in both.
      if (expressive) {
        return (
          <div className="flex flex-col divide-y divide-slide-border">
            {node.items.map((group, i) => {
              const featured = i === 0
              return (
                <Adjustable key={group.index} index={group.index}>
                  <div className="flex flex-col gap-3 py-4" style={{ fontFamily: SLIDE_BODY_FONT }}>
                    <div className={`font-semibold ${featured ? 'text-slide-accent' : 'text-slide-foreground'}`}>
                      <EditableText textRef={textRef(group.index, 'heading')} value={group.block.heading} />
                    </div>
                    <ul className="flex flex-col gap-2">
                      {group.block.items.map((item, j) => (
                        <li key={j} className="flex items-start gap-2 text-sm text-slide-foreground/90">
                          <span
                            className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                              featured ? 'bg-slide-accent' : 'bg-slide-muted'
                            }`}
                          />
                          <EditableText textRef={textRef(group.index, 'items', j)} value={item} />
                        </li>
                      ))}
                    </ul>
                  </div>
                </Adjustable>
              )
            })}
          </div>
        )
      }
      return (
        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: `repeat(${node.items.length}, minmax(0, 1fr))` }}
        >
          {node.items.map((group, i) => {
            const featured = i === 0
            return (
              <Adjustable key={group.index} index={group.index}>
                <div
                  className={`rounded-slide-sm border p-4 ${
                    featured ? 'border-slide-accent bg-slide-accent/10' : 'border-slide-border bg-slide-surface'
                  }`}
                  style={{ fontFamily: SLIDE_BODY_FONT }}
                >
                  <div className={`mb-3 font-semibold ${featured ? 'text-slide-accent' : 'text-slide-foreground'}`}>
                    <EditableText textRef={textRef(group.index, 'heading')} value={group.block.heading} />
                  </div>
                  <ul className="flex flex-col gap-2">
                    {group.block.items.map((item, j) => (
                      <li key={j} className="flex items-start gap-2 text-sm text-slide-foreground/90">
                        <span
                          className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                            featured ? 'bg-slide-accent' : 'bg-slide-muted'
                          }`}
                        />
                        <EditableText textRef={textRef(group.index, 'items', j)} value={item} />
                      </li>
                    ))}
                  </ul>
                </div>
              </Adjustable>
            )
          })}
        </div>
      )

    case 'chips': {
      // From IconGridLayout: pill chips when expressive, numbered tiles when
      // structured. A list group always holds exactly one list.
      const [list] = node.items
      if (expressive) {
        return (
          <Adjustable index={list.index}>
            <div className="flex flex-wrap gap-3" style={{ fontFamily: SLIDE_BODY_FONT }}>
              {list.block.items.map((item, i) => (
                <div key={i} className="flex items-center gap-2 rounded-full bg-slide-accent/10 py-2 pl-2 pr-4">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slide-accent to-slide-accent-soft text-xs font-semibold text-slide-accent-foreground">
                    {i + 1}
                  </span>
                  <span className="text-sm text-slide-foreground/90">
                    <EditableText textRef={textRef(list.index, 'items', i)} value={item} />
                  </span>
                </div>
              ))}
            </div>
          </Adjustable>
        )
      }
      return (
        <Adjustable index={list.index}>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3" style={{ fontFamily: SLIDE_BODY_FONT }}>
            {list.block.items.map((item, i) => (
              <div
                key={i}
                className="flex flex-col items-start gap-2 rounded-slide-sm border border-slide-border bg-slide-surface p-4"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slide-accent text-sm font-semibold text-slide-accent-foreground">
                  {i + 1}
                </span>
                <span className="text-sm text-slide-foreground/90">
                  <EditableText textRef={textRef(list.index, 'items', i)} value={item} />
                </span>
              </div>
            ))}
          </div>
        </Adjustable>
      )
    }

    case 'numbered': {
      // From NumberedListLayout: numbered cards when expressive, divided rows
      // with zero-padded numbers when structured.
      const [list] = node.items
      if (expressive) {
        return (
          <Adjustable index={list.index}>
            <ol className="flex flex-col gap-3" style={{ fontFamily: SLIDE_BODY_FONT }}>
              {list.block.items.map((item, i) => (
                <li key={i} className="flex items-center gap-4 rounded-slide-sm bg-slide-surface p-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slide-accent to-slide-accent-soft text-sm font-semibold text-slide-accent-foreground">
                    {i + 1}
                  </span>
                  <span className="text-slide-foreground/90">
                    <EditableText textRef={textRef(list.index, 'items', i)} value={item} />
                  </span>
                </li>
              ))}
            </ol>
          </Adjustable>
        )
      }
      return (
        <Adjustable index={list.index}>
          <ol className="flex flex-col divide-y divide-slide-border" style={{ fontFamily: SLIDE_BODY_FONT }}>
            {list.block.items.map((item, i) => (
              <li key={i} className="flex items-baseline gap-4 py-3">
                <span className="shrink-0 text-slide-accent" style={{ fontFamily: SLIDE_HEADING_FONT, fontWeight: 600 }}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="text-slide-foreground/90">
                  <EditableText textRef={textRef(list.index, 'items', i)} value={item} />
                </span>
              </li>
            ))}
          </ol>
        </Adjustable>
      )
    }

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
