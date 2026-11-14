import type { CSSProperties } from 'react'
import { itemStep } from '@/engine/composition'
import type { VisualStyle } from '@/engine/contentBlocks'
import type { GroupNode } from '@/engine/groups'
import { textRef } from '@/engine/marks'
import { SLIDE_BODY_FONT, SLIDE_GAP, SLIDE_HEADING_FONT, SLIDE_SIZE } from '@/lib/theme-tokens'
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
 * Each arrangement draws its items under their original indices. Which element may
 * be accent-filled or featured is decided by `accentIndex`, never by the arrangement
 * itself. The heading above the items is a leaf of its own.
 */
export function GroupRenderer({
  node,
  variant,
  accentIndex,
  fill = false,
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
  /**
   * True when this group is the only thing in the slide's body zone (`fillNode`). The
   * arrangement's root then carries `data-fill` and `flex-1`, so it takes the height the
   * head leaves, and its rows (a column of rows) or cells (a grid, already stretched)
   * share it. It changes how the arrangement is sized and nothing about what it draws.
   */
  fill?: boolean
}) {
  const fillAttr = fill ? { 'data-fill': '' } : {}
  const grow = fill ? ' flex-1' : ''
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
          {...fillAttr}
          className={`grid items-stretch gap-6${grow}`}
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
          <ol {...fillAttr} className={`flex flex-col gap-4${grow}`}>
            {node.items.map((step, i) => (
              <Adjustable key={step.index} index={step.index}>
                <li
                  className={`flex gap-4 rounded-slide-sm bg-slide-surface p-4${grow}`}
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
        <ol {...fillAttr} className={`relative flex flex-col gap-6${grow}`}>
          <div
            aria-hidden="true"
            className="absolute inset-y-0 left-[calc(var(--spacing)*1.5)] w-0.5 -translate-x-1/2 bg-gradient-to-b from-slide-accent/45 via-slide-accent-soft/45 to-transparent"
          />
          {node.items.map((step) => (
            <Adjustable key={step.index} index={step.index}>
              <li className={`relative pl-6${grow}`} style={{ fontFamily: SLIDE_BODY_FONT, fontSize: BODY_SIZE }}>
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
          <div {...fillAttr} className={`flex flex-col divide-y divide-slide-border${grow}`}>
            {node.items.map((group) => {
              const featured = group.index === accentIndex
              return (
                <Adjustable key={group.index} index={group.index}>
                  <div
                    className={`flex flex-col gap-3 py-4${grow}`}
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
          {...fillAttr}
          className={`grid items-stretch gap-4${grow}`}
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
      // From IconGridLayout. Up to six items are columns of a big numeral over the item's
      // text; seven or more are too many columns to read, so they are drawn as numbered rows.
      // A list group always holds exactly one list.
      const [list] = node.items
      if (list.block.items.length > MAX_CHIP_COLUMNS) {
        return <RuledRows list={list} kind="numbered" expressive={expressive} fill={fill} itemProps={itemProps} />
      }
      return <NumeralColumns list={list} expressive={expressive} fill={fill} itemProps={itemProps} />
    }

    case 'numbered': {
      // From NumberedListLayout: ruled rows with the numeral as the graphic.
      const [list] = node.items
      return <RuledRows list={list} kind="numbered" expressive={expressive} fill={fill} itemProps={itemProps} />
    }

    case 'checklist': {
      // A list drawn as things to tick off: the numbered rows with a tick for the numeral.
      // Reached only by choosing it, the classifier never awards it.
      const [list] = node.items
      return <RuledRows list={list} kind="checklist" expressive={expressive} fill={fill} itemProps={itemProps} />
    }

    case 'split': {
      // Two columns of ruled rows. Suits a longer list that would otherwise run tall.
      const [list] = node.items
      return <RuledRows list={list} kind="split" expressive={expressive} fill={fill} itemProps={itemProps} />
    }

    case 'statRows':
      // Stats as a ledger: the figure on the left and what it measures beside
      // it, one row per stat. Reads better than a grid once the labels are long.
      // The figure is accent text in both treatments, never a fill; the expressive
      // rows sit on a surface card and set it heavier.
      return (
        <div
          {...fillAttr}
          className={`${expressive ? 'flex flex-col gap-3' : 'flex flex-col divide-y divide-slide-border'}${grow}`}
        >
          {node.items.map(({ block, index }) => (
            <Adjustable key={index} index={index}>
              <div
                className={`flex gap-6 ${expressive ? 'items-center rounded-slide-sm bg-slide-surface p-3' : 'items-baseline py-4'}${grow}`}
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
        <ol {...fillAttr} className={`grid items-stretch gap-6${grow}`} style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
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
          {...fillAttr}
          className={`grid items-stretch gap-x-4${grow}`}
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
          <div {...fillAttr} className={`flex flex-col gap-3${grow}`}>
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
        <div {...fillAttr} className={`grid grid-cols-2 gap-3 @min-[640px]:grid-cols-3${grow}`}>
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


/** The item props a layout spreads per item: `useItemProps()`'s return value. */
type ItemProps = ReturnType<typeof useItemProps>
/** A list group's one list: its block index and its items. */
type ListNode = { index: number; block: { items: string[] } }

/** Most items drawn as columns of numerals; more fall back to numbered rows. */
const MAX_CHIP_COLUMNS = 6
/** Most items a numbered list draws in one column; more flow into two. */
const MAX_SINGLE_COLUMN_ITEMS = 6

/** `01`, `02`, ... The numerals are decoration, drawn beside the item, never part of its text. */
const numeralText = (i: number) => String(i + 1).padStart(2, '0')

/** The size of a list's item text: the lead size for a few short items, the body size otherwise. */
const itemTextSize = (items: string[]) => (itemStep(items) === 'roomy' ? SLIDE_SIZE.lead : BODY_SIZE)

function Numeral({
  i,
  size,
  expressive,
  width,
}: {
  i: number
  size: string
  expressive: boolean
  width?: string
}) {
  return (
    <span
      aria-hidden="true"
      className="shrink-0 text-slide-accent"
      style={{
        fontFamily: SLIDE_HEADING_FONT,
        fontSize: size,
        fontWeight: expressive ? 800 : 600,
        lineHeight: 1,
        ...(width ? { width } : {}),
      }}
    >
      {numeralText(i)}
    </span>
  )
}

/**
 * Up to six items as columns, each a big accent numeral over the item's text: one row of
 * equal columns for up to four, three columns in two rows for five or six. A column is
 * under a hairline when structured and bare when expressive. When it fills the body the
 * columns stretch to the zone's height with their content at the top.
 */
function NumeralColumns({
  list,
  expressive,
  fill,
  itemProps,
}: {
  list: ListNode
  expressive: boolean
  fill: boolean
  itemProps: ItemProps
}) {
  const items = list.block.items
  const columns = Math.max(1, items.length <= 4 ? items.length : 3)
  const textSize = itemTextSize(items)
  return (
    <Adjustable index={list.index}>
      <ol
        {...(fill ? { 'data-fill': '' } : {})}
        className={`grid${fill ? ' flex-1' : ''}`}
        style={{
          fontFamily: SLIDE_BODY_FONT,
          fontSize: BODY_SIZE,
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
          gap: SLIDE_GAP.section,
          ...(fill ? { gridAutoRows: 'minmax(min-content, 1fr)' } : {}),
        }}
      >
        {items.map((item, i) => (
          <li
            key={i}
            {...itemProps(list.index, i)}
            className={`flex min-w-0 flex-col${expressive ? '' : ' border-t border-slide-border'}`}
            style={{ gap: SLIDE_GAP.tight, ...(expressive ? {} : { paddingTop: SLIDE_GAP.tight }) }}
          >
            <Numeral
              i={i}
              size={expressive ? 'calc(var(--slide-size-h1) * 1.25)' : 'var(--slide-size-h1)'}
              expressive={expressive}
            />
            <span
              className="min-w-0 text-slide-foreground/90"
              style={{ fontSize: textSize, ...(expressive ? { fontWeight: 600 } : {}) }}
            >
              <EditableText textRef={textRef(list.index, 'items', i)} value={item} />
            </span>
          </li>
        ))}
      </ol>
    </Adjustable>
  )
}

/**
 * The list arrangements built from ruled rows: a mark (numeral, tick or square) in a fixed
 * column, the item's text beside it, centred in the row. Structured rows are separated by
 * a hairline, expressive ones by `SLIDE_GAP.tight` of space alone. `numbered` past six items
 * and `split` are two columns of rows (`numbered` flows down the first column then the
 * second from 640px of slide width up, one column below it; `split` reads across). When it
 * fills the body the rows share the zone's height.
 */
function RuledRows({
  list,
  kind,
  expressive,
  fill,
  itemProps,
}: {
  list: ListNode
  kind: 'numbered' | 'checklist' | 'split'
  expressive: boolean
  fill: boolean
  itemProps: ItemProps
}) {
  const items = list.block.items
  const textSize = itemTextSize(items)
  const long = kind === 'numbered' && items.length > MAX_SINGLE_COLUMN_ITEMS
  const grid = long || kind === 'split'
  const Tag = kind === 'numbered' ? 'ol' : 'ul'
  const rows = Math.ceil(items.length / 2)
  const rowSize = fill ? 'minmax(min-content, 1fr)' : 'auto'

  const mark = (i: number) => {
    if (kind === 'numbered') {
      const size = long ? 'var(--slide-size-h3)' : expressive ? 'var(--slide-size-h1)' : 'var(--slide-size-h2)'
      return <Numeral i={i} size={size} expressive={expressive} width="3.5em" />
    }
    if (kind === 'split') {
      if (expressive) return <Numeral i={i} size="var(--slide-size-h3)" expressive width="2.5em" />
      return (
        <span aria-hidden="true" className="flex shrink-0 items-center" style={{ width: '1.5em', fontSize: textSize }}>
          <span className="block bg-slide-accent" style={{ width: '0.5em', height: '0.5em' }} />
        </span>
      )
    }
    return <CheckMark ring={expressive} size={textSize} />
  }

  let className = grid ? 'grid' : 'flex flex-col'
  const style: Record<string, string | number> = { fontFamily: SLIDE_BODY_FONT, fontSize: BODY_SIZE }
  if (!grid && !expressive) className += ' divide-y divide-slide-border'
  if (!grid && expressive) style.gap = SLIDE_GAP.tight
  if (long) {
    className +=
      ' grid-cols-1 @min-[640px]:grid-cols-2 @min-[640px]:grid-flow-col @min-[640px]:[grid-template-rows:var(--list-rows)]'
    style['--list-rows'] = `repeat(${rows}, ${rowSize})`
  }
  if (kind === 'split') className += ' grid-cols-2'
  if (grid) {
    style.columnGap = SLIDE_GAP.section
    style.rowGap = expressive ? SLIDE_GAP.tight : 0
    if (fill) style.gridAutoRows = rowSize
  }
  if (fill) className += ' flex-1'

  return (
    <Adjustable index={list.index}>
      <Tag {...(fill ? { 'data-fill': '' } : {})} className={className} style={style as CSSProperties}>
        {items.map((item, i) => (
          <li
            key={i}
            {...itemProps(list.index, i)}
            className={`flex min-w-0 items-center${fill && !grid ? ' flex-1' : ''}${
              grid && !expressive ? ' border-t border-slide-border' : ''
            }`}
            style={expressive ? undefined : { paddingBlock: SLIDE_GAP.tight }}
          >
            {mark(i)}
            <span className="min-w-0 text-slide-foreground/90" style={{ fontSize: textSize }}>
              <EditableText textRef={textRef(list.index, 'items', i)} value={item} />
            </span>
          </li>
        ))}
      </Tag>
    </Adjustable>
  )
}

/**
 * A tick in the numeral's column: plain in accent when structured, inside an unfilled accent
 * ring when expressive. Decorative: the item's own text carries the meaning. Sized from the
 * item's own text size, so it stays in proportion to the row.
 */
function CheckMark({ ring, size }: { ring: boolean; size: string }) {
  const tick = (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0 text-slide-accent"
      style={ring ? { width: '1em', height: '1em' } : { width: '1.4em', height: '1.4em' }}
    >
      <path d="M5 13l4 4L19 7" />
    </svg>
  )
  return (
    <span aria-hidden="true" className="flex shrink-0 items-center" style={{ width: '2.5em', fontSize: size }}>
      {ring ? (
        <span
          className="flex shrink-0 items-center justify-center rounded-full border-2 border-slide-accent"
          style={{ width: '1.9em', height: '1.9em' }}
        >
          {tick}
        </span>
      ) : (
        tick
      )}
    </span>
  )
}
