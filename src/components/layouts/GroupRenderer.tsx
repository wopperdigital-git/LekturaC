import type { CSSProperties } from 'react'
import { itemStep } from '@/engine/composition'
import { MAX_CHIP_ITEMS } from '@/engine/layoutEngine'
import type { VisualStyle } from '@/engine/contentBlocks'
import type { GroupNode } from '@/engine/groups'
import { textRef } from '@/engine/marks'
import { SLIDE_BODY_FONT, SLIDE_GAP, SLIDE_HEADING_FONT, SLIDE_SIZE } from '@/lib/theme-tokens'
import { Adjustable } from './Adjustable'
import { PhotoCredit } from './PhotoCredit'
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
    case 'boxes':
      // Stats as figures on a shared baseline: each stat a column under a hairline (structured)
      // or bare (expressive), the figure in accent over its label. A stat grid has no accent owner.
      return <StatColumns items={node.items} expressive={expressive} fill={fill} />

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
      if (list.block.items.length > MAX_CHIP_ITEMS) {
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
      // Stats as a ledger: a right-aligned figure column and what it measures beside it, one row
      // per stat. Reads better than a grid once the labels are long.
      return <StatLedger items={node.items} expressive={expressive} fill={fill} />

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

/** Most items a numbered list draws in one column; more flow into two. The chips' limit: a list too long for columns of numerals is the one that wants two columns of rows. */
const MAX_SINGLE_COLUMN_ITEMS = MAX_CHIP_ITEMS

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
  const singleRow = items.length <= 4
  const columns = Math.max(1, singleRow ? items.length : 3)
  // Chip items are short by definition, so the text is always at the lead size. In a single row the
  // numeral is larger and the text sits at the foot of the column, so a filled slide has no empty lower half.
  const numeralSize = singleRow
    ? `calc(var(--slide-size-h1) * ${expressive ? 2 : 1.6})`
    : expressive
      ? 'calc(var(--slide-size-h1) * 1.25)'
      : 'var(--slide-size-h1)'
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
            <Numeral i={i} size={numeralSize} expressive={expressive} />
            <span
              data-item-text=""
              className={`min-w-0 text-slide-foreground/90${singleRow ? ' mt-auto' : ''}`}
              style={{ fontSize: SLIDE_SIZE.lead, ...(expressive ? { fontWeight: 600 } : {}) }}
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

  // A hairline between rows only: none above the first row of either column. In the column-flow list
  // the second column's first row has its rule below 640px, where it stacks under the first column.
  const ruleAbove = (i: number) => {
    if (!grid || expressive || i === 0) return ''
    if (kind === 'split') return i < 2 ? '' : ' border-t border-slide-border'
    return ` border-t border-slide-border${i === rows ? ' @min-[640px]:border-t-0' : ''}`
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
            className={`flex min-w-0 items-center${fill && !grid ? ' flex-1' : ''}${ruleAbove(i)}`}
            style={expressive ? undefined : { paddingBlock: SLIDE_GAP.tight }}
          >
            {mark(i)}
            <span data-item-text="" className="min-w-0 text-slide-foreground/90" style={{ fontSize: textSize }}>
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

/** The stat blocks of a `boxes` or `statRows` group, each with its own block index. */
type StatItems = Extract<GroupNode, { arrangement: 'boxes' | 'statRows' }>['items']

/**
 * How a grid of stats is laid out for a count: the columns, the figure's size as a multiple of
 * the h1 step, and how many characters of it fit a column at that size before it steps down.
 * Up to three stats are one row of wide columns with a large figure, four are a narrower row,
 * five and six are three to a row in two rows and seven or more four to a row.
 */
function statColumnPlan(count: number) {
  if (count <= 3) return { columns: Math.max(1, count), factor: 1.4, fullChars: 4 }
  if (count === 4) return { columns: 4, factor: 1.15, fullChars: 3 }
  if (count <= 6) return { columns: 3, factor: 1, fullChars: 5 }
  return { columns: 4, factor: 1, fullChars: 4 }
}

/**
 * Stats as columns on one baseline. The grid's rows come in pairs, a figure row and a label row,
 * and each stat is ONE element (so one `Adjustable`) that spans both rows and takes them from the
 * grid through `subgrid`: every figure in a row shares a baseline, and a label that wraps never
 * pushes a figure. The figure size is one for the whole grid, set by its longest value, so a long
 * number steps every figure down together. When it fills the body the label rows share the
 * height and each figure and label sits at the top of its column.
 */
function StatColumns({ items, expressive, fill }: { items: StatItems; expressive: boolean; fill: boolean }) {
  const { columns, factor, fullChars } = statColumnPlan(items.length)
  const longest = Math.max(...items.map(({ block }) => block.value.length))
  const figure = figureSize('h1', factor * (expressive ? 1.15 : 1), 'x'.repeat(longest), fullChars)
  return (
    <div
      {...(fill ? { 'data-fill': '' } : {})}
      className={`grid${fill ? ' flex-1' : ''}`}
      style={{
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        columnGap: SLIDE_GAP.section,
        rowGap: SLIDE_GAP.tight,
        gridAutoRows: fill ? 'auto minmax(min-content, 1fr)' : 'auto',
        ...(fill ? { alignContent: 'start' } : {}),
      }}
    >
      {items.map(({ block, index }, i) => (
        <Adjustable key={index} index={index}>
          <div
            className={`grid min-w-0 grid-rows-subgrid${expressive ? '' : ' border-t border-slide-accent'}`}
            style={{
              gridRow: 'span 2',
              fontFamily: SLIDE_BODY_FONT,
              fontSize: BODY_SIZE,
              ...(expressive ? {} : { paddingTop: SLIDE_GAP.tight }),
              ...(i >= columns ? { marginTop: SLIDE_GAP.group } : {}),
            }}
          >
            <div
              data-stat-figure=""
              className="min-w-0 text-slide-accent"
              style={{
                fontFamily: SLIDE_HEADING_FONT,
                fontSize: figure,
                fontWeight: expressive ? 800 : 600,
                lineHeight: 1,
              }}
            >
              <EditableText textRef={textRef(index, 'value')} value={block.value} />
            </div>
            <div data-stat-label="" className="min-w-0 text-slide-muted" style={{ fontSize: BODY_SIZE }}>
              <EditableText textRef={textRef(index, 'label')} value={block.label} />
            </div>
          </div>
        </Adjustable>
      ))}
    </div>
  )
}

/** The share of a ledger row its figure column takes. */
const LEDGER_FIGURE_WIDTH = '34%'

/**
 * Stats as a ledger: a right-aligned figure column (h2 when structured, h1 and heavier when
 * expressive), the label beside it at the labels' own step. Structured rows are separated by a
 * hairline, expressive ones by `SLIDE_GAP.tight` of space. The figure size is one for the whole
 * ledger, set by its longest value. When it fills the body the rows share the height.
 */
function StatLedger({ items, expressive, fill }: { items: StatItems; expressive: boolean; fill: boolean }) {
  const labelSize = itemStep(items.map(({ block }) => block.label)) === 'roomy' ? SLIDE_SIZE.lead : BODY_SIZE
  const longest = 'x'.repeat(Math.max(...items.map(({ block }) => block.value.length)))
  const figure = expressive ? figureSize('h1', 1, longest, 7) : figureSize('h2', 1, longest, 10)
  return (
    <div
      {...(fill ? { 'data-fill': '' } : {})}
      className={`flex flex-col${fill ? ' flex-1' : ''}`}
      style={expressive ? { gap: SLIDE_GAP.tight } : undefined}
    >
      {items.map(({ block, index }, i) => (
        <Adjustable key={index} index={index}>
          {/* The hairline is on the row itself: the `Adjustable` holder is `display: contents`, so a
              `divide-y` on the root would put its borders on holders that draw none. */}
          <div
            className={`flex ${fill ? 'flex-1 items-center' : 'items-baseline'}${expressive || i === 0 ? '' : ' border-t border-slide-border'}`}
            style={{
              gap: SLIDE_GAP.section,
              fontFamily: SLIDE_BODY_FONT,
              fontSize: BODY_SIZE,
              ...(expressive ? {} : { paddingBlock: SLIDE_GAP.tight }),
            }}
          >
            <div
              data-stat-figure=""
              className="shrink-0 text-right text-slide-accent"
              style={{
                width: LEDGER_FIGURE_WIDTH,
                fontFamily: SLIDE_HEADING_FONT,
                fontSize: figure,
                fontWeight: expressive ? 800 : 600,
                lineHeight: 1,
              }}
            >
              <EditableText textRef={textRef(index, 'value')} value={block.value} />
            </div>
            <div data-stat-label="" className="min-w-0 text-slide-foreground/90" style={{ fontSize: labelSize }}>
              <EditableText textRef={textRef(index, 'label')} value={block.label} />
            </div>
          </div>
        </Adjustable>
      ))}
    </div>
  )
}
