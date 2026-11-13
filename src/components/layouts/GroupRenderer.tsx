import type { VisualStyle } from '@/engine/contentBlocks'
import type { GroupNode } from '@/engine/groups'
import { textRef } from '@/engine/marks'
import { SLIDE_BODY_FONT, SLIDE_HEADING_FONT } from '@/lib/theme-tokens'
import { Adjustable } from './Adjustable'
import { PhotoCredit } from './PhotoCredit'
import { StatBlockView } from './BlockRenderer'
import { EditableText } from './EditableText'
import { useItemProps } from './adjustContext'
import { figureSize } from './figureSize'

const BODY_SIZE = 'var(--slide-size-body)'

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
export function GroupRenderer({
  node,
  variant,
  accentIndex,
}: {
  node: GroupNode
  variant: VisualStyle
  /**
   * The index of the one block the slide may draw on an accent fill (`accentOwner`),
   * or null when it gives the fill to none. A group fills only the item whose block
   * index is this one, and marks it `data-accent-owner`; accent as text, a rule or a
   * small bullet or number disc is not a fill and is not counted.
   */
  accentIndex: number | null
}) {
  const expressive = variant === 'expressive'
  // Every list item is its own element: picked out, edited and removed by itself.
  const itemProps = useItemProps()

  switch (node.arrangement) {
    case 'boxes': {
      // From StatGridLayout: equal cells under a top accent rule. A stat is drawn
      // on an accent panel only when it is the slide's accent owner (expressive
      // only; a stat grid has none), and the expressive figure is heavier. Past
      // three cells the figure steps down to h2 so a long value still fits its column.
      const wide = node.items.length <= 3
      const longest = Math.max(...node.items.map(({ block }) => block.value.length))
      const valueSize = figureSize(wide ? 'h1' : 'h2', 1, 'x'.repeat(longest), wide ? 6 : 5)
      return (
        <div
          className="grid gap-6"
          style={{ gridTemplateColumns: `repeat(${node.items.length}, minmax(0, 1fr))` }}
        >
          {node.items.map(({ block, index }) =>
            expressive && index === accentIndex ? (
              <StatBlockView
                key={index}
                value={block.value}
                label={block.label}
                valueRef={textRef(index, 'value')}
                labelRef={textRef(index, 'label')}
                valueSize={valueSize}
                panel="min-w-0 rounded-slide-sm bg-slide-accent p-6 text-slide-accent-foreground"
                extrabold
                accentOwner
              />
            ) : (
              <div key={index} className="min-w-0 border-t-2 border-slide-accent pt-4">
                <StatBlockView
                  value={block.value}
                  label={block.label}
                  valueRef={textRef(index, 'value')}
                  labelRef={textRef(index, 'label')}
                  valueSize={valueSize}
                  extrabold={expressive}
                />
              </div>
            ),
          )}
        </div>
      )
    }

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
                  style={{ fontFamily: SLIDE_BODY_FONT, fontSize: BODY_SIZE }}
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slide-accent text-lg font-extrabold text-slide-accent-foreground">
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
              <li className="relative pl-6" style={{ fontFamily: SLIDE_BODY_FONT, fontSize: BODY_SIZE }}>
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
      // when structured. The featured column is the accent owner in both (the
      // structured card has the accent border and tint, the expressive row the
      // accent heading) and carries `data-accent-owner`; none is featured when
      // the slide's layout gives no owner.
      if (expressive) {
        return (
          <div className="flex flex-col divide-y divide-slide-border">
            {node.items.map((group) => {
              const featured = group.index === accentIndex
              return (
                <Adjustable key={group.index} index={group.index}>
                  <div
                    className="flex flex-col gap-3 py-4"
                    data-accent-owner={featured ? '' : undefined}
                    style={{ fontFamily: SLIDE_BODY_FONT, fontSize: BODY_SIZE }}
                  >
                    <div className={`font-semibold ${featured ? 'text-slide-accent' : 'text-slide-foreground'}`}>
                      <EditableText textRef={textRef(group.index, 'heading')} value={group.block.heading} />
                    </div>
                    <ul className="flex flex-col gap-2">
                      {group.block.items.map((item, j) => (
                        <li key={j} {...itemProps(group.index, j)} className="flex items-start gap-2 text-slide-foreground/90">
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
          {node.items.map((group) => {
            const featured = group.index === accentIndex
            return (
              <Adjustable key={group.index} index={group.index}>
                <div
                  className={`rounded-slide-sm border p-4 ${
                    featured ? 'border-slide-accent bg-slide-accent/10' : 'border-slide-border bg-slide-surface'
                  }`}
                  data-accent-owner={featured ? '' : undefined}
                  style={{ fontFamily: SLIDE_BODY_FONT, fontSize: BODY_SIZE }}
                >
                  <div className={`mb-3 font-semibold ${featured ? 'text-slide-accent' : 'text-slide-foreground'}`}>
                    <EditableText textRef={textRef(group.index, 'heading')} value={group.block.heading} />
                  </div>
                  <ul className="flex flex-col gap-2">
                    {group.block.items.map((item, j) => (
                      <li key={j} {...itemProps(group.index, j)} className="flex items-start gap-2 text-slide-foreground/90">
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
            <div className="flex flex-wrap gap-3" style={{ fontFamily: SLIDE_BODY_FONT, fontSize: BODY_SIZE }}>
              {list.block.items.map((item, i) => (
                <div key={i} {...itemProps(list.index, i)} className="flex items-center gap-2 rounded-full bg-slide-accent/10 py-2 pl-2 pr-4">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slide-accent to-slide-accent-soft text-xs font-semibold text-slide-accent-foreground">
                    {i + 1}
                  </span>
                  <span className="text-slide-foreground/90">
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
          <div className="grid grid-cols-2 gap-4 @min-[640px]:grid-cols-3" style={{ fontFamily: SLIDE_BODY_FONT, fontSize: BODY_SIZE }}>
            {list.block.items.map((item, i) => (
              <div
                key={i}
                {...itemProps(list.index, i)}
                className="flex flex-col items-start gap-2 rounded-slide-sm border border-slide-border bg-slide-surface p-4"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slide-accent text-sm font-semibold text-slide-accent-foreground">
                  {i + 1}
                </span>
                <span className="text-slide-foreground/90">
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
            <ol className="flex flex-col gap-2" style={{ fontFamily: SLIDE_BODY_FONT, fontSize: BODY_SIZE }}>
              {list.block.items.map((item, i) => (
                <li key={i} {...itemProps(list.index, i)} className="flex items-center gap-4 rounded-slide-sm bg-slide-surface px-4 py-2">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slide-accent to-slide-accent-soft text-lg font-extrabold text-slide-accent-foreground">
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
          <ol className="flex flex-col divide-y divide-slide-border" style={{ fontFamily: SLIDE_BODY_FONT, fontSize: BODY_SIZE }}>
            {list.block.items.map((item, i) => (
              <li key={i} {...itemProps(list.index, i)} className="flex items-baseline gap-4 py-3">
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

    case 'checklist': {
      // A list drawn as things to tick off: a plain check per row when
      // structured, a filled check on a card when expressive. Reached only by
      // choosing it — the classifier never awards it.
      const [list] = node.items
      if (expressive) {
        return (
          <Adjustable index={list.index}>
            <ul className="flex flex-col gap-2" style={{ fontFamily: SLIDE_BODY_FONT, fontSize: BODY_SIZE }}>
              {list.block.items.map((item, i) => (
                <li key={i} {...itemProps(list.index, i)} className="flex items-center gap-3 rounded-slide-sm bg-slide-surface px-4 py-2">
                  <CheckMark filled />
                  <span className="text-slide-foreground/90">
                    <EditableText textRef={textRef(list.index, 'items', i)} value={item} />
                  </span>
                </li>
              ))}
            </ul>
          </Adjustable>
        )
      }
      return (
        <Adjustable index={list.index}>
          <ul className="flex flex-col gap-3" style={{ fontFamily: SLIDE_BODY_FONT, fontSize: BODY_SIZE }}>
            {list.block.items.map((item, i) => (
              <li key={i} {...itemProps(list.index, i)} className="flex items-start gap-3">
                <CheckMark />
                <span className="text-slide-foreground/90">
                  <EditableText textRef={textRef(list.index, 'items', i)} value={item} />
                </span>
              </li>
            ))}
          </ul>
        </Adjustable>
      )
    }

    case 'split': {
      // Two columns of items: ruled cells when structured, accent-edged cards
      // when expressive. Suits a longer list that would otherwise run tall.
      const [list] = node.items
      if (expressive) {
        return (
          <Adjustable index={list.index}>
            <ul className="grid grid-cols-2 gap-4" style={{ fontFamily: SLIDE_BODY_FONT, fontSize: BODY_SIZE }}>
              {list.block.items.map((item, i) => (
                <li key={i} {...itemProps(list.index, i)} className="rounded-slide-sm border-l-4 border-slide-accent bg-slide-surface p-4">
                  <span className="text-slide-foreground/90">
                    <EditableText textRef={textRef(list.index, 'items', i)} value={item} />
                  </span>
                </li>
              ))}
            </ul>
          </Adjustable>
        )
      }
      return (
        <Adjustable index={list.index}>
          <ul className="grid grid-cols-2 gap-x-10 gap-y-2" style={{ fontFamily: SLIDE_BODY_FONT, fontSize: BODY_SIZE }}>
            {list.block.items.map((item, i) => (
              <li key={i} {...itemProps(list.index, i)} className="flex items-start gap-3 border-t border-slide-border pt-3">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 bg-slide-accent" />
                <span className="text-slide-foreground/90">
                  <EditableText textRef={textRef(list.index, 'items', i)} value={item} />
                </span>
              </li>
            ))}
          </ul>
        </Adjustable>
      )
    }

    case 'statRows':
      // Stats as a ledger: the figure on the left and what it measures beside
      // it, one row per stat. Reads better than a grid once the labels are long.
      // The figure is accent text in both treatments, never a fill; the expressive
      // rows sit on a surface card and set it heavier.
      return (
        <div className={expressive ? 'flex flex-col gap-3' : 'flex flex-col divide-y divide-slide-border'}>
          {node.items.map(({ block, index }) => (
            <Adjustable key={index} index={index}>
              <div
                className={`flex gap-6 ${expressive ? 'items-center rounded-slide-sm bg-slide-surface p-3' : 'items-baseline py-4'}`}
                style={{ fontFamily: SLIDE_BODY_FONT, fontSize: BODY_SIZE }}
              >
                <div
                  className={
                    expressive
                      ? 'w-1/3 shrink-0 font-extrabold text-slide-accent'
                      : 'w-1/3 shrink-0 font-bold text-slide-accent'
                  }
                  style={{ fontFamily: SLIDE_HEADING_FONT, fontSize: 'var(--slide-size-h2)', lineHeight: 1 }}
                >
                  <EditableText textRef={textRef(index, 'value')} value={block.value} />
                </div>
                <div className="text-slide-foreground/90">
                  <EditableText textRef={textRef(index, 'label')} value={block.label} />
                </div>
              </div>
            </Adjustable>
          ))}
        </div>
      )

    case 'timelineRow': {
      // The steps side by side, wrapping after four. A rule with a dot over each
      // step when structured; numbered cards when expressive.
      const columns = Math.min(node.items.length, 4)
      return (
        <ol className="grid gap-6" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
          {node.items.map((step, i) => (
            <Adjustable key={step.index} index={step.index}>
              {expressive ? (
                <li
                  className="flex flex-col gap-3 rounded-slide-sm bg-slide-surface p-4"
                  style={{ fontFamily: SLIDE_BODY_FONT, fontSize: BODY_SIZE }}
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slide-accent text-lg font-extrabold text-slide-accent-foreground">
                    {i + 1}
                  </span>
                  <div className="font-semibold text-slide-accent">
                    <EditableText textRef={textRef(step.index, 'label')} value={step.block.label} />
                  </div>
                  <div className="text-slide-foreground/90">
                    <EditableText textRef={textRef(step.index, 'text')} value={step.block.text} />
                  </div>
                </li>
              ) : (
                <li style={{ fontFamily: SLIDE_BODY_FONT, fontSize: BODY_SIZE }}>
                  <div className="relative mb-4 h-3">
                    <span className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-slide-accent/40" />
                    <span className="absolute left-0 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-slide-accent" />
                  </div>
                  <div className="font-semibold text-slide-accent">
                    <EditableText textRef={textRef(step.index, 'label')} value={step.block.label} />
                  </div>
                  <div className="text-slide-foreground/90">
                    <EditableText textRef={textRef(step.index, 'text')} value={step.block.text} />
                  </div>
                </li>
              )}
            </Adjustable>
          ))}
        </ol>
      )
    }

    case 'table': {
      /*
        Each group is one column of a shared grid, and its cells sit on the
        parent's rows through `subgrid`, so the nth item of every group lines up
        even when one wraps onto a second line. Each column is still a single
        element, which is what lets `Adjustable` wrap it like any other block.
      */
      const rows = 1 + Math.max(...node.items.map((group) => group.block.items.length))
      // The expressive header is filled only for the accent owner. Every other
      // header takes the structured rule, with the cells' own padding so the
      // columns still line up.
      return (
        <div
          className="grid gap-x-4"
          style={{ gridTemplateColumns: `repeat(${node.items.length}, minmax(0, 1fr))` }}
        >
          {node.items.map((group) => (
            <Adjustable key={group.index} index={group.index}>
              <div
                className="grid grid-rows-subgrid"
                style={{ gridRow: `span ${rows}`, fontFamily: SLIDE_BODY_FONT, fontSize: BODY_SIZE }}
              >
                <div
                  className={
                    expressive && group.index === accentIndex
                      ? 'rounded-t-slide-sm bg-slide-accent px-3 py-2 font-semibold text-slide-accent-foreground'
                      : `border-b-2 border-slide-accent font-semibold text-slide-foreground ${expressive ? 'px-3 py-2' : 'pb-2'}`
                  }
                  data-accent-owner={expressive && group.index === accentIndex ? '' : undefined}
                >
                  <EditableText textRef={textRef(group.index, 'heading')} value={group.block.heading} />
                </div>
                {group.block.items.map((item, j) => (
                  <div
                    key={j}
                    {...itemProps(group.index, j)}
                    className={`border-b border-slide-border text-slide-foreground/90 ${
                      expressive ? 'bg-slide-surface px-3 py-2' : 'py-2'
                    }`}
                  >
                    <EditableText textRef={textRef(group.index, 'items', j)} value={item} />
                  </div>
                ))}
              </div>
            </Adjustable>
          ))}
        </div>
      )
    }

    case 'gallery': {
      // From GalleryLayout. The expressive mosaic shows a featured image beside
      // two more, and the old layout silently dropped a fourth — so any image
      // beyond the mosaic now continues in a row beneath it.
      if (expressive) {
        const [featured, ...rest] = node.items
        const overflow = rest.slice(2)
        return (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <Adjustable index={featured.index}>
                <figure className="relative row-span-2 overflow-hidden rounded-slide-sm border border-slide-border">
                  <img
                    src={featured.block.url}
                    alt={featured.block.alt ?? ''}
                    className="h-full w-full object-cover"
                  />
                  <PhotoCredit credit={featured.block.credit} />
                </figure>
              </Adjustable>
              <div className="grid grid-rows-2 gap-3">
                {rest.slice(0, 2).map((img) => (
                  <Adjustable key={img.index} index={img.index}>
                    <figure className="relative overflow-hidden rounded-slide-sm border border-slide-border">
                      <img src={img.block.url} alt={img.block.alt ?? ''} className="aspect-square w-full object-cover" />
                      <PhotoCredit credit={img.block.credit} />
                    </figure>
                  </Adjustable>
                ))}
              </div>
            </div>
            {overflow.length > 0 && (
              <div className="grid grid-cols-3 gap-3">
                {overflow.map((img) => (
                  <Adjustable key={img.index} index={img.index}>
                    <figure className="relative overflow-hidden rounded-slide-sm border border-slide-border">
                      <img src={img.block.url} alt={img.block.alt ?? ''} className="aspect-square w-full object-cover" />
                      <PhotoCredit credit={img.block.credit} />
                    </figure>
                  </Adjustable>
                ))}
              </div>
            )}
          </div>
        )
      }
      return (
        <div className="grid grid-cols-2 gap-3 @min-[640px]:grid-cols-3">
          {node.items.map((img) => (
            <Adjustable key={img.index} index={img.index}>
              <figure className="relative overflow-hidden rounded-slide-sm border border-slide-border">
                <img src={img.block.url} alt={img.block.alt ?? ''} className="aspect-square w-full object-cover" />
                <PhotoCredit credit={img.block.credit} />
              </figure>
            </Adjustable>
          ))}
        </div>
      )
    }

    default: {
      // Every arrangement is drawn above, so this is unreachable. The
      // assignment makes adding an arrangement to `GroupNode` without a case
      // here a compile error, rather than a card silently drawn another way.
      const unreachable: never = node
      return unreachable
    }
  }
}

/** A tick, plain or on a filled disc. Decorative: the item's own text carries the meaning. */
function CheckMark({ filled = false }: { filled?: boolean }) {
  const tick = (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={filled ? 'h-3.5 w-3.5' : 'mt-1 h-5 w-5 shrink-0 text-slide-accent'}
    >
      <path d="M5 13l4 4L19 7" />
    </svg>
  )
  if (!filled) return tick
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slide-accent text-slide-accent-foreground">
      {tick}
    </span>
  )
}
