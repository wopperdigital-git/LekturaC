import type { Indexed } from '@/engine/groups'
import type { PointBlock } from '@/engine/contentBlocks'
import { textRef } from '@/engine/marks'
import { SLIDE_BODY_FONT, SLIDE_GAP, SLIDE_HEADING_FONT } from '@/lib/theme-tokens'
import { Adjustable } from './Adjustable'
import { EditableText } from './EditableText'
import { termTextSize } from './termRowSize'

/** A row's fixed classes: the grid (one column, two from 640px of slide width), its hairline above and nothing else. */
const ROW_CLASS = 'grid min-w-0 grid-cols-1 border-t border-slide-border @min-[640px]:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]'

/**
 * A row's classes when it shares a run's height (`fill`): stacked below 640px the pair stays together
 * at the top of the row, from 640px up the single row is stretched and the words centred in it.
 */
const FILL_CLASS = 'flex-1 content-start items-start @min-[640px]:content-normal @min-[640px]:items-center'

/**
 * One term and its meaning as a row of a two-column grid: the term (the heading font, accent
 * text at h3, or h2 and heavier when expressive) on the left a third of the width and the
 * meaning on the right, stacked below 640px of slide width. The hairline above it is on the row
 * itself (`border-t`), and the last row of a run (or a lone point) carries one below as well:
 * the `Adjustable` holder around a row is `display: contents`, so a `divide-y` on the run's root
 * would put its borders on holders that draw none. A row is one element, which is what the
 * holder wraps, so nudging, selecting and removing act on the row and nothing else. The term and
 * the meaning are runs under the row's own index (`N:label`, `N:text`).
 *
 * `fill` makes the row take its share of a run that fills the body zone, its words centred in it.
 */
export function TermRow({
  index,
  label,
  text,
  textSize,
  expressive,
  last,
  fill = false,
}: {
  index: number
  label: string
  text: string
  /** The meaning's font size, one for the whole run (`termTextSize`). */
  textSize: string
  expressive: boolean
  /** The last row of its run, or a lone point: closes the table with a hairline below. */
  last: boolean
  fill?: boolean
}) {
  return (
    <div
      data-term-row=""
      className={`${ROW_CLASS}${last ? ' border-b' : ''}${fill ? ` ${FILL_CLASS}` : ' items-baseline'}`}
      style={{
        columnGap: SLIDE_GAP.group,
        rowGap: SLIDE_GAP.tight,
        paddingBlock: SLIDE_GAP.tight,
        fontFamily: SLIDE_BODY_FONT,
        fontSize: 'var(--slide-size-body)',
      }}
    >
      <div
        data-term=""
        className="min-w-0 break-words text-slide-accent"
        style={{
          fontFamily: SLIDE_HEADING_FONT,
          fontSize: expressive ? 'var(--slide-size-h2)' : 'var(--slide-size-h3)',
          fontWeight: expressive ? 800 : 600,
          lineHeight: 1.15,
        }}
      >
        <EditableText textRef={textRef(index, 'label')} value={label} />
      </div>
      <div data-term-text="" className="min-w-0 text-slide-foreground/90" style={{ fontSize: textSize }}>
        <EditableText textRef={textRef(index, 'text')} value={text} />
      </div>
    </div>
  )
}

/**
 * A run of points as a table of ruled rows: each point is its own element under its own
 * index (one `Adjustable` per row), a hairline above every row and one below the last, never a box
 * or a fill. The meanings are at one size for the whole run (the lead size for a few short ones,
 * else the body size). No row is the slide's accent owner: the term is accent text, which is
 * free. When it fills the body the rows share the height, their words centred in them. Drawn by
 * `GroupRenderer` for a `rows` group and by the block-by-block frames for a folded point unit.
 */
export function TermRows({
  items,
  expressive,
  fill = false,
}: {
  items: Indexed<PointBlock>[]
  expressive: boolean
  fill?: boolean
}) {
  const textSize = termTextSize(items.map(({ block }) => block.text))
  return (
    <div data-term-rows="" {...(fill ? { 'data-fill': '' } : {})} className={`flex flex-col${fill ? ' flex-1' : ''}`}>
      {items.map(({ block, index }, i) => (
        <Adjustable key={index} index={index}>
          <TermRow
            index={index}
            label={block.label}
            text={block.text}
            textSize={textSize}
            expressive={expressive}
            last={i === items.length - 1}
            fill={fill}
          />
        </Adjustable>
      ))}
    </div>
  )
}
