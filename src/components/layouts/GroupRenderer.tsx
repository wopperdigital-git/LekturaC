import { Fragment, type CSSProperties } from 'react'
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
      // Steps down one continuous track: a dot per step when structured, the step number when expressive.
      return <TimelineColumn items={node.items} expressive={expressive} fill={fill} />

    case 'columns':
      // Groups side by side in equal columns, the accent owner's on the tint.
      return <ComparisonColumns items={node.items} expressive={expressive} fill={fill} accentIndex={accentIndex} itemProps={itemProps} />

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

    case 'timelineRow':
      // Steps side by side on one track per row: up to five in a row, six or more in two rows.
      return <TimelineRow items={node.items} expressive={expressive} fill={fill} />

    case 'table':
      // One column per group on a shared grid, so the nth item of every group lines up.
      return <ComparisonTable items={node.items} expressive={expressive} fill={fill} accentIndex={accentIndex} itemProps={itemProps} />

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

/** The groups of a `columns` or `table` comparison, each with its own block index. */
type ComparisonItems = Extract<GroupNode, { arrangement: 'columns' | 'table' }>['items']

/**
 * The accent owner's panel: the tint, or the surface on a slide whose ground is already a tint or
 * deep (`[data-ground] [data-accent-panel]` in `index.css` sets `--slide-panel-bg`).
 */
const PANEL_BG = 'var(--slide-panel-bg, var(--slide-ground-tint))'

/** A comparison group's heading: h3, semibold, in accent for the accent owner and the foreground otherwise. */
const groupHeadingClass = (featured: boolean) => `font-semibold ${featured ? 'text-slide-accent' : 'text-slide-foreground'}`
const GROUP_HEADING_FONT = { fontFamily: SLIDE_HEADING_FONT, fontSize: 'var(--slide-size-h3)' }

/**
 * Groups side by side in equal columns (stacked below 640px of slide width). The accent owner's
 * group is drawn on the tint and every other group on the slide's own ground, all with the same
 * padding so their headings and rows line up; a vertical hairline separates two neighbours that are
 * both unowned. Items are ruled rows when structured (a hairline above each, the first too, under the
 * heading) and spaced rows led by a small accent square when expressive, at one size for all the groups'
 * items together. The rules sit on each group's own element: the `Adjustable` holders are
 * `display: contents`, so a `divide-x` on the root would put its borders on holders that draw none.
 * When it fills the body the columns stretch to the zone's height, their rows at the top.
 */
function ComparisonColumns({
  items,
  expressive,
  fill,
  accentIndex,
  itemProps,
}: {
  items: ComparisonItems
  expressive: boolean
  fill: boolean
  accentIndex: number | null
  itemProps: ItemProps
}) {
  const textSize = itemTextSize(items.flatMap(({ block }) => block.items))
  return (
    <div
      {...(fill ? { 'data-fill': '' } : {})}
      className={`grid @min-[640px]:[grid-template-columns:var(--cmp-cols)]${fill ? ' flex-1' : ''}`}
      style={
        {
          '--cmp-cols': `repeat(${items.length}, minmax(0, 1fr))`,
          columnGap: SLIDE_GAP.group,
          rowGap: SLIDE_GAP.group,
        } as CSSProperties
      }
    >
      {items.map((group, k) => {
        const featured = group.index === accentIndex
        const ruled = k > 0 && !featured && items[k - 1].index !== accentIndex
        return (
          <Adjustable key={group.index} index={group.index}>
            <div
              data-cmp-column=""
              data-accent-owner={featured ? '' : undefined}
              data-accent-panel={featured ? '' : undefined}
              className={`flex min-w-0 flex-col${featured ? ' rounded-slide-sm' : ''}${ruled ? ' @min-[640px]:border-l border-slide-border' : ''}`}
              style={{
                fontFamily: SLIDE_BODY_FONT,
                fontSize: BODY_SIZE,
                padding: SLIDE_GAP.group,
                ...(featured ? { background: PANEL_BG } : {}),
              }}
            >
              <div data-group-heading="" className={groupHeadingClass(featured)} style={GROUP_HEADING_FONT}>
                <EditableText textRef={textRef(group.index, 'heading')} value={group.block.heading} />
              </div>
              <ul className="flex flex-col" style={{ marginTop: SLIDE_GAP.tight, ...(expressive ? { gap: SLIDE_GAP.tight } : {}) }}>
                {group.block.items.map((item, j) => (
                  <li
                    key={j}
                    {...itemProps(group.index, j)}
                    className={`flex min-w-0 items-start${expressive ? '' : ' border-t border-slide-border'}`}
                    style={expressive ? { gap: SLIDE_GAP.tight } : { paddingBlock: SLIDE_GAP.tight }}
                  >
                    {expressive && (
                      <span
                        aria-hidden="true"
                        className="shrink-0 bg-slide-accent"
                        style={{ width: '0.45em', height: '0.45em', fontSize: textSize, marginTop: '0.55em' }}
                      />
                    )}
                    <span
                      data-item-text=""
                      className="min-w-0 text-slide-foreground/90"
                      style={{ fontSize: textSize, ...(expressive ? { fontWeight: 600 } : {}) }}
                    >
                      <EditableText textRef={textRef(group.index, 'items', j)} value={item} />
                    </span>
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

/**
 * Each group is one column of a shared grid, and its cells sit on the parent's rows through
 * `subgrid`, so the nth item of every group lines up even when one wraps onto a second line. Each
 * column is still a single element, which is what lets `Adjustable` wrap it like any other block. The
 * header is h3 and semibold over a 2px accent rule, in accent text for the accent owner, whose column
 * element carries the mark (and, when expressive, the tint panel); each cell is under a hairline.
 * Expressive columns carry horizontal padding only (so the panel has an edge without the owner's
 * header sitting lower than the others'). When it fills the body the item rows share the height and
 * the header row stays its content's height.
 */
function ComparisonTable({
  items,
  expressive,
  fill,
  accentIndex,
  itemProps,
}: {
  items: ComparisonItems
  expressive: boolean
  fill: boolean
  accentIndex: number | null
  itemProps: ItemProps
}) {
  const itemRows = Math.max(...items.map((group) => group.block.items.length))
  const rows = 1 + itemRows
  return (
    <div
      {...(fill ? { 'data-fill': '' } : {})}
      className={`grid items-stretch${fill ? ' flex-1' : ''}`}
      style={{
        gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`,
        columnGap: SLIDE_GAP.group,
        ...(fill ? { gridTemplateRows: `auto repeat(${itemRows}, minmax(min-content, 1fr))` } : {}),
      }}
    >
      {items.map((group) => {
        const featured = group.index === accentIndex
        const panel = expressive && featured
        return (
          <Adjustable key={group.index} index={group.index}>
            <div
              data-accent-owner={featured ? '' : undefined}
              data-accent-panel={panel ? '' : undefined}
              className={`grid min-w-0 grid-rows-subgrid${panel ? ' rounded-slide-sm' : ''}`}
              style={{
                gridRow: `span ${rows}`,
                fontFamily: SLIDE_BODY_FONT,
                fontSize: BODY_SIZE,
                ...(expressive ? { paddingInline: SLIDE_GAP.tight } : {}),
                ...(panel ? { background: PANEL_BG } : {}),
              }}
            >
              <div
                data-group-heading=""
                className={`border-b-2 border-slide-accent ${groupHeadingClass(featured)}`}
                style={{
                  ...GROUP_HEADING_FONT,
                  paddingBottom: SLIDE_GAP.tight,
                  ...(expressive ? { paddingTop: SLIDE_GAP.tight } : {}),
                }}
              >
                <EditableText textRef={textRef(group.index, 'heading')} value={group.block.heading} />
              </div>
              {group.block.items.map((item, j) => (
                <div
                  key={j}
                  {...itemProps(group.index, j)}
                  className="border-b border-slide-border text-slide-foreground/90"
                  style={{ paddingBlock: SLIDE_GAP.tight }}
                >
                  <span data-item-text="">
                    <EditableText textRef={textRef(group.index, 'items', j)} value={item} />
                  </span>
                </div>
              ))}
            </div>
          </Adjustable>
        )
      })}
    </div>
  )
}

/** The stat blocks of a `boxes` or `statRows` group, each with its own block index. */
type StatItems = Extract<GroupNode, { arrangement: 'boxes' | 'statRows' }>['items']

/**
 * How a grid of stats is laid out for a count: the columns, the figure's size as a multiple of
 * the h1 step, and how many characters of it fit a column at that size before that figure steps
 * down. Up to three stats are one row of wide columns, four a narrower row, five and six are
 * three to a row in two rows and seven or more four to a row. The character budgets come from the
 * column width at the 976px slide (about 270px for three columns, 190px for four) over about
 * 0.65em a character at the heavier expressive size.
 */
function statColumnPlan(count: number) {
  if (count <= 3) return { columns: Math.max(1, count), factor: 2.2, fullChars: 3 }
  if (count === 4) return { columns: 4, factor: 1.7, fullChars: 3 }
  if (count <= 6) return { columns: 3, factor: 1.4, fullChars: 4 }
  return { columns: 4, factor: 1.4, fullChars: 3 }
}

/**
 * Stats as columns on one baseline. The grid's rows come in pairs, a figure row and a label row,
 * and each stat is ONE element (so one `Adjustable`) that spans both rows and takes them from the
 * grid through `subgrid`: every figure in a row shares a baseline, and a label that wraps never
 * pushes a figure. Each figure is sized by its own value, so one long number steps down alone, and
 * sits at the foot of the figure row so a smaller one shares its neighbours' baseline. The label is
 * at the lead size when the labels are few and short, else the body size. When it fills the body
 * the label rows share the height and each figure and label sits at the top of its column.
 */
function StatColumns({ items, expressive, fill }: { items: StatItems; expressive: boolean; fill: boolean }) {
  const { columns, factor, fullChars } = statColumnPlan(items.length)
  const figureFactor = factor * (expressive ? 1.15 : 1)
  const labelSize = itemStep(items.map(({ block }) => block.label)) === 'roomy' ? SLIDE_SIZE.lead : BODY_SIZE
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
                fontSize: figureSize('h1', figureFactor, block.value, fullChars),
                fontWeight: expressive ? 800 : 600,
                lineHeight: 1,
                alignSelf: 'end',
              }}
            >
              <EditableText textRef={textRef(index, 'value')} value={block.value} />
            </div>
            <div data-stat-label="" className="min-w-0 text-slide-muted" style={{ fontSize: labelSize }}>
              <EditableText textRef={textRef(index, 'label')} value={block.label} />
            </div>
          </div>
        </Adjustable>
      ))}
    </div>
  )
}

/** The share of a ledger row its figure column takes. */
const LEDGER_FIGURE_WIDTH = '24%'

/**
 * Stats as a ledger: a left-aligned figure column on the frame's left edge (h2 when structured, h1 and heavier when
 * expressive), the label beside it at the labels' own step. Structured rows are separated by a
 * hairline, expressive ones by `SLIDE_GAP.tight` of space. The figure size is one for the whole
 * ledger, set by its longest value. When it fills the body the rows share the height.
 */
function StatLedger({ items, expressive, fill }: { items: StatItems; expressive: boolean; fill: boolean }) {
  const labelSize = itemStep(items.map(({ block }) => block.label)) === 'roomy' ? SLIDE_SIZE.lead : BODY_SIZE
  const longest = 'x'.repeat(Math.max(...items.map(({ block }) => block.value.length)))
  const figure = expressive ? figureSize('h1', 1, longest, 5) : figureSize('h2', 1, longest, 8)
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
              className="shrink-0 text-slide-accent"
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

/** The steps of a `timeline` or `timelineRow` group, each with its own block index. */
type StepItems = Extract<GroupNode, { arrangement: 'timeline' | 'timelineRow' }>['items']

/** The step label's line height, shared by the label and the node beside it so the node sits on the label's first line. */
const STEP_LABEL_LINE = 1.3
/** The track's thickness in px: structured, and expressive which is 2px thicker. */
const trackThickness = (expressive: boolean) => (expressive ? 4 : 2)

/** The size of a step's text: the lead size for a few short steps, the body size otherwise. */
const stepTextSize = (items: StepItems) => itemTextSize(items.map(({ block }) => block.text))

/** A step's label (accent, h3, semibold) over its text, both editable runs under the step's own address. */
function StepWords({ step, textSize }: { step: StepItems[number]; textSize: string }) {
  return (
    <div className="min-w-0 flex-1">
      <div
        data-step-label=""
        className="text-slide-accent"
        style={{
          fontFamily: SLIDE_HEADING_FONT,
          fontSize: 'var(--slide-size-h3)',
          fontWeight: 600,
          lineHeight: STEP_LABEL_LINE,
        }}
      >
        <EditableText textRef={textRef(step.index, 'label')} value={step.block.label} />
      </div>
      <div data-step-text="" className="text-slide-foreground" style={{ fontFamily: SLIDE_BODY_FONT, fontSize: textSize }}>
        <EditableText textRef={textRef(step.index, 'text')} value={step.block.text} />
      </div>
    </div>
  )
}

/**
 * Steps down one continuous track. The track is a single decorative line behind the nodes, the
 * full height of the arrangement, at the centre of the node column; each node is positioned so it
 * is drawn over the track. Structured nodes are a small accent dot, expressive ones the step number
 * on a patch of the slide's background so the track does not run through it. When it fills the body
 * the steps share the height, their content at the top.
 */
function TimelineColumn({ items, expressive, fill }: { items: StepItems; expressive: boolean; fill: boolean }) {
  const textSize = stepTextSize(items)
  const thickness = trackThickness(expressive)
  return (
    <ol
      {...(fill ? { 'data-fill': '' } : {})}
      className={`relative flex flex-col${fill ? ' flex-1' : ''}`}
      style={{ gap: SLIDE_GAP.group, fontFamily: SLIDE_BODY_FONT, fontSize: BODY_SIZE }}
    >
      <div
        aria-hidden="true"
        data-track=""
        className="absolute inset-y-0 bg-slide-accent/40"
        style={{ left: `calc(1.25em - ${thickness / 2}px)`, width: `${thickness}px` }}
      />
      {items.map((step, i) => (
        <Adjustable key={step.index} index={step.index}>
          <li
            className={`flex items-start${fill ? ' flex-1' : ''}`}
            style={{ gap: SLIDE_GAP.tight, fontFamily: SLIDE_BODY_FONT, fontSize: BODY_SIZE }}
          >
            <span
              aria-hidden="true"
              className={`relative flex shrink-0 items-center justify-center${expressive ? ' bg-slide-background' : ''}`}
              style={{ width: '2.5em', height: `calc(var(--slide-size-h3) * ${STEP_LABEL_LINE})` }}
            >
              {expressive ? (
                <span
                  data-step-number=""
                  className="text-slide-accent"
                  style={{
                    fontFamily: SLIDE_HEADING_FONT,
                    fontSize: 'var(--slide-size-h3)',
                    fontWeight: 800,
                    lineHeight: STEP_LABEL_LINE,
                  }}
                >
                  {i + 1}
                </span>
              ) : (
                <span className="block rounded-full bg-slide-accent" style={{ width: '0.75em', height: '0.75em' }} />
              )}
            </span>
            <StepWords step={step} textSize={textSize} />
          </li>
        </Adjustable>
      ))}
    </ol>
  )
}

/** Most steps one row of a horizontal timeline holds; more wrap into two rows. */
const MAX_ROW_STEPS = 5

/**
 * Steps side by side in equal columns, a full-width track above each row of them. The track is a
 * grid item spanning every column; a step's node (a dot at its column's left edge, drawn over the
 * track) is pulled up onto it by half its own height, and expressive steps have no dot but the step
 * number above the label. Six or more steps wrap into two rows of `ceil(n / 2)`, each with its
 * own track. When it fills the body the step rows share the height, content at the top.
 */
function TimelineRow({ items, expressive, fill }: { items: StepItems; expressive: boolean; fill: boolean }) {
  const textSize = stepTextSize(items)
  const thickness = trackThickness(expressive)
  const columns = items.length <= MAX_ROW_STEPS ? items.length : Math.ceil(items.length / 2)
  const rowCount = Math.ceil(items.length / columns)
  const stepRow = fill ? 'minmax(min-content, 1fr)' : 'auto'
  return (
    <ol
      {...(fill ? { 'data-fill': '' } : {})}
      className={`grid${fill ? ' flex-1' : ''}`}
      style={{
        fontFamily: SLIDE_BODY_FONT,
        fontSize: BODY_SIZE,
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        gridTemplateRows: Array.from({ length: rowCount }, () => `auto ${stepRow}`).join(' '),
        columnGap: SLIDE_GAP.group,
        ...(fill ? { alignContent: 'start' } : {}),
      }}
    >
      {items.map((step, i) => (
        <Fragment key={step.index}>
          {i % columns === 0 && (
            <div
              aria-hidden="true"
              data-track=""
              className="bg-slide-accent/40"
              style={{
                gridColumn: '1 / -1',
                height: `${thickness}px`,
                ...(i > 0 ? { marginTop: SLIDE_GAP.section } : {}),
              }}
            />
          )}
          <Adjustable index={step.index}>
            <li className="flex min-w-0 flex-col" style={{ gap: SLIDE_GAP.tight, fontFamily: SLIDE_BODY_FONT, fontSize: BODY_SIZE }}>
              {expressive ? (
                <span
                  aria-hidden="true"
                  data-step-number=""
                  className="block text-slide-accent"
                  style={{
                    fontFamily: SLIDE_HEADING_FONT,
                    fontSize: 'var(--slide-size-h1)',
                    fontWeight: 800,
                    lineHeight: 1,
                    marginTop: SLIDE_GAP.tight,
                  }}
                >
                  {i + 1}
                </span>
              ) : (
                <span
                  aria-hidden="true"
                  className="relative block rounded-full bg-slide-accent"
                  style={{ width: '0.75em', height: '0.75em', marginTop: `calc(-0.375em - ${thickness / 2}px)` }}
                />
              )}
              <StepWords step={step} textSize={textSize} />
            </li>
          </Adjustable>
        </Fragment>
      ))}
    </ol>
  )
}
